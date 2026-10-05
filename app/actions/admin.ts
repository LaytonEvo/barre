'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * Admin actions.
 *
 * Every one re-establishes the caller's role on the server, and every one then
 * calls a database function that checks the role again. The duplication is
 * deliberate: the UI check decides what to render, the database check decides
 * what is allowed, and only the second one is load-bearing.
 */

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string } | undefined;

function fail(error: { message?: string } | null, fallback: string): AdminResult {
  const raw = error?.message ?? '';
  // The database raises bare tokens; turn the ones a person can act on into
  // sentences and keep the rest generic.
  const known: Record<string, string> = {
    not_allowed: 'You do not have access to do that.',
    reason_required: 'Please give a reason — it goes in the audit log.',
    adjustment_must_be_nonzero: 'That adjustment would change nothing.',
    capacity_below_bookings: 'That is fewer places than are already booked.',
    capacity_must_be_positive: 'Capacity has to be at least one.',
    unknown_setting: 'That setting does not exist.',
    insufficient_credits: 'They do not have that many credits to take away.',
    session_full: 'That class is full.',
    already_booked: 'They are already booked onto that class.',
    waiver_required: 'They need to sign the waiver first.',
    parq_required: 'They need to answer the health questions first.',
    payment_required: 'They have no credits left — add some first, or take payment.',
  };

  for (const [token, message] of Object.entries(known)) {
    if (raw.includes(token)) return { ok: false, error: message };
  }
  return { ok: false, error: fallback };
}

// --- Attendance -------------------------------------------------------------

const attendanceSchema = z.object({
  bookingId: z.string().uuid(),
  status: z.enum(['attended', 'no_show', 'booked']),
});

export async function markAttendance(formData: FormData): Promise<AdminResult> {
  await requireRole('admin', 'instructor');

  const parsed = attendanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Unknown booking.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_attendance', {
    p_booking_id: parsed.data.bookingId,
    p_status: parsed.data.status,
  });

  if (error) return fail(error, 'Could not save that. Please try again.');

  revalidatePath('/admin');
  return { ok: true };
}

// --- Walk-ins ---------------------------------------------------------------

const walkInSchema = z.object({
  sessionId: z.string().uuid(),
  email: z.string().trim().email('Enter a valid email address.').max(200),
});

export async function addWalkIn(formData: FormData): Promise<AdminResult> {
  await requireRole('admin');

  const parsed = walkInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the email address.' };
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name')
    .eq('email', parsed.data.email)
    .maybeSingle();

  if (!profile) {
    // Creating an account on somebody's behalf would mean signing a waiver on
    // their behalf, which is exactly the thing the waiver exists to prevent.
    return {
      ok: false,
      error: 'No account with that email. Ask them to sign up on their phone — it takes a minute.',
    };
  }

  const { error } = await supabase.rpc('book_session', {
    p_session_id: parsed.data.sessionId,
    p_user_id: profile.id,
    p_source: 'walk_in',
  });

  if (error) return fail(error, 'Could not add them to this class.');

  revalidatePath('/admin');
  return { ok: true, message: `${profile.first_name ?? 'They'} are on the register.` };
}

// --- Credits ----------------------------------------------------------------

const adjustSchema = z.object({
  userId: z.string().uuid(),
  delta: z.coerce.number().int().min(-50).max(50),
  reason: z.string().trim().min(3, 'Please give a reason.').max(300),
});

export async function adjustCredits(formData: FormData): Promise<AdminResult> {
  await requireRole('admin');

  const parsed = adjustSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the adjustment.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_adjust_credits', {
    p_user_id: parsed.data.userId,
    p_delta: parsed.data.delta,
    p_reason: parsed.data.reason,
  });

  if (error) return fail(error, 'Could not adjust that balance.');

  revalidatePath('/admin/members');
  return { ok: true, message: `Balance is now ${data}.` };
}

// --- Schedule ---------------------------------------------------------------

const capacitySchema = z.object({
  sessionId: z.string().uuid(),
  capacity: z.coerce.number().int().min(1).max(200),
});

export async function setCapacity(formData: FormData): Promise<AdminResult> {
  await requireRole('admin');

  const parsed = capacitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Capacity has to be a number from 1 to 200.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_session_capacity', {
    p_session_id: parsed.data.sessionId,
    p_capacity: parsed.data.capacity,
  });

  if (error) return fail(error, 'Could not change the capacity.');

  revalidatePath('/admin/schedule');
  return { ok: true, message: 'Capacity updated.' };
}

const cancelSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.string().trim().min(3, 'Please say why — members will see this.').max(300),
});

export async function cancelSession(formData: FormData): Promise<AdminResult> {
  await requireRole('admin');

  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please give a reason.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancel_session', {
    p_session_id: parsed.data.sessionId,
    p_reason: parsed.data.reason,
  });

  if (error) return fail(error, 'Could not cancel that class.');

  revalidatePath('/admin/schedule');
  revalidatePath('/timetable');

  const count = typeof data === 'number' ? data : 0;
  return {
    ok: true,
    message:
      count === 0
        ? 'Class cancelled. Nobody was booked.'
        : `Class cancelled. ${count} ${count === 1 ? 'person has' : 'people have'} had their credit returned.`,
  };
}

// --- Settings ---------------------------------------------------------------

const settingSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.string().max(2000),
});

export async function setSetting(formData: FormData): Promise<AdminResult> {
  await requireRole('admin');

  const parsed = settingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Check that value.' };

  // Settings are jsonb. A bare word is quoted so it stores as a JSON string
  // rather than failing to parse — "forfeit_credit" is a valid value and
  // forfeit_credit is not valid JSON.
  let value: unknown;
  try {
    value = JSON.parse(parsed.data.value);
  } catch {
    value = parsed.data.value;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_setting', {
    p_key: parsed.data.key,
    p_value: value as never,
    p_confirmed: true,
  });

  if (error) return fail(error, 'Could not save that setting.');

  revalidatePath('/admin/settings');
  revalidatePath('/policies/cancellation');
  return { ok: true, message: 'Saved.' };
}
