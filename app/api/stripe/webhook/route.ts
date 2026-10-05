import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  handleChargeRefunded,
  handleCheckoutCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionChanged,
} from '@/lib/stripe/fulfilment';

/**
 * The Stripe webhook. The single source of truth for fulfilment.
 *
 * Three things make this safe:
 *
 * 1. The signature is verified against the raw body. Anyone can POST here;
 *    only Stripe can sign.
 * 2. The event id is inserted into `stripe_events` before anything is
 *    fulfilled. The primary key rejects a duplicate, so a retried event is
 *    acknowledged and ignored rather than granting credits twice.
 * 3. A handler that throws leaves `processed_at` null and returns 500, so
 *    Stripe retries. Failing loudly beats a member paying and getting nothing.
 *
 * Testing locally:
 *   stripe listen --forward-to localhost:3000/api/stripe/webhook
 */

// The raw body is needed for signature verification, so this route must not be
// statically analysed or cached.
export const dynamic = 'force-dynamic';

const HANDLED = new Set<Stripe.Event['type']>([
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.refunded',
]);

export async function POST(request: NextRequest) {
  const { STRIPE_WEBHOOK_SECRET } = serverEnv();
  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhooks are not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  // text(), not json(): the signature covers the exact bytes Stripe sent, and
  // parsing first would change them.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    // Do not echo the reason: an attacker probing the endpoint learns nothing.
    console.error('Stripe webhook signature verification failed', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const db = createAdminClient();

  // Claim the event. A duplicate loses on the primary key, which IS the
  // idempotency guard — checking first and inserting after would leave a window
  // where two retries both pass the check.
  const { error: claimError } = await db.from('stripe_events').insert({
    id: event.id,
    type: event.type,
    // Stored whole so a failed fulfilment can be replayed or inspected later
    // without going back to Stripe.
    payload: JSON.parse(rawBody),
  });

  if (claimError) {
    if (claimError.code === '23505') {
      // Already seen. 200 so Stripe stops retrying.
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('Could not record Stripe event', claimError);
    return NextResponse.json({ error: 'Could not record event.' }, { status: 500 });
  }

  if (!HANDLED.has(event.type)) {
    await db
      .from('stripe_events')
      .update({ processed_at: new Date().toISOString(), error: 'ignored: not handled' })
      .eq('id', event.id);
    return NextResponse.json({ received: true, handled: false });
  }

  try {
    let outcome: string;

    switch (event.type) {
      case 'checkout.session.completed':
        outcome = await handleCheckoutCompleted(event.data.object);
        break;
      case 'invoice.paid':
        outcome = await handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        outcome = await handleInvoicePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        outcome = await handleSubscriptionChanged(event.data.object);
        break;
      case 'charge.refunded':
        outcome = await handleChargeRefunded(event.data.object);
        break;
      default:
        outcome = 'unhandled';
    }

    await db
      .from('stripe_events')
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq('id', event.id);

    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Stripe webhook ${event.type} (${event.id}) failed:`, message);

    // processed_at stays null so the failure is visible and Stripe retries.
    await db.from('stripe_events').update({ error: message }).eq('id', event.id);

    return NextResponse.json({ error: 'Fulfilment failed.' }, { status: 500 });
  }
}
