import { stripe } from './client';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Promo codes, synced to Stripe.
 *
 * The discount is applied by Stripe Checkout (`allow_promotion_codes: true`), not
 * by us — which is the only sane division. Re-implementing a discount engine on
 * this side would mean two places that disagree about what £5 off a £25 pack
 * costs, and the one the customer's card believes is Stripe's.
 *
 * So this creates a Coupon (the discount) and a Promotion Code (the string the
 * customer types) and records the ids. Our table is for Kelly to look at and for
 * restricting which products a code applies to; Stripe is the source of truth for
 * whether a given code is valid right now.
 */

export type PromoInput = {
  code: string;
  percentOff?: number;
  amountOffPence?: number;
  maxRedemptions?: number;
  expiresAt?: string;
  restrictedProductIds?: string[];
  description?: string;
};

export async function createPromoCode(input: PromoInput): Promise<{ id: string; code: string }> {
  if (!input.percentOff && !input.amountOffPence) {
    throw new Error('A promo code needs either a percentage or an amount off.');
  }
  if (input.percentOff && input.amountOffPence) {
    // Stripe would reject this anyway, but the message here is clearer than the
    // one that comes back from the API.
    throw new Error('Pick a percentage or an amount, not both.');
  }

  const client = stripe();
  const code = input.code.trim().toUpperCase();

  const coupon = await client.coupons.create({
    name: input.description || code,
    ...(input.percentOff
      ? { percent_off: input.percentOff }
      : { amount_off: input.amountOffPence, currency: 'gbp' }),
    // `once` rather than `forever`: a forever coupon attached to a subscription
    // discounts every future renewal, which is almost never what a promo means.
    duration: 'once',
    ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
    ...(input.expiresAt
      ? { redeem_by: Math.floor(new Date(input.expiresAt).getTime() / 1000) }
      : {}),
  });

  const promotionCode = await client.promotionCodes.create({
    // The pinned API version takes a `promotion` object rather than a bare
    // `coupon` id. Worth noting because every tutorial online still shows
    // `{ coupon }`, which this version silently has no field for.
    promotion: { type: 'coupon', coupon: coupon.id },
    code,
    ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
    ...(input.expiresAt
      ? { expires_at: Math.floor(new Date(input.expiresAt).getTime() / 1000) }
      : {}),
  });

  const db = createAdminClient();
  const { data, error } = await db
    .from('promo_codes')
    .insert({
      code,
      stripe_coupon_id: coupon.id,
      stripe_promotion_code_id: promotionCode.id,
      description: input.description ?? null,
      percent_off: input.percentOff ?? null,
      amount_off_pence: input.amountOffPence ?? null,
      max_redemptions: input.maxRedemptions ?? null,
      expires_at: input.expiresAt ?? null,
      restricted_product_ids: input.restrictedProductIds ?? [],
      active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    // The Stripe objects exist and our row does not. Deactivating the promotion
    // code closes the gap: a code nobody can see in admin but customers could
    // still type would be worse than one that simply does not work.
    await client.promotionCodes.update(promotionCode.id, { active: false }).catch(() => {});
    throw new Error(`Could not record the promo code: ${error?.message}`);
  }

  return { id: data.id, code };
}

/**
 * Deactivating is the only "delete" Stripe offers for a promotion code, and that
 * is the right model anyway: a code that has been used is part of the accounting
 * record and should not vanish.
 */
export async function deactivatePromoCode(id: string): Promise<void> {
  const db = createAdminClient();

  const { data: promo } = await db
    .from('promo_codes')
    .select('stripe_promotion_code_id')
    .eq('id', id)
    .maybeSingle();

  if (!promo) throw new Error('That promo code does not exist.');

  if (promo.stripe_promotion_code_id) {
    await stripe().promotionCodes.update(promo.stripe_promotion_code_id, { active: false });
  }

  const { error } = await db.from('promo_codes').update({ active: false }).eq('id', id);
  if (error) throw new Error(`Could not deactivate: ${error.message}`);
}
