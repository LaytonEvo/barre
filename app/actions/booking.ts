'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import {
  bookingErrorMessage,
  parseBookingError,
  type BookingErrorCode,
} from '@/lib/booking/errors';

/**
 * Booking actions.
 *
 * Every one calls the database function and lets it do the deciding. None of the
 * gates — waiver, PAR-Q, capacity, booking window, entitlement — is re-checked
 * here, because a check in TypeScript is a check an attacker skips by calling
 * the RPC directly. This layer translates tokens into sentences and nothing more.
 *
 * The client runs as the member, so RLS applies on top of the function's own
 * `auth.uid()` checks.
 */

export type BookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; code: BookingErrorCode; message: string }
  | undefined;

export type CancelResult =
  | { ok: true; outcome: 'cancelled_in_window' | 'cancelled_late'; creditReturned: boolean }
  | { ok: false; code: BookingErrorCode; message: string }
  | undefined;

export type WaitlistResult =
  | { ok: true; position: number }
  | { ok: false; code: BookingErrorCode; message: string }
  | undefined;

const idSchema = z.object({ id: z.string().uuid('Unknown class.') });

function failure(error: { message?: string } | null) {
  const code = parseBookingError(error);
  return { ok: false as const, code, message: bookingErrorMessage(code) };
}

export async function bookSession(formData: FormData): Promise<BookingResult> {
  await requireUser();
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure({ message: 'session_not_found' });

  const supabase = await createClient();

  // p_user_id is deliberately omitted: the function defaults to auth.uid(), so
  // there is no parameter here that could be pointed at somebody else.
  const { data, error } = await supabase.rpc('book_session', {
    p_session_id: parsed.data.id,
  });

  if (error) return failure(error);

  revalidatePath('/timetable');
  revalidatePath('/account');
  return { ok: true, bookingId: data as unknown as string };
}

export async function cancelBooking(formData: FormData): Promise<CancelResult> {
  await requireUser();
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure({ message: 'booking_not_found' });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancel_booking', {
    p_booking_id: parsed.data.id,
  });

  if (error) return failure(error);

  const row = Array.isArray(data) ? data[0] : data;

  revalidatePath('/timetable');
  revalidatePath('/account');
  return {
    ok: true,
    outcome: row?.outcome ?? 'cancelled_in_window',
    creditReturned: row?.credit_returned ?? false,
  };
}

export async function joinWaitlist(formData: FormData): Promise<WaitlistResult> {
  await requireUser();
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure({ message: 'session_not_found' });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('join_waitlist', {
    p_session_id: parsed.data.id,
  });

  if (error) return failure(error);

  revalidatePath('/timetable');
  revalidatePath('/account');
  return { ok: true, position: (data as unknown as number) ?? 1 };
}

export async function leaveWaitlist(formData: FormData): Promise<WaitlistResult> {
  await requireUser();
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure({ message: 'session_not_found' });

  const supabase = await createClient();
  const { error } = await supabase.rpc('leave_waitlist', { p_session_id: parsed.data.id });

  if (error) return failure(error);

  revalidatePath('/timetable');
  revalidatePath('/account');
  return { ok: true, position: 0 };
}
