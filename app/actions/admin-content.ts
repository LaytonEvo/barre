'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { hashWaiverBody } from '@/lib/onboarding/waiver';

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string } | undefined;

const waiverSchema = z.object({
  versionLabel: z.string().trim().min(1, 'Give it a version label.').max(60),
  body: z.string().trim().min(200, 'That looks too short to be the full agreement.').max(60_000),
  reviewed: z.literal('on', { message: 'Please confirm the wording has been reviewed.' }),
});

/**
 * Publish a new waiver version.
 *
 * The hash is computed here and verified by the database against the body it is
 * storing, so a mismatch between the text and the hash recorded against it is
 * impossible — that hash is what proves, years later, exactly what was agreed.
 */
export async function publishWaiver(formData: FormData): Promise<AdminResult> {
  await requireRole('admin');

  const parsed = waiverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc('publish_waiver_version', {
    p_version_label: parsed.data.versionLabel,
    p_body_markdown: parsed.data.body,
    p_body_sha256: hashWaiverBody(parsed.data.body),
  });

  if (error) {
    if (error.message.includes('waiver_hash_mismatch')) {
      return { ok: false, error: 'The text could not be verified. Please try again.' };
    }
    if (error.message.includes('not_allowed')) {
      return { ok: false, error: 'You do not have access to publish a waiver.' };
    }
    if (error.message.includes('duplicate')) {
      return { ok: false, error: 'There is already a version with that label.' };
    }
    console.error('Waiver publish failed', error);
    return { ok: false, error: 'Could not publish that version.' };
  }

  revalidatePath('/admin/content');
  revalidatePath('/account/waiver');

  return {
    ok: true,
    message: `Published ${parsed.data.versionLabel}. Members will be asked to sign it before their next class.`,
  };
}
