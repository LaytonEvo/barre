/**
 * The booking RPC raises a bare machine token (`session_full`, `waiver_required`)
 * rather than a sentence, so the database never has to know how the site words
 * things — and a message can be reworded without touching SQL.
 *
 * Anything unrecognised becomes a generic apology rather than leaking the
 * database's own text to a member.
 */

export type BookingErrorCode =
  | 'not_signed_in'
  | 'not_allowed'
  | 'session_not_found'
  | 'session_cancelled'
  | 'session_started'
  | 'outside_booking_window'
  | 'waiver_required'
  | 'parq_required'
  | 'already_booked'
  | 'session_full'
  | 'payment_required'
  | 'no_credits_left'
  | 'daily_limit_reached'
  | 'booking_not_found'
  | 'already_cancelled'
  | 'insufficient_credits'
  | 'unknown';

const MESSAGES: Record<BookingErrorCode, string> = {
  not_signed_in: 'Please log in to book a class.',
  not_allowed: 'You can only manage your own bookings.',
  session_not_found: 'We could not find that class.',
  session_cancelled: 'That class has been cancelled.',
  session_started: 'That class has already started.',
  outside_booking_window: 'That class is not open for booking yet. Try again nearer the time.',
  waiver_required: 'Please read and sign the waiver before your first class.',
  parq_required: 'Please answer a few health questions before your first class.',
  already_booked: 'You are already booked onto that class.',
  session_full: 'That class is full — you can join the waitlist instead.',
  payment_required: 'You have no credits left. Have a look at the prices to top up.',
  no_credits_left: 'Your membership has no credits left this month.',
  daily_limit_reached: 'That would be more classes in one day than your membership allows.',
  booking_not_found: 'We could not find that booking.',
  already_cancelled: 'That booking has already been cancelled.',
  insufficient_credits: 'You do not have enough credits for that.',
  unknown: 'Something went wrong. Please try again, or let Kelly know.',
};

const CODES = new Set(Object.keys(MESSAGES));

/** Pull the token out of a Postgres error message. */
export function parseBookingError(error: { message?: string } | null): BookingErrorCode {
  const raw = error?.message ?? '';
  const match = raw.match(/\b([a-z_]+)\b/g)?.find((token) => CODES.has(token));
  return (match as BookingErrorCode) ?? 'unknown';
}

export function bookingErrorMessage(code: BookingErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.unknown;
}

/** Codes where offering the waitlist is the right next step. */
export const OFFER_WAITLIST: ReadonlySet<BookingErrorCode> = new Set(['session_full']);

/** Codes the member can fix by finishing onboarding. */
export const NEEDS_ONBOARDING: ReadonlySet<BookingErrorCode> = new Set([
  'waiver_required',
  'parq_required',
]);

/** Codes the member can fix by buying something. */
export const NEEDS_PAYMENT: ReadonlySet<BookingErrorCode> = new Set([
  'payment_required',
  'no_credits_left',
  'insufficient_credits',
]);
