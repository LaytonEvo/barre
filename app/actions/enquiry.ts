'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Enquiry submission.
 *
 * Anonymous visitors may insert into `enquiries` (RLS permits it), so this is a
 * public write path and gets treated as one: validated with Zod, length-capped,
 * and with a honeypot — and now rate limited per IP with a global backstop,
 * because a honeypot stops a naive bot and nothing else.
 */

const schema = z.object({
  kind: z.enum(['contact', 'private_session', 'event', 'corporate']).default('contact'),
  name: z.string().trim().min(1, 'Please tell us your name.').max(120),
  email: z.string().trim().email('Enter a valid email address.').max(200),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(10, 'A little more detail would help.').max(4000),
  // Hidden field. A human never fills this in.
  website: z.string().max(0).optional(),
});

export type EnquiryResult = { ok: true } | { ok: false; error: string } | undefined;

export async function submitEnquiry(formData: FormData): Promise<EnquiryResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }

  // Honeypot filled: accept silently, so the bot does not learn it was caught.
  if (parsed.data.website) return { ok: true };

  // Checked AFTER validation and the honeypot, so malformed and obviously-bot
  // submissions do not consume a real person's allowance.
  const limit = await checkRateLimit('enquiries', 5);
  if (!limit.allowed) {
    return {
      ok: false,
      error:
        'That is a lot of messages in a short time. Please wait a little while, or email Kelly directly.',
    };
  }

  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const sourceIp = forwarded?.split(',')[0]?.trim() ?? null;

  const supabase = await createClient();
  const { error } = await supabase.from('enquiries').insert({
    kind: parsed.data.kind,
    name: parsed.data.name,
    email: parsed.data.email,
    message: parsed.data.message,
    ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
    ...(sourceIp ? { source_ip: sourceIp } : {}),
  });

  if (error) {
    // Don't surface the database message: it can leak schema detail.
    return { ok: false, error: 'Something went wrong sending that. Please try again shortly.' };
  }

  return { ok: true };
}
