import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Fulfilment: the only code that turns money into credits.
 *
 * Every function here is called from a signature-verified webhook and from
 * nowhere else. A Checkout redirect is not proof of payment — the member can
 * close the tab before it fires, and the URL can be typed by hand — so nothing
 * on the success page grants anything.
 *
 * All of it must be safe to run twice: Stripe retries, and will deliver the
 * same event again after a timeout.
 */

type Db = ReturnType<typeof createAdminClient>;

/** Resolve our user id from the event, falling back to the Customer record. */
async function resolveUserId(
  db: Db,
  metadata: Stripe.Metadata | null,
  customerId: string | null,
): Promise<string | null> {
  const fromMetadata = metadata?.barre_user_id;
  if (fromMetadata) return fromMetadata;

  if (!customerId) return null;
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  return data?.id ?? null;
}

const asId = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null);

/**
 * A one-off purchase completed: drop-in or a class pack.
 */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<string> {
  const db = createAdminClient();

  // Stripe sends the event for unpaid sessions too (e.g. bank debits pending).
  if (session.payment_status !== 'paid' && session.mode !== 'subscription') {
    return `checkout ${session.id} is ${session.payment_status}, nothing to fulfil yet`;
  }

  const userId = await resolveUserId(db, session.metadata, asId(session.customer));
  const productId = session.metadata?.barre_product_id;

  if (!userId || !productId) {
    throw new Error(`checkout ${session.id} has no barre_user_id / barre_product_id metadata`);
  }

  // Subscriptions are fulfilled by invoice.paid, which also covers renewals.
  if (session.mode === 'subscription') {
    return `checkout ${session.id} is a subscription; waiting for invoice.paid`;
  }

  // A gift goes to somebody else, so the credits must NOT land on the buyer's
  // account. Handled on its own path, before the credit grant below.
  if (session.metadata?.barre_gift === '1') {
    return fulfilGift(db, session, userId, productId);
  }

  // Idempotency beyond the event table: the unique index on
  // stripe_checkout_session_id means a replayed event cannot create a second
  // purchase even if the events table were somehow cleared.
  const { data: existing } = await db
    .from('purchases')
    .select('id')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle();

  if (existing) return `checkout ${session.id} already fulfilled`;

  const { data: product } = await db
    .from('products')
    .select('id, name, credits, validity_days, kind')
    .eq('id', productId)
    .maybeSingle();

  if (!product) throw new Error(`checkout ${session.id} references unknown product ${productId}`);

  const { data: purchase, error: purchaseError } = await db
    .from('purchases')
    .insert({
      user_id: userId,
      product_id: product.id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: asId(session.payment_intent),
      amount_pence: session.amount_total ?? 0,
      discount_pence: session.total_details?.amount_discount ?? 0,
      status: 'paid',
      purchased_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (purchaseError || !purchase) {
    throw new Error(`could not record purchase for ${session.id}: ${purchaseError?.message}`);
  }

  if (!product.credits) {
    return `purchase ${purchase.id} recorded; product grants no credits`;
  }

  const expiresAt = product.validity_days
    ? new Date(Date.now() + product.validity_days * 86_400_000).toISOString()
    : null;

  const { error: grantError } = await db.rpc('grant_credits', {
    p_user_id: userId,
    p_quantity: product.credits,
    p_kind: 'purchase',
    p_expires_at: expiresAt,
    p_purchase_id: purchase.id,
    p_reason: product.name,
  });

  if (grantError) {
    throw new Error(`purchase ${purchase.id} recorded but credits failed: ${grantError.message}`);
  }

  return `granted ${product.credits} credits for purchase ${purchase.id}`;
}

/**
 * Fulfil a gift purchase: record it, mint the voucher, tell the buyer.
 *
 * The recipient is NOT emailed here. Their email is driven by `send_at` from the
 * voucher cron, because the whole point of a scheduled gift is that it arrives on
 * the right day — and a voucher bought on the 3rd for the 25th must not appear in
 * their inbox on the 3rd.
 *
 * The one exception is a gift with no date, which `create_voucher` clamps to now;
 * the cron then picks it up on its next pass, within minutes.
 */
async function fulfilGift(
  db: ReturnType<typeof createAdminClient>,
  session: Stripe.Checkout.Session,
  purchaserId: string,
  productId: string,
): Promise<string> {
  const { data: existing } = await db
    .from('purchases')
    .select('id')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle();

  if (existing) return `gift checkout ${session.id} already fulfilled`;

  const { data: product } = await db
    .from('products')
    .select('id, name, kind, credits')
    .eq('id', productId)
    .maybeSingle();

  if (!product) throw new Error(`gift checkout ${session.id} references unknown product`);

  const { data: purchase, error: purchaseError } = await db
    .from('purchases')
    .insert({
      user_id: purchaserId,
      product_id: product.id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: asId(session.payment_intent),
      amount_pence: session.amount_total ?? 0,
      discount_pence: session.total_details?.amount_discount ?? 0,
      status: 'paid',
      purchased_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (purchaseError || !purchase) {
    throw new Error(`could not record gift purchase for ${session.id}: ${purchaseError?.message}`);
  }

  const recipientEmail = session.metadata?.barre_gift_email;
  if (!recipientEmail) {
    throw new Error(`gift checkout ${session.id} has no recipient email in metadata`);
  }

  const sendAt = session.metadata?.barre_gift_send_at ?? new Date().toISOString();

  // A pack gift carries the pack's credits; anything else is treated as monetary
  // and converted at the current class price inside create_voucher.
  const isPack = product.kind === 'pack' && (product.credits ?? 0) > 0;

  const { data: voucher, error: voucherError } = await db.rpc('create_voucher', {
    p_kind: isPack ? 'pack' : 'monetary',
    p_recipient_email: recipientEmail,
    p_recipient_name: session.metadata?.barre_gift_name ?? null,
    p_message: session.metadata?.barre_gift_message ?? null,
    p_send_at: sendAt,
    p_purchaser_id: purchaserId,
    p_purchase_id: purchase.id,
    p_value_pence: isPack ? null : (session.amount_total ?? 0),
    p_product_id: isPack ? product.id : null,
  });

  const created = voucher?.[0];
  if (voucherError || !created) {
    // The money is taken and no voucher exists, so this must fail loudly: the
    // webhook returns 500 and Stripe retries, and the purchase row above is
    // deduped by its session id so a retry does not double-charge anything.
    throw new Error(
      `gift purchase ${purchase.id} recorded but voucher failed: ${voucherError?.message}`,
    );
  }

  // Confirmation to the buyer, so they know it is in hand and when it will land.
  await db.rpc('enqueue_notification', {
    p_user_id: purchaserId,
    p_template: 'voucher_purchased',
    p_subject_type: 'voucher',
    p_subject_id: created.voucher_id,
    p_payload: {
      recipientEmail,
      description: `${created.credits} ${created.credits === 1 ? 'class' : 'classes'}`,
      sendAt: new Date(sendAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      alreadySent: new Date(sendAt).getTime() <= Date.now(),
    },
  });

  return `gift voucher ${created.code} created for purchase ${purchase.id}`;
}

/**
 * A subscription invoice was paid: first period or a renewal.
 *
 * Each billing period grants its allowance once. The period start is the
 * idempotency key, so a retried event for the same period does not double-grant.
 */
export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<string> {
  const db = createAdminClient();

  const subscriptionId =
    'subscription' in invoice ? asId(invoice.subscription as string | { id: string } | null) : null;
  if (!subscriptionId) return `invoice ${invoice.id} is not for a subscription`;

  const { data: membership } = await db
    .from('memberships')
    .select('id, user_id, product_id, current_period_start')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!membership) return `invoice ${invoice.id}: no membership for ${subscriptionId} yet`;

  const periodStart = invoice.period_start
    ? new Date(invoice.period_start * 1000).toISOString()
    : null;

  const { data: alreadyGranted } = await db
    .from('credit_ledger')
    .select('id')
    .eq('membership_id', membership.id)
    .eq('kind', 'membership_grant')
    .gte('created_at', periodStart ?? new Date(0).toISOString())
    .limit(1)
    .maybeSingle();

  if (alreadyGranted) return `invoice ${invoice.id}: this period is already granted`;

  const { data: product } = await db
    .from('products')
    .select('name, credits_per_period, is_unlimited, rollover_cap')
    .eq('id', membership.product_id)
    .maybeSingle();

  await db
    .from('memberships')
    .update({
      status: 'active',
      // Paying clears any dunning grace period.
      grace_until: null,
      ...(periodStart ? { current_period_start: periodStart } : {}),
      ...(invoice.period_end
        ? { current_period_end: new Date(invoice.period_end * 1000).toISOString() }
        : {}),
    })
    .eq('id', membership.id);

  // An unlimited membership grants no credits — entitlement is the subscription
  // itself, guarded by max_bookings_per_day.
  if (!product?.credits_per_period || product.is_unlimited) {
    return `invoice ${invoice.id}: membership renewed, no credit grant needed`;
  }

  const { error } = await db.rpc('grant_credits', {
    p_user_id: membership.user_id,
    p_quantity: product.credits_per_period,
    p_kind: 'membership_grant',
    // Credits expire at the end of the period they were granted for, unless
    // rollover is configured — the policy setting decides, not this code.
    p_expires_at: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
    p_membership_id: membership.id,
    p_reason: product.name ?? 'Membership',
  });

  if (error) throw new Error(`invoice ${invoice.id}: credit grant failed: ${error.message}`);

  return `granted ${product.credits_per_period} membership credits`;
}

/**
 * Payment failed. Start the grace period rather than blocking immediately —
 * a card expiring is not a reason to lock somebody out of Thursday's class.
 */
export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<string> {
  const db = createAdminClient();

  const subscriptionId =
    'subscription' in invoice ? asId(invoice.subscription as string | { id: string } | null) : null;
  if (!subscriptionId) return `invoice ${invoice.id} is not for a subscription`;

  const { data: setting } = await db
    .from('settings')
    .select('value')
    .eq('key', 'membership_grace_period_days')
    .maybeSingle();

  const graceDays = typeof setting?.value === 'number' ? setting.value : 7;
  const graceUntil = new Date(Date.now() + graceDays * 86_400_000).toISOString();

  const { error } = await db
    .from('memberships')
    .update({ status: 'past_due', grace_until: graceUntil })
    .eq('stripe_subscription_id', subscriptionId);

  if (error) throw new Error(`could not set grace period: ${error.message}`);

  return `membership past_due, booking allowed until ${graceUntil}`;
}

/** Subscription created, changed or cancelled. */
export async function handleSubscriptionChanged(
  subscription: Stripe.Subscription,
): Promise<string> {
  const db = createAdminClient();

  const userId = await resolveUserId(db, subscription.metadata, asId(subscription.customer));
  const productId = subscription.metadata?.barre_product_id;
  if (!userId || !productId) {
    throw new Error(`subscription ${subscription.id} has no barre metadata`);
  }

  const status: string =
    subscription.status === 'canceled'
      ? 'cancelled'
      : subscription.status === 'unpaid'
        ? 'past_due'
        : subscription.status;

  const item = subscription.items.data[0];

  const { error } = await db.from('memberships').upsert(
    {
      user_id: userId,
      product_id: productId,
      stripe_subscription_id: subscription.id,
      status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      ...(item?.current_period_start
        ? { current_period_start: new Date(item.current_period_start * 1000).toISOString() }
        : {}),
      ...(item?.current_period_end
        ? { current_period_end: new Date(item.current_period_end * 1000).toISOString() }
        : {}),
      ...(subscription.canceled_at
        ? { cancelled_at: new Date(subscription.canceled_at * 1000).toISOString() }
        : {}),
    },
    { onConflict: 'stripe_subscription_id' },
  );

  if (error) throw new Error(`could not upsert membership: ${error.message}`);
  return `membership ${subscription.id} is now ${status}`;
}

/**
 * A charge was refunded.
 *
 * The credits are taken back as a ledger entry rather than by deleting the
 * grant — the ledger is append-only, and the history of "bought then refunded"
 * is exactly what an accountant needs to see.
 */
export async function handleChargeRefunded(charge: Stripe.Charge): Promise<string> {
  const db = createAdminClient();

  const paymentIntentId = asId(charge.payment_intent);
  if (!paymentIntentId) return `charge ${charge.id} has no payment intent`;

  const { data: purchase } = await db
    .from('purchases')
    .select('id, user_id, amount_pence, refunded_pence')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();

  if (!purchase) return `charge ${charge.id}: no matching purchase`;

  const refunded = charge.amount_refunded;
  const fullyRefunded = refunded >= purchase.amount_pence;

  await db
    .from('purchases')
    .update({
      refunded_pence: refunded,
      status: fullyRefunded ? 'refunded' : 'partially_refunded',
      refunded_at: new Date().toISOString(),
    })
    .eq('id', purchase.id);

  // Reclaim whatever of the granted credits is left. Deliberately NOT an error
  // when the member has already used them — Kelly refunding a class somebody
  // took is her decision, and the ledger simply records what remains.
  const { data: granted } = await db
    .from('credit_ledger')
    .select('id, delta')
    .eq('purchase_id', purchase.id)
    .gt('delta', 0);

  const toReclaim = (granted ?? []).reduce((sum, row) => sum + row.delta, 0);

  if (toReclaim > 0) {
    const { error } = await db.rpc('consume_credits', {
      p_user_id: purchase.user_id,
      p_quantity: toReclaim,
      p_kind: 'admin_adjustment',
      p_reason: `Refunded (Stripe charge ${charge.id})`,
    });

    if (error) {
      return `purchase ${purchase.id} marked refunded; credits already spent, nothing to reclaim`;
    }
  }

  return `purchase ${purchase.id} refunded`;
}
