import { z } from 'zod';
import { stripe } from './client';
import { ensureStripeCustomer } from './customer';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientEnv } from '@/lib/env';

/**
 * Buying a gift voucher.
 *
 * A separate path from `createCheckoutSession` because the gift details — who it
 * is for, what it says, when to send it — have to survive the round trip to
 * Stripe and come back on a signature-verified event. They go in the session
 * metadata, which is the only part of a returning Checkout session that can be
 * trusted.
 *
 * Stripe metadata values are limited to 500 characters each and 50 keys, which is
 * why the message is bounded here rather than wherever it is typed.
 */

export const giftSchema = z.object({
  productSlug: z.string().min(1),
  recipientName: z.string().max(100).optional(),
  recipientEmail: z.string().email(),
  message: z.string().max(450).optional(),
  /** ISO date (yyyy-mm-dd). Empty means send as soon as it is paid for. */
  sendOn: z.string().optional(),
});

export type GiftInput = z.infer<typeof giftSchema>;

export async function createGiftCheckoutSession(
  purchaserId: string,
  input: GiftInput,
): Promise<{ url: string }> {
  const supabase = createAdminClient();

  const { data: product } = await supabase
    .from('products')
    .select('id, slug, name, kind, price_pence, stripe_price_id, active, credits')
    .eq('slug', input.productSlug)
    .maybeSingle();

  if (!product) throw new Error('That gift does not exist.');
  if (!product.active) throw new Error('That gift is not available at the moment.');
  if (product.kind === 'membership') {
    // A gifted subscription would renew against the buyer's card indefinitely,
    // which is not what anyone means by a present.
    throw new Error('Memberships cannot be given as a gift — a pack can.');
  }
  if (!product.stripe_price_id) {
    throw new Error(`${product.name} has not been synced to Stripe yet.`);
  }

  // A send date is a date, not an instant. 9am UK is a reasonable time for a
  // present to land: early enough to be the first thing read, not 3am.
  let sendAt = new Date().toISOString();
  if (input.sendOn) {
    const parsed = new Date(`${input.sendOn}T09:00:00`);
    if (Number.isNaN(parsed.getTime())) throw new Error('That send date does not look right.');
    sendAt = parsed.toISOString();
  }

  const customerId = await ensureStripeCustomer(purchaserId);
  const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

  const metadata: Record<string, string> = {
    barre_user_id: purchaserId,
    barre_product_id: product.id,
    barre_gift: '1',
    barre_gift_email: input.recipientEmail,
    barre_gift_send_at: sendAt,
    ...(input.recipientName ? { barre_gift_name: input.recipientName } : {}),
    ...(input.message ? { barre_gift_message: input.message } : {}),
  };

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{ price: product.stripe_price_id, quantity: 1 }],
    allow_promotion_codes: true,

    success_url: `${siteUrl}/gift/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/gift?cancelled=1`,

    metadata,
    payment_intent_data: { metadata },
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL.');
  return { url: session.url };
}
