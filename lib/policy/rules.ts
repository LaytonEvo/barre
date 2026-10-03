import type { Policy } from './schema';

/**
 * Pure policy logic.
 *
 * Nothing here touches the database or the clock directly — `now` is always a
 * parameter. That is what makes the cancellation and waitlist rules testable
 * without a database, and it is why the same functions can safely be called
 * from both the enforcement path and the copy that explains it to members.
 */

export type CancellationOutcome = {
  /** Is this cancellation outside the window, i.e. penalty-free? */
  inWindow: boolean;
  /** Hours remaining before the class, for display. */
  hoursUntilStart: number;
  /** What happens to the member's credit. */
  creditOutcome: 'returned' | 'forfeited' | 'none';
  /** Fee to charge, in pence. Zero unless the policy is a fee. */
  feePence: number;
  /** A sentence the member sees before confirming. */
  warning: string | null;
};

const MS_PER_HOUR = 3_600_000;

export function hoursUntil(startsAt: Date, now: Date): number {
  return (startsAt.getTime() - now.getTime()) / MS_PER_HOUR;
}

/**
 * Work out what cancelling now would cost.
 *
 * `entitlement` matters because a member on an unlimited membership has no
 * credit to forfeit — the only penalty available is a fee, if one is configured.
 */
export function cancellationOutcome(
  policy: Policy,
  startsAt: Date,
  now: Date,
  entitlement: 'credit' | 'membership' | 'payment',
): CancellationOutcome {
  const hours = hoursUntil(startsAt, now);
  const inWindow = hours >= policy.cancellation_window_hours;

  if (inWindow) {
    return {
      inWindow: true,
      hoursUntilStart: hours,
      creditOutcome: entitlement === 'credit' ? 'returned' : 'none',
      feePence: 0,
      warning: null,
    };
  }

  const penalty = policy.late_cancel_penalty;

  if (penalty === 'none') {
    return {
      inWindow: false,
      hoursUntilStart: hours,
      creditOutcome: entitlement === 'credit' ? 'returned' : 'none',
      feePence: 0,
      warning: null,
    };
  }

  if (penalty === 'fee') {
    return {
      inWindow: false,
      hoursUntilStart: hours,
      creditOutcome: entitlement === 'credit' ? 'returned' : 'none',
      feePence: policy.late_cancel_fee_pence,
      warning:
        `This is a late cancellation, so a late-cancellation fee applies. ` +
        `Cancelling more than ${policy.cancellation_window_hours} hours before a class is always free.`,
    };
  }

  // forfeit_credit
  return {
    inWindow: false,
    hoursUntilStart: hours,
    creditOutcome: entitlement === 'credit' ? 'forfeited' : 'none',
    feePence: 0,
    warning:
      entitlement === 'credit'
        ? `This is a late cancellation, so this credit will not be returned to your balance. ` +
          `Cancelling more than ${policy.cancellation_window_hours} hours before a class is always free.`
        : `This is a late cancellation. Your membership is not affected, but please cancel earlier ` +
          `when you can so someone on the waitlist can take your place.`,
  };
}

/** Latest instant at which a session is still open for booking. */
export function bookingWindowCloses(policy: Policy, now: Date): Date {
  return new Date(now.getTime() + policy.booking_window_days * 24 * MS_PER_HOUR);
}

/** Is this session inside the booking window and still in the future? */
export function isBookable(policy: Policy, startsAt: Date, now: Date): boolean {
  return startsAt > now && startsAt <= bookingWindowCloses(policy, now);
}

/**
 * Before the cutoff, a freed space is auto-booked for the first waitlisted
 * member with an entitlement. After it, everyone is notified and it is first
 * come, first served — because auto-booking somebody 20 minutes before a class
 * they may not be able to reach is worse than letting them choose.
 */
export function waitlistMode(
  policy: Policy,
  startsAt: Date,
  now: Date,
): 'auto_promote' | 'notify_only' {
  return hoursUntil(startsAt, now) > policy.waitlist_cutoff_hours ? 'auto_promote' : 'notify_only';
}

/** Spaces-left display state. Drives which badge the timetable shows. */
export function availabilityState(
  spacesLeft: number,
  capacity: number,
): 'open' | 'nearly_full' | 'full' {
  if (spacesLeft <= 0) return 'full';
  // "Nearly full" at two or fewer, or the last fifth of a larger class.
  if (spacesLeft <= Math.max(2, Math.floor(capacity * 0.2))) return 'nearly_full';
  return 'open';
}

const hours = (n: number) => `${n} hour${n === 1 ? '' : 's'}`;

/**
 * Member-facing cancellation policy, generated from the same values the
 * enforcement reads. Invariant 9: the copy cannot drift from the logic, because
 * there is no second copy of the numbers.
 */
export function cancellationPolicyText(policy: Policy): string[] {
  const text: string[] = [
    `You can cancel a booking free of charge up to ${hours(policy.cancellation_window_hours)} before the class starts. Your credit goes straight back to your balance and keeps its original expiry date.`,
  ];

  switch (policy.late_cancel_penalty) {
    case 'forfeit_credit':
      text.push(
        `If you cancel within ${hours(policy.cancellation_window_hours)} of the class, the credit for that class is used up. We will always warn you before you confirm.`,
      );
      break;
    case 'fee':
      text.push(
        `If you cancel within ${hours(policy.cancellation_window_hours)} of the class, a late-cancellation fee applies. We will always warn you before you confirm.`,
      );
      break;
    case 'none':
      text.push(`There is no penalty for cancelling late, though earlier is always kinder.`);
      break;
  }

  if (policy.no_show_penalty !== 'none') {
    text.push(
      policy.no_show_penalty === 'forfeit_credit'
        ? `Not turning up without cancelling is treated the same as a late cancellation.`
        : `Not turning up without cancelling incurs the same fee as a late cancellation.`,
    );
  }

  if (policy.feature_waitlist_enabled) {
    text.push(
      `Full classes have a waitlist, and joining or leaving one is always free. If a space opens up more than ${hours(policy.waitlist_cutoff_hours)} before the class, we book the first person on the list in automatically and email them. Closer than that, we let everyone on the list know and it is first come, first served.`,
    );
  }

  text.push(
    `If we ever have to cancel a class, your credit is returned automatically and we will let you know as soon as we can.`,
  );

  return text;
}

export function bookingWindowText(policy: Policy): string {
  return `Classes open for booking ${policy.booking_window_days} days ahead.`;
}
