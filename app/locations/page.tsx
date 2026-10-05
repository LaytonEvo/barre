import type { Metadata } from 'next';
import Link from 'next/link';
import { listVenues, formatAddress } from '@/lib/queries/catalogue';
import { getUpcomingSessions } from '@/lib/queries/timetable';
import { BusinessJsonLd } from '@/lib/seo/json-ld';
import { SITE, localSuffix } from '@/lib/seo/site';
import { formatUkDayShort, formatUkTime } from '@/lib/time';
import { path } from '@/lib/routes';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: `Where we are — ${localSuffix}`,
  description: `Barre classes at St Leonards & St Ives Village Hall and St Ives Primary School, near ${SITE.town}. Addresses, parking and class times.`,
  alternates: { canonical: '/locations' },
};

export default async function LocationsPage() {
  const venues = await listVenues();
  const upcoming = await getUpcomingSessions(20);

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 md:px-8">
      <BusinessJsonLd venues={venues} />

      <h1 className="text-[length:var(--text-4xl)]">Where we are</h1>
      <p className="text-secondary mt-4 max-w-[60ch] text-lg">
        Two halls, both a few minutes from {SITE.town}. Mondays at St Leonards, Thursdays at St
        Ives.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {venues.map((venue) => {
          const sessions = upcoming.filter((session) => session.venue.slug === venue.slug);
          const days = [...new Set(sessions.map((s) => formatUkDayShort(s.startsAt).slice(0, 3)))];

          return (
            <article
              key={venue.slug}
              className="border-subtle bg-surface grid gap-3 rounded-lg border p-5 shadow-sm"
            >
              <h2 className="font-display text-[length:var(--text-xl)]">{venue.name}</h2>
              <p className="text-muted text-sm">{formatAddress(venue)}</p>

              {days.length > 0 ? (
                <p className="text-secondary text-sm">
                  {days.join(' and ')}
                  {' · '}
                  <span className="tabular">
                    {[...new Set(sessions.map((s) => formatUkTime(s.startsAt)))].join(', ')}
                  </span>
                </p>
              ) : null}

              <Link href={path(`/locations/${venue.slug}`)} className="mt-1">
                <Button variant="secondary" size="sm">
                  Parking, access and times
                </Button>
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
