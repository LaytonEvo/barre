import { createAdminClient } from '@/lib/supabase/admin';

/**
 * The free first class.
 *
 * It costs nothing, so it never goes near Stripe: a £0 Checkout Session cannot
 * be completed, and there is no payment to verify. The credit is granted
 * directly after an eligibility check.
 *
 * That has a consequence worth being explicit about. With no payment there is
 * **no card fingerprint**, so the strongest duplicate check in the brief has
 * nothing to match on. Eligibility rests on account, email and phone, all of
 * which a determined person beats with a second email address. The
 * `intro_offer_claims` table has a unique index on each of those columns
 * independently, so the database refuses a second claim rather than relying on
 * this function to remember — see docs/03 question B4a for the options if it
 * ever actually gets abused.
 */

export type IntroOfferResult =
  | { ok: true; creditsGranted: number }
  | { ok: false; reason: 'already_claimed' | 'unavailable' | 'error'; message: string };

export async function grantIntroOffer(userId: string): Promise<IntroOfferResult> {
  const supabase = createAdminClient();

  const { data: product } = await supabase
    .from('products')
    .select('id, name, credits, validity_days, price_pence, active')
    .eq('kind', 'intro_offer')
    .eq('active', true)
    .order('sort_order')
    .limit(1)
    .maybeSingle();

  if (!product) {
    return { ok: false, reason: 'unavailable', message: 'There is no intro offer at the moment.' };
  }
  if (product.price_pence > 0) {
    // A paid intro offer must go through Checkout so the money is actually taken.
    return {
      ok: false,
      reason: 'unavailable',
      message: 'The intro offer is no longer free — please use checkout.',
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email_normalised, phone_normalised')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) {
    return { ok: false, reason: 'error', message: 'Could not load your profile.' };
  }

  // The insert IS the check. Doing it first means two simultaneous requests
  // cannot both pass a "have you claimed?" query and both grant a credit — one
  // of them loses on the unique index.
  const { error: claimError } = await supabase.from('intro_offer_claims').insert({
    user_id: userId,
    product_id: product.id,
    email_normalised: profile.email_normalised,
    phone_normalised: profile.phone_normalised,
  });

  if (claimError) {
    if (claimError.code === '23505') {
      return {
        ok: false,
        reason: 'already_claimed',
        message: 'It looks like you have already had your free class. Welcome back!',
      };
    }
    return { ok: false, reason: 'error', message: 'Could not claim the free class.' };
  }

  const expiresAt = product.validity_days
    ? new Date(Date.now() + product.validity_days * 86_400_000).toISOString()
    : null;

  const { error: grantError } = await supabase.rpc('grant_credits', {
    p_user_id: userId,
    p_quantity: product.credits ?? 1,
    p_kind: 'purchase',
    p_expires_at: expiresAt,
    p_reason: product.name,
  });

  if (grantError) {
    // The claim is recorded but the credit is not. Surfacing this rather than
    // swallowing it matters: the member is owed a class and somebody must know.
    return {
      ok: false,
      reason: 'error',
      message: 'Your free class could not be added. Please contact Kelly and she will sort it.',
    };
  }

  return { ok: true, creditsGranted: product.credits ?? 1 };
}
