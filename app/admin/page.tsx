import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { formatUkTime, formatUkDate } from '@/lib/time';
import { path } from '@/lib/routes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Today', robots: { index: false, follow: false } };

export default async function AdminTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireRole('admin', 'instructor');
  const { date } = await searchParams;
  const supabase = await createClient();

  const { data: sessions, error } = await supabase.rpc('admin_today', {
    p_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
  });

  const isAdmin = user.roles.includes('admin');
  const today = date ?? new Date().toISOString().slice(0, 10);

  // Yesterday and tomorrow as plain links: Kelly sometimes marks a register the
  // morning after, and sometimes wants to see what is coming.
  const shift = (days: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[length:var(--text-2xl)]">{formatUkDate(`${today}T12:00:00Z`)}</h1>
        <div className="flex gap-2">
          <Link href={path(`/admin?date=${shift(-1)}`)}>
            <Button variant="ghost" size="sm">
              &larr; Yesterday
            </Button>
          </Link>
          {date ? (
            <Link href="/admin">
              <Button variant="ghost" size="sm">
                Today
              </Button>
            </Link>
          ) : null}
          <Link href={path(`/admin?date=${shift(1)}`)}>
            <Button variant="ghost" size="sm">
              Tomorrow &rarr;
            </Button>
          </Link>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-status-full-fg mt-6 text-sm">
          Could not load the day. Please try again.
        </p>
      ) : null}

      {!sessions || sessions.length === 0 ? (
        <p className="text-muted mt-8">No classes {date ? 'that day' : 'today'}.</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {sessions.map((session) => {
            const cancelled = session.status === 'cancelled';
            const full = session.booked >= session.capacity;

            return (
              <li
                key={session.session_id}
                className="border-subtle bg-surface rounded-lg border p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tabular font-display text-heading text-[length:var(--text-xl)]">
                      {formatUkTime(session.starts_at)}
                    </p>
                    <p className="text-primary font-medium">{session.class_name}</p>
                    <p className="text-muted text-sm">
                      {session.venue_name}
                      {isAdmin ? ` · ${session.instructor}` : ''}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="tabular text-primary text-lg font-semibold">
                      {session.booked}
                      <span className="text-muted text-sm"> / {session.capacity}</span>
                    </p>
                    {session.waitlist > 0 ? (
                      <p className="text-muted tabular text-xs">{session.waitlist} waiting</p>
                    ) : null}
                  </div>
                </div>

                {/* The flags Kelly wants to see before she walks in. */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {cancelled ? <Badge tone="cancelled">Cancelled</Badge> : null}
                  {session.first_timers > 0 ? (
                    <Badge tone="waitlist">
                      {session.first_timers} first{' '}
                      {session.first_timers === 1 ? 'class' : 'classes'}
                    </Badge>
                  ) : null}
                  {session.flagged > 0 ? (
                    <Badge tone="nearly">{session.flagged} to check</Badge>
                  ) : null}
                  {full && !cancelled ? <Badge tone="full">Full</Badge> : null}
                  {session.all_marked && session.booked > 0 ? (
                    <Badge tone="open">Register done</Badge>
                  ) : null}
                </div>

                {!cancelled ? (
                  <div className="mt-4">
                    <Link href={path(`/admin/register/${session.session_id}`)}>
                      <Button variant="accent" block size="lg">
                        Open register
                      </Button>
                    </Link>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
