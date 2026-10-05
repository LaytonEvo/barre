'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Newsletter sign-up.
 *
 * Consent is the point of this table, not the address: `consent_at` records
 * when someone actively asked to hear from us, which is what UK GDPR and PECR
 * require us to be able to show. Sign-up is never bundled with anything else.
 *
 * At M8 this syncs to an email platform through an adapter. Storing it here
 * first means the list is ours and the switch is a background job, not a
 * migration.
 */

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(200),
  source: z.string().max(60).optional(),
  website: z.string().max(0).optional(), // honeypot
});

export type NewsletterResult = { ok: true } | { ok: false; error: string } | undefined;

export async function subscribeToNewsletter(formData: FormData): Promise<NewsletterResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check your email.' };
  }

  if (parsed.data.website) return { ok: true };

  // A public write path, so rate limited per IP with a global backstop. Someone
  // signing a friend up repeatedly is the benign case; a bot filling the list with
  // addresses that will later bounce is the one that damages the sending domain.
  const limit = await checkRateLimit('newsletter', 3);
  if (!limit.allowed) {
    return { ok: false, error: 'Please wait a little while before trying again.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('newsletter_subscribers').insert({
    email: parsed.data.email,
    source: parsed.data.source ?? 'website',
  });

  // A duplicate is not a failure from the subscriber's point of view — they
  // asked to be on the list and they are on the list. Telling them "already
  // subscribed" also leaks who is on it to anyone who cares to probe.
  if (error && !error.message.toLowerCase().includes('duplicate')) {
    return { ok: false, error: 'Something went wrong. Please try again shortly.' };
  }

  return { ok: true };
}
