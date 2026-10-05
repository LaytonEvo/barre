'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

export type OnboardingResult = { error: string } | undefined;

/**
 * Erasure, requested by the member themselves.
 *
 * The database function decides what survives and what goes — health data
 * deleted, accounting records anonymised, the signed waiver kept for its
 * retention period. That reasoning belongs in one place, not duplicated here.
 */
export async function deleteMyAccount(formData: FormData): Promise<OnboardingResult> {
  const user = await requireUser('/account/privacy');

  const parsed = z.object({ confirm: z.string() }).safeParse(Object.fromEntries(formData));

  if (!parsed.success || parsed.data.confirm.trim().toUpperCase() !== 'DELETE') {
    return { error: 'Please type DELETE to confirm.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('anonymise_member', {
    p_user_id: user.id,
    p_reason: 'requested by the member',
  });

  if (error) {
    console.error('Account erasure failed', error);
    return { error: 'We could not complete that. Please email Kelly and she will sort it.' };
  }

  await supabase.auth.signOut();
  redirect('/?deleted=1');
}
