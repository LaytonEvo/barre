import { describe, expect, it } from 'vitest';
import {
  NEEDS_ONBOARDING,
  NEEDS_PAYMENT,
  OFFER_WAITLIST,
  bookingErrorMessage,
  parseBookingError,
} from '@/lib/booking/errors';

/**
 * The database raises a bare token; the member must never see it. These check
 * the translation, and that an unrecognised failure degrades to an apology
 * rather than leaking Postgres' own wording.
 */
describe('parseBookingError', () => {
  it('finds the token inside a wrapped Postgres message', () => {
    expect(parseBookingError({ message: 'session_full' })).toBe('session_full');
    expect(
      parseBookingError({ message: 'ERROR:  waiver_required\nCONTEXT: PL/pgSQL function' }),
    ).toBe('waiver_required');
  });

  it('falls back to unknown for anything unrecognised', () => {
    expect(parseBookingError({ message: 'deadlock detected' })).toBe('unknown');
    expect(parseBookingError({ message: '' })).toBe('unknown');
    expect(parseBookingError(null)).toBe('unknown');
  });

  it('never surfaces raw database text to a member', () => {
    const leaky = 'duplicate key value violates unique constraint "bookings_pkey"';
    const message = bookingErrorMessage(parseBookingError({ message: leaky }));
    expect(message).not.toContain('constraint');
    expect(message).not.toContain('bookings_pkey');
  });
});

describe('bookingErrorMessage', () => {
  it('writes every message in plain English, with no tokens left in', () => {
    const codes = [
      'session_full',
      'waiver_required',
      'parq_required',
      'payment_required',
      'already_booked',
      'session_started',
      'outside_booking_window',
      'daily_limit_reached',
      'unknown',
    ] as const;

    for (const code of codes) {
      const message = bookingErrorMessage(code);
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toContain('_');
      expect(message[0]).toBe(message[0]!.toUpperCase());
    }
  });

  it('tells a member what to do about a full class', () => {
    expect(bookingErrorMessage('session_full')).toContain('waitlist');
  });
});

describe('recovery routes', () => {
  it('offers the waitlist exactly when the class is full', () => {
    expect(OFFER_WAITLIST.has('session_full')).toBe(true);
    expect(OFFER_WAITLIST.has('payment_required')).toBe(false);
  });

  it('sends a member to onboarding when the gate is what blocked them', () => {
    expect(NEEDS_ONBOARDING.has('waiver_required')).toBe(true);
    expect(NEEDS_ONBOARDING.has('parq_required')).toBe(true);
    expect(NEEDS_ONBOARDING.has('session_full')).toBe(false);
  });

  it('sends a member to pricing when they are simply out of credits', () => {
    expect(NEEDS_PAYMENT.has('payment_required')).toBe(true);
    expect(NEEDS_PAYMENT.has('no_credits_left')).toBe(true);
    expect(NEEDS_PAYMENT.has('waiver_required')).toBe(false);
  });

  it('keeps the three recovery sets from overlapping', () => {
    // A code in two sets would mean two different suggested next steps.
    for (const code of OFFER_WAITLIST) {
      expect(NEEDS_PAYMENT.has(code)).toBe(false);
      expect(NEEDS_ONBOARDING.has(code)).toBe(false);
    }
    for (const code of NEEDS_ONBOARDING) expect(NEEDS_PAYMENT.has(code)).toBe(false);
  });
});
