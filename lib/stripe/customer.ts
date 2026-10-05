import { stripe } from './client';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Find or create the Stripe Customer for a member.
 *
 * `profiles.stripe_customer_id` has a unique constraint and members cannot write
 * it (no RLS policy grants it), so one member maps to exactly one Customer and
 * nobody can attach themselves to somebody else's payment history.
 */
export async function ensureStripeCustomer(userId: string): Promise<string> {
  const supabase = createAdminClient();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email, first_name, last_name, phone')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile) throw new Error('Could not load the member profile.');
  if (profile.stripe_customer_id) return profile.stripe_customer_id;

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');

  const customer = await stripe().customers.create({
    email: profile.email,
    ...(name ? { name } : {}),
    ...(profile.phone ? { phone: profile.phone } : {}),
    // The link back to our user id is what lets a webhook identify the member
    // even if the email later changes.
    metadata: { barre_user_id: userId },
  });

  const { error: saveError } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId);

  if (saveError) {
    throw new Error(
      `Created Stripe customer ${customer.id} but could not save it: ${saveError.message}`,
    );
  }

  return customer.id;
}
