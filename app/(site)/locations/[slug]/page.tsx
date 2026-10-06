import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  createPublicClient,
  formatAddress,
  getVenue,
  listVenues,
  mapsUrl,
} from '@/lib/queries/catalogue';
import { getUpcomingSessions } from '@/lib/queries/timetable';
import { VenueJsonLd } from '@/lib/seo/json-ld';
import { SITE } from '@/lib/seo/site';
import { formatUkDayLong, formatUkTime, durationMins } from '@/lib/time';
import { path } from '@/lib/routes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/** Static params so both venue pages are prerendered and crawlable. */
export async function generateStaticParams() {
  // No HTTP request exists at build time, so cookies() is unavailable here.
  const venues = await listVenues(createPublicClient());
  return venues.map((venue) => ({ slug: venue.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const venue = await getVenue(slug);
  if (!venue) return {};

  const where = venue.city ?? SITE.town;

  return {
    // Local intent in the title without stuffing: venue name, then the town
    // someone would actually type.
    title: `Barre at ${venue.name}, ${where}`,
    description: `Barre classes at ${venue.name}, ${formatAddress(venue)}. Class times, parking and what to expect. First class free.`,
    alternates: { canonical: `/locations/${venue.slug}` },
  };
}

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const venue = await getVenue(slug);
  if (!venue) notFound();

  const sessions = (await getUpcomingSessions(12, { venueSlug: slug })).slice(0, 6);

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
      <VenueJsonLd venue={venue} />

      <p className="text-muted text-xs font-semibold tracking-[0.12em] uppercase">
        <Link href="/locations" className="hover:text-link">
          Locations
        </Link>
      </p>
      <h1 className="mt-2 text-[length:var(--text-4xl)]">{venue.name}</h1>

      <address className="text-secondary mt-4 text-lg not-italic">{formatAddress(venue)}</address>

      <div className="mt-6 flex flex-wrap gap-3">
        <a href={mapsUrl(venue)} target="_blank" rel="noreferrer noopener">
          <Button variant="secondary">Open in Maps</Button>
        </a>
        <Link href={path(`/timetable?venue=${venue.slug}`)}>
          <Button variant="accent">See class times here</Button>
        </Link>
      </div>

      {/* Upcoming classes at this venue specifically — the thing a local
          searcher actually wants, above any prose. */}
      {sessions.length > 0 ? (
        <section className="border-subtle mt-12 border-t pt-6">
          <h2 className="text-[length:var(--text-xl)]">Next classes here</h2>
          <ul className="mt-4 grid gap-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="border-subtle flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2 text-sm"
              >
                <span className="text-secondary">{formatUkDayLong(session.startsAt)}</span>
                <time dateTime={session.startsAt} className="tabular font-medium">
                  {formatUkTime(session.startsAt)}
                </time>
                <span className="text-muted tabular">
                  {durationMins(session.startsAt, session.endsAt)} mins
                </span>
                {session.spacesLeft === 0 ? (
                  <Badge tone="full">Full</Badge>
                ) : (
                  <span className="text-muted">{session.spacesLeft} spaces</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Parking and access are genuinely important — someone decides whether to
          come based on them — so an empty state says so plainly rather than
          inventing reassurance. */}
      <section className="border-subtle mt-12 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Getting here</h2>

        <div className="mt-4 grid gap-5">
          <div>
            <h3 className="text-base font-semibold">Parking</h3>
            {venue.parkingNotes ? (
              <p className="text-secondary mt-1 max-w-[60ch]">{venue.parkingNotes}</p>
            ) : (
              <p className="text-muted mt-1 max-w-[60ch] text-sm">
                Not yet confirmed. If you are not sure where to park, message Kelly before your
                first class and she will point you to the right spot.
              </p>
            )}
          </div>

          <div>
            <h3 className="text-base font-semibold">Access, toilets and changing</h3>
            {venue.accessNotes ? (
              <p className="text-secondary mt-1 max-w-[60ch]">{venue.accessNotes}</p>
            ) : (
              <p className="text-muted mt-1 max-w-[60ch] text-sm">
                Not yet confirmed. If step-free access or changing facilities matter to you, please
                ask — Kelly would much rather you checked than turned up and struggled.
              </p>
            )}
          </div>
        </div>
      </section>

      {venue.photoPaths.length === 0 ? (
        <aside className="bg-surface-sunk mt-12 rounded-lg p-5">
          <p className="text-muted text-sm">
            Photos of this hall are still to come. We would rather show you nothing than a stock
            photo of somewhere else.
          </p>
        </aside>
      ) : null}
    </div>
  );
}
