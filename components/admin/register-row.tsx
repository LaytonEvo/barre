'use client';

import { useActionState, useState } from 'react';
import { markAttendance, type AdminResult } from '@/app/actions/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Row = {
  booking_id: string;
  user_id: string;
  full_name: string | null;
  initials: string | null;
  status: string;
  source: string;
  is_first_class: boolean;
  attended_count: number;
  health_flagged: boolean;
  health_summary: string | null;
  health_reviewed: boolean;
  waiver_signed: boolean;
  emergency_contact: string | null;
};

async function run(_previous: AdminResult, formData: FormData): Promise<AdminResult> {
  return markAttendance(formData);
}

/**
 * One member on the register.
 *
 * Designed for a thumb: the two marking buttons are full-height targets, the
 * row shows its state without needing a legend, and the health flag expands in
 * place rather than navigating away — Kelly is holding the phone in one hand
 * with thirty seconds before she starts.
 */
export function RegisterRow({ row }: { row: Row }) {
  const [state, submit, pending] = useActionState(run, undefined);
  const [showHealth, setShowHealth] = useState(false);

  // Optimistic: the server is the truth, but the row should not look unchanged
  // while a request is in flight in a hall with bad signal.
  const [marked, setMarked] = useState<string | null>(null);
  const status = marked ?? row.status;

  const attended = status === 'attended';
  // A pending no-show was decided by the nightly job, not by Kelly. Showing it
  // as settled would invite her to scroll past the one row that still wants a
  // human — so it reads as a question until somebody answers it.
  const pendingNoShow = status === 'no_show_pending';
  const noShow = status === 'no_show' || pendingNoShow;

  return (
    <li
      className={cn(
        'border-subtle rounded-lg border p-3',
        attended
          ? 'bg-status-open-bg/40'
          : pendingNoShow
            ? 'bg-status-nearly-bg/40'
            : noShow
              ? 'bg-surface-sunk'
              : 'bg-surface',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Members have no photo, so initials stand in for the avatar the brief
            asks for. Collecting member photos would be a lot of sensitive data
            for a small gain. */}
        <span
          aria-hidden
          className="bg-accent-soft text-primary grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
        >
          {row.initials || '?'}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-primary font-medium">{row.full_name ?? 'Member'}</p>

          <div className="mt-1 flex flex-wrap gap-1.5">
            {row.is_first_class ? <Badge tone="waitlist">First class</Badge> : null}
            {!row.waiver_signed ? <Badge tone="full">Waiver not signed</Badge> : null}
            {row.source === 'walk_in' ? <Badge tone="neutral">Walk-in</Badge> : null}
            {pendingNoShow ? <Badge tone="nearly">Marked absent — confirm?</Badge> : null}
            {row.health_flagged ? (
              <button
                type="button"
                onClick={() => setShowHealth((open) => !open)}
                aria-expanded={showHealth}
                className="focus-visible:outline-focus rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Badge tone={row.health_reviewed ? 'neutral' : 'nearly'}>
                  Health note{showHealth ? ' ▴' : ' ▾'}
                </Badge>
              </button>
            ) : null}
          </div>

          {showHealth ? (
            <div className="bg-surface-sunk mt-2 rounded-md p-3 text-sm">
              <p className="text-primary">{row.health_summary ?? 'Flagged — see their profile.'}</p>
              {row.emergency_contact ? (
                <p className="text-muted mt-1">Emergency contact: {row.emergency_contact}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <form
        action={(formData) => {
          setMarked(formData.get('status')?.toString() ?? null);
          submit(formData);
        }}
        className="mt-3 flex gap-2"
      >
        <input type="hidden" name="bookingId" value={row.booking_id} />

        <Button
          type="submit"
          name="status"
          value={attended ? 'booked' : 'attended'}
          variant={attended ? 'primary' : 'secondary'}
          size="lg"
          block
          disabled={pending}
        >
          {attended ? '✓ Here' : 'Here'}
        </Button>

        <Button
          type="submit"
          name="status"
          value={noShow && !pendingNoShow ? 'booked' : 'no_show'}
          variant={noShow ? 'destructive' : 'secondary'}
          size="lg"
          block
          disabled={pending}
        >
          {pendingNoShow ? 'Confirm absent' : noShow ? '✕ No show' : 'No show'}
        </Button>
      </form>

      {state && !state.ok ? (
        <p role="alert" className="text-status-full-fg mt-2 text-sm">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
