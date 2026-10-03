import { describe, expect, it } from 'vitest';
import {
  availabilityState,
  bookingWindowCloses,
  cancellationOutcome,
  cancellationPolicyText,
  hoursUntil,
  isBookable,
  waitlistMode,
} from '@/lib/policy/rules';
import type { Policy } from '@/lib/policy/schema';

/** A policy fixture. Values chosen to be distinctive, not realistic. */
const base: Policy = {
  cancellation_window_hours: 12,
  late_cancel_penalty: 'forfeit_credit',
  late_cancel_fee_pence: 500,
  no_show_penalty: 'forfeit_credit',
  no_show_auto_mark_mins: 30,
  no_show_auto_mark_requires_confirmation: true,
  booking_window_days: 14,
  waitlist_cutoff_hours: 2,
  session_generation_weeks_ahead: 8,
  credit_expiry_warning_days: [7, 1],
  membership_credit_rollover: 'expire',
  membership_rollover_cap: 0,
  membership_grace_period_days: 7,
  reminder_offsets_hours: [24, 2],
  intro_offer_block_on_card_fingerprint: true,
  pack_holders_get_video_access: false,
  vat_registered: false,
  currency: 'GBP',
  class_cancelled_default_remedy: 'refund',
  business_name: 'Barre By Kelly',
  contact_email: '',
  contact_phone: '',
  instagram_handle: '',
  facebook_url: '',
  primary_town: '',
  feature_sms_enabled: false,
  feature_waitlist_enabled: true,
  feature_vouchers_enabled: true,
};

const NOW = new Date('2026-10-05T09:00:00Z');
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe('hoursUntil', () => {
  it('measures forwards from now', () => {
    expect(hoursUntil(inHours(13), NOW)).toBe(13);
  });

  it('goes negative once the class has started', () => {
    expect(hoursUntil(inHours(-1), NOW)).toBe(-1);
  });
});

describe('cancellationOutcome', () => {
  it('returns the credit when cancelling outside the window', () => {
    const result = cancellationOutcome(base, inHours(13), NOW, 'credit');
    expect(result.inWindow).toBe(true);
    expect(result.creditOutcome).toBe('returned');
    expect(result.feePence).toBe(0);
    expect(result.warning).toBeNull();
  });

  it('treats the window boundary as outside it, so the member is not penalised', () => {
    // Exactly 12 hours before a 12-hour window. Favouring the member here is a
    // deliberate choice: an off-by-one that charges someone is worse than one
    // that does not.
    const result = cancellationOutcome(base, inHours(12), NOW, 'credit');
    expect(result.inWindow).toBe(true);
    expect(result.creditOutcome).toBe('returned');
  });

  it('forfeits the credit a minute inside the window', () => {
    const result = cancellationOutcome(base, inHours(11.98), NOW, 'credit');
    expect(result.inWindow).toBe(false);
    expect(result.creditOutcome).toBe('forfeited');
    expect(result.warning).toContain('12 hours');
  });

  it('never forfeits a credit a membership holder does not have', () => {
    const result = cancellationOutcome(base, inHours(1), NOW, 'membership');
    expect(result.creditOutcome).toBe('none');
    expect(result.feePence).toBe(0);
  });

  it('charges the configured fee when the penalty is a fee', () => {
    const policy = { ...base, late_cancel_penalty: 'fee' as const };
    const result = cancellationOutcome(policy, inHours(1), NOW, 'credit');
    expect(result.feePence).toBe(500);
    // A fee policy does not also eat the credit.
    expect(result.creditOutcome).toBe('returned');
  });

  it('applies no penalty at all when the policy says none', () => {
    const policy = { ...base, late_cancel_penalty: 'none' as const };
    const result = cancellationOutcome(policy, inHours(1), NOW, 'credit');
    expect(result.creditOutcome).toBe('returned');
    expect(result.feePence).toBe(0);
    expect(result.warning).toBeNull();
  });

  it('warns before confirming whenever there is something to lose', () => {
    const result = cancellationOutcome(base, inHours(2), NOW, 'credit');
    expect(result.warning).not.toBeNull();
  });
});

describe('booking window', () => {
  it('closes booking_window_days ahead', () => {
    expect(bookingWindowCloses(base, NOW).toISOString()).toBe('2026-10-19T09:00:00.000Z');
  });

  it('accepts a session inside the window', () => {
    expect(isBookable(base, inHours(24), NOW)).toBe(true);
  });

  it('rejects a session beyond the window', () => {
    expect(isBookable(base, inHours(24 * 15), NOW)).toBe(false);
  });

  it('rejects a session that has already started', () => {
    expect(isBookable(base, inHours(-0.1), NOW)).toBe(false);
  });
});

describe('waitlistMode', () => {
  it('auto-promotes while there is time for the member to get there', () => {
    expect(waitlistMode(base, inHours(5), NOW)).toBe('auto_promote');
  });

  it('switches to notify-only inside the cutoff', () => {
    expect(waitlistMode(base, inHours(1.5), NOW)).toBe('notify_only');
  });

  it('treats the cutoff itself as notify-only', () => {
    expect(waitlistMode(base, inHours(2), NOW)).toBe('notify_only');
  });
});

describe('availabilityState', () => {
  it('is full at zero spaces', () => {
    expect(availabilityState(0, 14)).toBe('full');
  });

  it('clamps negatives to full rather than reporting them', () => {
    expect(availabilityState(-1, 14)).toBe('full');
  });

  it('is nearly full at two or fewer in a small class', () => {
    expect(availabilityState(2, 14)).toBe('nearly_full');
    expect(availabilityState(3, 14)).toBe('open');
  });

  it('scales the urgency threshold with capacity', () => {
    // 20% of 40 is 8, so eight spaces still reads as nearly full.
    expect(availabilityState(8, 40)).toBe('nearly_full');
    expect(availabilityState(9, 40)).toBe('open');
  });
});

describe('cancellationPolicyText', () => {
  it('states the window from the same setting the logic enforces', () => {
    // Invariant 9: the copy cannot drift from the behaviour, because there is
    // only one copy of the number.
    const text = cancellationPolicyText({ ...base, cancellation_window_hours: 24 }).join(' ');
    expect(text).toContain('24 hours');
    expect(text).not.toContain('12 hours');
  });

  it('singularises one hour', () => {
    const text = cancellationPolicyText({ ...base, cancellation_window_hours: 1 }).join(' ');
    expect(text).toContain('1 hour ');
    expect(text).not.toContain('1 hours');
  });

  it('describes the forfeit penalty when configured', () => {
    expect(cancellationPolicyText(base).join(' ')).toContain('credit for that class is used up');
  });

  it('describes a fee penalty instead when configured', () => {
    const text = cancellationPolicyText({ ...base, late_cancel_penalty: 'fee' }).join(' ');
    expect(text).toContain('late-cancellation fee');
    expect(text).not.toContain('used up');
  });

  it('omits the waitlist paragraph when the feature is off', () => {
    const text = cancellationPolicyText({ ...base, feature_waitlist_enabled: false }).join(' ');
    expect(text).not.toContain('waitlist');
  });

  it('always promises a refund when Kelly cancels', () => {
    expect(cancellationPolicyText(base).join(' ')).toContain('returned automatically');
  });
});
