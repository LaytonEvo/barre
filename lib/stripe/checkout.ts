import { stripe } from './client';
import { ensureStripeCustomer } from './customer';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientEnv } from '@/lib/env';

/**
 * Create a Checkout Session for a paid product.
 *
 * Nothing is fulfilled here. The session is only an intent to pay — the member
 * can close the tab, the card can be declined, the redirect can be forged. The
 * credits are granted by the webhook, from a signature-verified event, and
 * nowhere else. Invariant 5.
 *
 * `barre_user_id` and `barre_product_id` go in the session metadata so the
 * webhook can identify both without trusting anything in the return URL.
 */
export async function createCheckoutSession(
  userId: string,
  productSlug: string,
): Promise<{ url: string }> {
  const supabase = createAdminClient();

  const { data: product } = await supabase
    .from('products')
    .select('id, slug, name, kind, price_pence, stripe_price_id, active')
    .eq('slug', productSlug)
    .maybeSingle();

  if (!product) throw new Error('That product does not exist.');
  if (!product.active) throw new Error('That product is not on sale at the moment.');
  if (product.price_pence === 0) {
    // Guard rather than silently create an uncompletable session: a £0 Checkout
    // cannot be paid, so the member would be stuck on a page that never returns.
    throw new Error('Free products are not bought through Stripe.');
  }
  if (!product.stripe_price_id) {
    throw new Error(`${product.name} has not been synced to Stripe yet.`);
  }

  const customerId = await ensureStripeCustomer(userId);
  const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

  const session = await stripe().checkout.sessions.create({
    mode: product.kind === 'membership' ? 'subscription' : 'payment',
    customer: customerId,
    line_items: [{ price: product.stripe_price_id, quantity: 1 }],

    // payment_method_types is deliberately omitted. Checkout then offers
    // whatever is enabled in the Stripe dashboard, which is how Apple Pay and
    // Google Pay appear on the devices that support them — enumerating methods
    // here would switch that off.
    allow_promotion_codes: true,

    success_url: `${siteUrl}/account/billing?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/pricing?purchase=cancelled`,

    metadata: { barre_user_id: userId, barre_product_id: product.id },
    ...(product.kind === 'membership'
      ? { subscription_data: { metadata: { barre_user_id: userId, barre_product_id: product.id } } }
      : {
          payment_intent_data: {
            metadata: { barre_user_id: userId, barre_product_id: product.id },
          },
        }),
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL.');
  return { url: session.url };
}

/** A Stripe Customer Portal session, for cards, invoices and cancellations. */
export async function createPortalSession(userId: string): Promise<{ url: string }> {
  const customerId = await ensureStripeCustomer(userId);
  const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl}/account/billing`,
  });

  return { url: session.url };
}
