import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { GALLERY, PHOTOS } from '@/lib/images';
import { NewsletterForm } from '@/components/site/newsletter-form';
import { getUpcomingSessions } from '@/lib/queries/timetable';
import { listReviews, listVenues } from '@/lib/queries/catalogue';
import { BusinessJsonLd } from '@/lib/seo/json-ld';
import { SITE } from '@/lib/seo/site';
import { durationMins, formatUkDayLong, formatUkTime } from '@/lib/time';
import { path } from '@/lib/routes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: `Barre classes in ${SITE.town} — first class free`,
  description: `Ballet-inspired barre classes in ${SITE.town}, St Leonards and St Ives. All levels, all bodies, no dance experience needed. Your first class is free.`,
  alternates: { canonical: '/' },
};

const WHAT_IS_BARRE = [
  {
    title: 'Small movements, big effect',
    body: 'Barre works in a tiny range of motion with high repetitions. It looks gentle and it very much is not — expect your legs to shake, which is the bit everyone talks about afterwards.',
  },
  {
    title: 'Ballet-inspired, not a ballet class',
    body: 'We borrow the shapes and the posture work, but there is no choreography to learn and no mirror to perform to. If you have never danced in your life, you are in exactly the right place.',
  },
  {
    title: 'Low impact, strong results',
    body: 'Nothing jumps and nothing jars. It is kind to joints while still building real strength through your legs, seat, arms and core.',
  },
] as const;

export default async function HomePage() {
  const [sessions, venues, reviews] = await Promise.all([
    getUpcomingSessions(3),
    listVenues(),
    listReviews(),
  ]);

  return (
    <>
      <BusinessJsonLd venues={venues} />

      {/* Hero.

          The photo is the point of this section, so it carries the full width
          on mobile with the type beneath it, and becomes a two-column split at
          md where there is room for both. `priority` because this is the LCP
          element, and explicit dimensions so nothing shifts as it loads. */}
      <section className="mx-auto max-w-6xl px-5 pt-8 pb-10 md:px-8 md:pt-14">
        <div className="grid items-center gap-8 md:grid-cols-[1.05fr_1fr] md:gap-12">
          <div>
            <Badge tone="open">Your first class is free</Badge>

            <h1 className="font-display mt-5 text-[length:var(--text-5xl)] leading-[1.05]">
              All levels, all bodies.
            </h1>

            <p className="text-secondary mt-5 max-w-[48ch] text-lg">
              Ballet-inspired barre classes at St Leonards and St Ives, just outside {SITE.town}.
              Low impact, genuinely hard, and far friendlier than it sounds.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/timetable">
                <Button variant="accent" size="lg">
                  Book your free class
                </Button>
              </Link>
              <Link href="/new-here">
                <Button variant="secondary" size="lg">
                  New to barre?
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-md">
            <Image
              src={PHOTOS.fieldPath.src}
              alt={PHOTOS.fieldPath.alt}
              width={PHOTOS.fieldPath.width}
              height={PHOTOS.fieldPath.height}
              priority
              sizes="(min-width: 768px) 46vw, 100vw"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Next classes, live from the database. The single most useful thing a
          first-time visitor can see. */}
      <section className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <div className="border-subtle flex flex-wrap items-baseline justify-between gap-3 border-t pt-6">
          <h2 className="text-[length:var(--text-2xl)]">Next classes</h2>
          <Link href="/timetable" className="text-link text-sm underline">
            See the full timetable
          </Link>
        </div>

        {sessions.length === 0 ? (
          <p className="text-muted mt-6">
            The timetable for the next couple of weeks is being set. Please check back shortly.
          </p>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="border-subtle bg-surface grid gap-1.5 rounded-lg border p-4 shadow-sm"
              >
                <p className="text-muted text-sm">{formatUkDayLong(session.startsAt)}</p>
                <p className="tabular font-display text-heading text-[length:var(--text-xl)]">
                  {formatUkTime(session.startsAt)}
                </p>
                <p className="text-secondary text-sm">
                  <Link
                    href={path(`/locations/${session.venue.slug}`)}
                    className="hover:text-link underline"
                  >
                    {session.venue.name}
                  </Link>
                </p>
                <p className="text-muted tabular text-sm">
                  {durationMins(session.startsAt, session.endsAt)} mins
                  {session.spacesLeft > 0 ? ` · ${session.spacesLeft} spaces` : ' · Full'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* What is barre */}
      <section className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <h2 className="border-subtle border-t pt-6 text-[length:var(--text-2xl)]">
          What is barre, then?
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {WHAT_IS_BARRE.map((point) => (
            <div key={point.title} className="grid gap-2">
              <h3 className="font-display text-[length:var(--text-xl)]">{point.title}</h3>
              <p className="text-secondary text-sm">{point.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Venues */}
      <section className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <h2 className="border-subtle border-t pt-6 text-[length:var(--text-2xl)]">Where we are</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {venues.map((venue) => (
            <Link
              key={venue.slug}
              href={path(`/locations/${venue.slug}`)}
              className="border-subtle bg-surface hover:border-strong focus-visible:outline-focus grid gap-1 rounded-lg border p-5 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <h3 className="font-display text-[length:var(--text-xl)]">{venue.name}</h3>
              <p className="text-muted text-sm">
                {[venue.city, venue.postcode].filter(Boolean).join(' · ')}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Meet Kelly. Her own words, trimmed to the first paragraph with the
          rest on /about. */}
      <section className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <h2 className="border-subtle border-t pt-6 text-[length:var(--text-2xl)]">Meet Kelly</h2>

        <div className="mt-6 grid items-start gap-6 sm:grid-cols-[1fr_1.4fr] sm:gap-10">
          <Image
            src={PHOTOS.portrait.src}
            alt={PHOTOS.portrait.alt}
            width={PHOTOS.portrait.width}
            height={PHOTOS.portrait.height}
            sizes="(min-width: 640px) 36vw, 100vw"
            className="w-full rounded-xl object-cover shadow-sm"
          />

          <div className="grid gap-4">
            <p className="text-secondary max-w-[56ch] text-lg">
              Kelly teaches every class herself. Whether you are a former dancer or have never set
              foot near a barre, you will be welcomed, encouraged and pushed just the right amount.
            </p>
            <div>
              <Link href="/about">
                <Button variant="secondary">More about Kelly</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* A strip of the shoot. Decorative, so each image's alt is empty — the
          surrounding copy already says what these are. */}
      <section className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        <h2 className="border-subtle sr-only border-t pt-6">Photographs</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {GALLERY.map((image) => (
            <li key={image.src} className="overflow-hidden rounded-lg">
              <Image
                src={image.src}
                alt=""
                width={image.width}
                height={image.height}
                sizes="(min-width: 1024px) 16vw, (min-width: 640px) 32vw, 48vw"
                className="aspect-square w-full object-cover transition-transform duration-500 hover:scale-105"
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Reviews. Renders an empty state rather than fabricated testimonials. */}
      <section className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <h2 className="border-subtle border-t pt-6 text-[length:var(--text-2xl)]">
          What people say
        </h2>
        {reviews.length === 0 ? (
          <p className="text-muted mt-6 max-w-[60ch] text-sm">
            We will show real Google reviews here once there are some to show. We are not going to
            write our own and pretend otherwise.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {reviews.map((review) => (
              <li key={review.id} className="border-subtle bg-surface rounded-lg border p-5">
                <p className="text-secondary" aria-label={`${review.rating} out of 5`}>
                  {'★'.repeat(review.rating)}
                  <span className="text-muted">{'★'.repeat(5 - review.rating)}</span>
                </p>
                {review.body ? <p className="mt-2 text-sm">{review.body}</p> : null}
                <p className="text-muted mt-2 text-sm">{review.authorName}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <div className="border-subtle grid gap-5 border-t pt-6 sm:grid-cols-[1.2fr_1fr] sm:gap-10">
          <div>
            <h2 className="text-[length:var(--text-2xl)]">Stay in the loop</h2>
            <p className="text-secondary mt-3 max-w-[48ch]">
              New classes, timetable changes, and the occasional pop-up. That is all — no daily
              emails, and nothing sold on.
            </p>
          </div>
          <div className="sm:pt-2">
            <NewsletterForm source="homepage" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-10 pb-16 md:px-8">
        <div className="bg-accent-soft grid gap-4 rounded-xl p-6 md:p-10">
          <h2 className="text-[length:var(--text-2xl)]">Come and try one</h2>
          <p className="text-primary max-w-[52ch]">
            Your first class is free, so the only thing it costs you is 55 minutes and a bit of
            nerve.
          </p>
          <div>
            <Link href="/timetable">
              <Button variant="accent" size="lg">
                Find a class
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
