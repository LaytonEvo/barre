'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Enquiry submission.
 *
 * Anonymous visitors may insert into `enquiries` (RLS permits it), so this is a
 * public write path and gets treated as one: validated with Zod, length-capped,
 * and with a honeypot. Proper rate limiting lands with the other public forms at
 * M8; the honeypot stops the simplest bots in the meantime.
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
