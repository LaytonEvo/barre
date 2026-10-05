import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { cancellationOutcome, loadPolicy } from '@/lib/policy';
import { durationMins, formatUkDayLong, formatUkTime } from '@/lib/time';
import { path } from '@/lib/routes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CancelBookingButton, LeaveWaitlistButton } from '@/components/timetable/booking-buttons';

export const metadata: Metadata = { title: 'My bookings', robots: { index: false } };

type SessionJoin = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  class_types: { name: string } | null;
  venues: { name: string; slug: string } | null;
};

export default async function BookingsPage() {
  const user = await requireUser('/account/bookings');
  const supabase = await createClient();
  const policy = await loadPolicy();

  const [{ data: bookings }, { data: waitlists }] = await Promise.all([
    supabase
      .from('bookings')
      .select(
        'id, status, entitlement_kind, booked_at, class_sessions(id, starts_at, ends_at, status, class_types(name), venues(name, slug))',
      )
      .eq('user_id', user.id)
      .order('booked_at', { ascending: false })
      .limit(50),
    supabase
      .from('waitlist_entries')
      .select(
        'id, session_id, status, joined_at, class_sessions(id, starts_at, ends_at, status, class_types(name), venues(name, slug))',
      )
      .eq('user_id', user.id)
      .in('status', ['waiting', 'notified'])
      .order('joined_at'),
  ]);

  const now = new Date();
  const rows = (bookings ?? []).map((row) => ({
    ...row,
    session: row.class_sessions as unknown as SessionJoin | null,
  }));

  const upcoming = rows.filter(
    (row) =>
      row.session &&
      new Date(row.session.starts_at) > now &&
      ['booked', 'attended'].includes(row.status),
  );
  const past = rows.filter((row) => !upcoming.includes(row));

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-3xl)]">My bookings</h1>

      <section className="mt-10">
        <h2 className="text-[length:var(--text-xl)]">Coming up</h2>

        {upcoming.length === 0 ? (
          <p className="text-muted mt-4 text-sm">
            Nothing booked.{' '}
            <Link href="/timetable" className="text-link underline">
              Find a class
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-5 grid gap-3">
            {upcoming.map((row) => {
              const session = row.session!;
              // The warning comes from the same pure function the cancellation
              // policy page renders from, so the member is told exactly what
              // the database will then do.
              const outcome = cancellationOutcome(
                policy,
                new Date(session.starts_at),
                now,
                row.entitlement_kind,
              );

              return (
                <li
                  key={row.id}
                  className="border-subtle bg-surface grid gap-3 rounded-lg border p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-display text-[1.0625rem] font-semibold">
                        {session.class_types?.name ?? 'Barre'}
                      </p>
                      <p className="text-muted text-sm">
                        {formatUkDayLong(session.starts_at)} ·{' '}
                        <time dateTime={session.starts_at} className="tabular">
                          {formatUkTime(session.starts_at)}
                        </time>{' '}
                        ·{' '}
                        <span className="tabular">
                          {durationMins(session.starts_at, session.ends_at)} mins
                        </span>
                      </p>
                      {session.venues ? (
                        <p className="text-muted text-sm">
                          <Link
                            href={path(`/locations/${session.venues.slug}`)}
                            className="hover:text-link underline"
                          >
                            {session.venues.name}
                          </Link>
                        </p>
                      ) : null}
                    </div>
                    <Badge tone="open">Booked</Badge>
                  </div>

                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <a href={`/api/bookings/${row.id}/calendar`} download>
                      <Button variant="ghost" size="sm">
                        Add to calendar
                      </Button>
                    </a>
                    <CancelBookingButton bookingId={row.id} warning={outcome.warning} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {waitlists && waitlists.length > 0 ? (
        <section className="border-subtle mt-12 border-t pt-6">
          <h2 className="text-[length:var(--text-xl)]">Waitlists</h2>
          <ul className="mt-5 grid gap-3">
            {waitlists.map((row) => {
              const session = row.class_sessions as unknown as SessionJoin | null;
              if (!session) return null;
              return (
                <li
                  key={row.id}
                  className="border-subtle bg-surface flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{session.class_types?.name ?? 'Barre'}</p>
                    <p className="text-muted text-sm">
                      {formatUkDayLong(session.starts_at)} ·{' '}
                      <span className="tabular">{formatUkTime(session.starts_at)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="waitlist">
                      {row.status === 'notified' ? 'A place is free' : 'Waiting'}
                    </Badge>
                    <LeaveWaitlistButton sessionId={row.session_id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className="border-subtle mt-12 border-t pt-6">
          <h2 className="text-[length:var(--text-xl)]">Past</h2>
          <ul className="mt-5 grid gap-2">
            {past.slice(0, 20).map((row) => {
              const session = row.session;
              return (
                <li
                  key={row.id}
                  className="border-subtle flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2 text-sm"
                >
                  <span className="text-secondary">
                    {session ? formatUkDayLong(session.starts_at) : '—'}
                    {session ? ` · ${formatUkTime(session.starts_at)}` : ''}
                  </span>
                  <Badge
                    tone={
                      row.status === 'attended'
                        ? 'open'
                        : row.status === 'cancelled_in_window'
                          ? 'neutral'
                          : row.status === 'cancelled_late'
                            ? 'nearly'
                            : 'cancelled'
                    }
                  >
                    {{
                      attended: 'Attended',
                      booked: 'Booked',
                      no_show: 'Missed',
                      no_show_pending: 'Missed',
                      cancelled_in_window: 'Cancelled',
                      cancelled_late: 'Cancelled late',
                    }[row.status] ?? row.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
