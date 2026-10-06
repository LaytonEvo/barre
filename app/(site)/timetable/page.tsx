import type { Metadata } from 'next';
import Link from 'next/link';
import { loadPolicy } from '@/lib/policy';
import { getMonthSessions, getScheduledRange, groupByDay } from '@/lib/queries/timetable';
import { listClassTypes, listVenues } from '@/lib/queries/catalogue';
import {
  formatUkDayLong,
  parseMonthParam,
  toUkDateKey,
  toUkMonthKey,
  ukMonthDays,
} from '@/lib/time';
import { SessionsJsonLd } from '@/lib/seo/json-ld';
import { SITE, localSuffix } from '@/lib/seo/site';
import { SessionCard } from '@/components/timetable/session-card';
import { MonthNav } from '@/components/timetable/month-nav';
import { FilterChips } from '@/components/timetable/filters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { path } from '@/lib/routes';
import { getSessionUser } from '@/lib/supabase/auth';

export const metadata: Metadata = {
  title: `Timetable — ${localSuffix}`,
  description: `Barre class times in ${SITE.town}, St Leonards and St Ives. Mondays and Thursdays, all levels welcome, and your first class is free.`,
  alternates: { canonical: '/timetable' },
};

type Search = { month?: string; venue?: string; class?: string };

export default async function TimetablePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const month = parseMonthParam(params.month);

  const [policy, venues, classTypes, sessions, range, user] = await Promise.all([
    loadPolicy(),
    listVenues(),
    listClassTypes(),
    getMonthSessions(month, { venueSlug: params.venue, classTypeSlug: params.class }),
    getScheduledRange(),
    getSessionUser(),
  ]);

  // Build hrefs that preserve the other filters, so changing the venue does not
  // silently throw away the month you were looking at.
  const href = (overrides: Partial<Search>) => {
    const merged = { ...params, ...overrides };
    const query = new URLSearchParams();
    if (merged.month) query.set('month', merged.month);
    if (merged.venue) query.set('venue', merged.venue);
    if (merged.class) query.set('class', merged.class);
    const search = query.toString();
    return search ? `/timetable?${search}` : '/timetable';
  };

  const byDay = groupByDay(sessions);
  const days = ukMonthDays(month).filter((day) => byDay.has(toUkDateKey(day)));
  const introIsFree = true; // from the products table: the intro offer is £0

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 md:px-8">
      <SessionsJsonLd sessions={sessions} introOfferIsFree={introIsFree} />

      <h1 className="text-[length:var(--text-4xl)]">Timetable</h1>
      <p className="text-secondary mt-4 max-w-[60ch] text-lg">
        Classes run on Mondays at St Leonards and Thursdays at St Ives. All levels welcome, and your
        first class is free.
      </p>

      <div className="border-subtle mt-8 grid gap-5 border-t pt-6">
        <MonthNav
          month={month}
          earliest={range?.first ?? null}
          latest={range?.last ?? null}
          buildHref={(next) => href({ month: toUkMonthKey(next) })}
        />

        <FilterChips
          label="Venue"
          active={params.venue}
          options={venues.map((venue) => ({ label: venue.name, slug: venue.slug }))}
          buildHref={(slug) => href({ venue: slug })}
        />

        <FilterChips
          label="Class"
          active={params.class}
          options={classTypes.map((type) => ({ label: type.name, slug: type.slug }))}
          buildHref={(slug) => href({ class: slug })}
        />
      </div>

      {/* A month of classes, grouped by day.
          Not a seven-column grid: at 390px one is unreadable, and this is the
          most-visited page on the site. A month of Kelly's timetable is eight or
          nine classes, which reads better as a list than as a grid four fifths
          empty — and unlike a week, it answers "when could I come?" without
          paging. */}
      <div className="mt-10 grid gap-8">
        {days.length === 0 ? (
          <div className="border-subtle bg-surface rounded-lg border p-8 text-center">
            <p className="text-secondary">No classes match that this month.</p>
            <Link
              href={path(href({ venue: undefined, class: undefined }))}
              className="mt-4 inline-block"
            >
              <Button variant="secondary">Show every class</Button>
            </Link>
          </div>
        ) : (
          days.map((day) => {
            const key = toUkDateKey(day);
            return (
              <section key={key} className="grid gap-3">
                <h2 className="font-display text-[length:var(--text-xl)]">
                  {formatUkDayLong(day)}
                </h2>
                {byDay.get(key)?.map((session) => (
                  <SessionCard key={session.id} session={session} signedIn={Boolean(user)} />
                ))}
              </section>
            );
          })
        )}
      </div>

      {/* Replaces a build-progress note that was still telling visitors booking
          "arrives with the booking engine" three milestones after it arrived.
          What a visitor actually needs here is the free first class and the
          cancellation rule, both read from settings rather than written down. */}
      <aside className="bg-accent-soft mt-12 rounded-lg p-5">
        <Badge tone="open">Your first class is free</Badge>
        <p className="text-primary mt-3 max-w-[60ch] text-sm">
          Book any class above and the first one costs nothing — no card needed. Just turn up in
          something you can move in, and bring water.
        </p>
        <p className="text-secondary mt-3 max-w-[60ch] text-sm">
          Changed your plans? Cancel more than {policy.cancellation_window_hours} hours before and
          your place goes straight back to your account.
        </p>
      </aside>
    </div>
  );
}
