import type { Metadata } from 'next';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { formatUkDayLong, formatUkTime } from '@/lib/time';
import { SessionControls } from '@/components/admin/session-controls';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Schedule', robots: { index: false, follow: false } };

export default async function SchedulePage() {
  await requireRole('admin');
  const supabase = await createClient();

  const [{ data: sessions }, { data: templates }] = await Promise.all([
    supabase
      .from('class_sessions')
      .select(
        'id, starts_at, ends_at, capacity, status, cancelled_reason, class_types(name), venues(name)',
      )
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(40),
    supabase
      .from('schedule_templates')
      .select(
        'id, weekday, start_time_local, duration_mins, capacity, active, class_types(name), venues(name)',
      )
      .eq('active', true)
      .order('weekday'),
  ]);

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const availability = new Map<string, number>();
  if (sessions?.length) {
    const { data } = await supabase
      .from('session_availability')
      .select('session_id, booked_count')
      .in(
        'session_id',
        sessions.map((s) => s.id),
      );
    for (const row of data ?? []) availability.set(row.session_id, row.booked_count);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8">
      <h1 className="text-[length:var(--text-2xl)]">Schedule</h1>

      <section className="mt-8">
        <h2 className="text-[length:var(--text-xl)]">Weekly classes</h2>
        <p className="text-muted mt-2 max-w-[60ch] text-sm">
          These generate the timetable eight weeks ahead. Changing one affects classes generated
          from now on, not ones already on the timetable — those are below.
        </p>

        <ul className="mt-4 grid gap-2">
          {(templates ?? []).map((template) => {
            const classType = template.class_types as unknown as { name: string } | null;
            const venue = template.venues as unknown as { name: string } | null;
            return (
              <li
                key={template.id}
                className="border-subtle bg-surface flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border p-4"
              >
                <div>
                  <p className="text-primary font-medium">
                    {DAYS[template.weekday]}{' '}
                    <span className="tabular">{template.start_time_local.slice(0, 5)}</span>
                  </p>
                  <p className="text-muted text-sm">
                    {classType?.name} · {venue?.name} ·{' '}
                    <span className="tabular">{template.duration_mins} mins</span>
                  </p>
                </div>
                <Badge tone="neutral">
                  <span className="tabular">{template.capacity} places</span>
                </Badge>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Upcoming classes</h2>
        <p className="text-muted mt-2 max-w-[60ch] text-sm">
          Cancelling returns everybody&rsquo;s credit automatically — nobody has to ask.
        </p>

        <ul className="mt-4 grid gap-2">
          {(sessions ?? []).map((session) => {
            const classType = session.class_types as unknown as { name: string } | null;
            const venue = session.venues as unknown as { name: string } | null;
            const booked = availability.get(session.id) ?? 0;

            return (
              <li key={session.id} className="border-subtle bg-surface rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-primary font-medium">
                      {formatUkDayLong(session.starts_at)}{' '}
                      <span className="tabular">{formatUkTime(session.starts_at)}</span>
                    </p>
                    <p className="text-muted text-sm">
                      {classType?.name} · {venue?.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {session.status === 'cancelled' ? (
                      <Badge tone="cancelled">Cancelled</Badge>
                    ) : (
                      <Badge tone={booked >= session.capacity ? 'full' : 'open'}>
                        <span className="tabular">
                          {booked} / {session.capacity}
                        </span>
                      </Badge>
                    )}
                  </div>
                </div>

                {session.status === 'cancelled' ? (
                  <p className="text-muted mt-2 text-sm">{session.cancelled_reason}</p>
                ) : (
                  <SessionControls
                    sessionId={session.id}
                    capacity={session.capacity}
                    booked={booked}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
