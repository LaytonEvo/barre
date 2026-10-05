import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { availabilityState } from '@/lib/policy/rules';
import { formatUkTime, durationMins } from '@/lib/time';
import type { TimetableSession } from '@/lib/queries/timetable';
import { cn } from '@/lib/utils';
import { path } from '@/lib/routes';

/**
 * One class on the timetable.
 *
 * Booking lands at M5, so the action is a sign-up link for now rather than a
 * dead button. Status always carries text as well as colour: this is the most
 * colour-coded screen in the product, so colour alone is never the signal.
 */
export function SessionCard({ session }: { session: TimetableSession }) {
  const cancelled = session.status === 'cancelled';
  const state = availabilityState(session.spacesLeft, session.capacity);
  const mins = durationMins(session.startsAt, session.endsAt);

  return (
    <article
      id={session.id}
      className={cn(
        'border-subtle grid gap-3 rounded-lg border p-4 shadow-sm',
        cancelled ? 'bg-surface-sunk' : 'bg-surface',
      )}
    >
      <div className="flex items-start gap-3">
        <time
          dateTime={session.startsAt}
          className="tabular w-[52px] shrink-0 text-base font-semibold"
        >
          {formatUkTime(session.startsAt)}
        </time>

        <div className="grid min-w-0 flex-1 gap-0.5">
          <h3
            className={cn(
              'font-display text-[1.0625rem] font-semibold',
              cancelled && 'text-secondary line-through decoration-1',
            )}
          >
            {session.classType.name}
          </h3>
          <p className="text-muted text-sm">
            <span className="tabular">{mins} mins</span>
            {' · '}
            <Link
              href={path(`/locations/${session.venue.slug}`)}
              className="hover:text-link underline"
            >
              {session.venue.name}
            </Link>
            {' · '}
            {session.instructor.displayName}
          </p>
          {session.note ? <p className="text-muted mt-1 text-sm">{session.note}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {cancelled ? (
          <Badge tone="cancelled">Cancelled</Badge>
        ) : (
          <>
            <Badge tone={state === 'full' ? 'full' : state === 'nearly_full' ? 'nearly' : 'open'}>
              {session.spacesLeft === 0
                ? 'Full'
                : `${session.spacesLeft} space${session.spacesLeft === 1 ? '' : 's'} left`}
            </Badge>

            {session.spacesLeft === 0 ? (
              <Button variant="secondary" size="sm" disabled>
                Waitlist opens soon
              </Button>
            ) : (
              <Link href="/signup">
                <Button variant="accent" size="sm">
                  Book
                </Button>
              </Link>
            )}
          </>
        )}
      </div>
    </article>
  );
}
