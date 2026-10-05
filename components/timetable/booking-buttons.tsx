'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import {
  bookSession,
  cancelBooking,
  joinWaitlist,
  leaveWaitlist,
  type BookingResult,
  type CancelResult,
  type WaitlistResult,
} from '@/app/actions/booking';
import { NEEDS_ONBOARDING, NEEDS_PAYMENT, OFFER_WAITLIST } from '@/lib/booking/errors';
import { Button, type ButtonProps } from '@/components/ui/button';

type Size = ButtonProps['size'];

async function run<T>(
  action: (formData: FormData) => Promise<T>,
  _previous: T,
  formData: FormData,
): Promise<T> {
  return action(formData);
}

/**
 * An error is only half an answer. Each one that the member can actually do
 * something about gets the link that does it — a full class offers the
 * waitlist, no credits offers the prices, an unsigned waiver offers the waiver.
 */
function ErrorNote({ code, message }: { code: string; message: string }) {
  const action = NEEDS_PAYMENT.has(code as never)
    ? { href: '/pricing' as const, label: 'See prices' }
    : NEEDS_ONBOARDING.has(code as never)
      ? { href: '/account' as const, label: 'Finish signing up' }
      : null;

  return (
    <p role="alert" className="text-status-full-fg text-sm">
      {message}{' '}
      {action ? (
        <Link href={action.href} className="font-medium underline">
          {action.label}
        </Link>
      ) : null}
    </p>
  );
}

export function BookButton({ sessionId, size = 'sm' }: { sessionId: string; size?: Size }) {
  const [state, submit, pending] = useActionState(
    run.bind(null, bookSession) as (p: BookingResult, f: FormData) => Promise<BookingResult>,
    undefined,
  );

  if (state?.ok) {
    return (
      <p role="status" className="text-status-open-fg text-sm font-medium">
        Booked — see you there.
      </p>
    );
  }

  const showWaitlist = state && !state.ok && OFFER_WAITLIST.has(state.code);

  return (
    <div className="grid gap-2">
      {showWaitlist ? (
        <JoinWaitlistButton sessionId={sessionId} size={size} />
      ) : (
        <form action={submit}>
          <input type="hidden" name="id" value={sessionId} />
          <Button type="submit" variant="accent" size={size} disabled={pending}>
            {pending ? 'Booking…' : 'Book'}
          </Button>
        </form>
      )}
      {state && !state.ok ? <ErrorNote code={state.code} message={state.message} /> : null}
    </div>
  );
}

export function JoinWaitlistButton({ sessionId, size = 'sm' }: { sessionId: string; size?: Size }) {
  const [state, submit, pending] = useActionState(
    run.bind(null, joinWaitlist) as (p: WaitlistResult, f: FormData) => Promise<WaitlistResult>,
    undefined,
  );

  if (state?.ok) {
    return (
      <p role="status" className="text-status-waitlist-fg text-sm font-medium">
        You&rsquo;re {state.position === 1 ? 'first' : `number ${state.position}`} on the waitlist.
        We&rsquo;ll book you in automatically if a place opens.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <form action={submit}>
        <input type="hidden" name="id" value={sessionId} />
        <Button type="submit" variant="secondary" size={size} disabled={pending}>
          {pending ? 'Joining…' : 'Join waitlist'}
        </Button>
      </form>
      {state && !state.ok ? <ErrorNote code={state.code} message={state.message} /> : null}
    </div>
  );
}

export function LeaveWaitlistButton({ sessionId }: { sessionId: string }) {
  const [state, submit, pending] = useActionState(
    run.bind(null, leaveWaitlist) as (p: WaitlistResult, f: FormData) => Promise<WaitlistResult>,
    undefined,
  );

  if (state?.ok) {
    return <p className="text-muted text-sm">Left the waitlist.</p>;
  }

  return (
    <form action={submit}>
      <input type="hidden" name="id" value={sessionId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? 'Leaving…' : 'Leave waitlist'}
      </Button>
    </form>
  );
}

/**
 * Cancelling. The warning is shown BEFORE the member confirms, with the actual
 * consequence spelled out, because losing a credit you did not know you were
 * risking is the thing that makes people stop trusting a booking system.
 */
export function CancelBookingButton({
  bookingId,
  warning,
}: {
  bookingId: string;
  warning: string | null;
}) {
  const [state, submit, pending] = useActionState(
    run.bind(null, cancelBooking) as (p: CancelResult, f: FormData) => Promise<CancelResult>,
    undefined,
  );

  if (state?.ok) {
    return (
      <p role="status" className="text-secondary text-sm">
        Cancelled.{' '}
        {state.creditReturned
          ? 'Your credit is back in your balance.'
          : 'That credit has been used.'}
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {warning ? (
        <p className="bg-status-nearly-bg text-status-nearly-fg rounded-md px-3 py-2 text-sm">
          {warning}
        </p>
      ) : null}
      <form action={submit}>
        <input type="hidden" name="id" value={bookingId} />
        <Button
          type="submit"
          variant={warning ? 'destructive' : 'secondary'}
          size="sm"
          disabled={pending}
        >
          {pending ? 'Cancelling…' : warning ? 'Cancel anyway' : 'Cancel booking'}
        </Button>
      </form>
      {state && !state.ok ? (
        <p role="alert" className="text-status-full-fg text-sm">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
