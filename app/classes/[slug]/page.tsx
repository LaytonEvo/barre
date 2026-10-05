import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createPublicClient, getClassType, listClassTypes } from '@/lib/queries/catalogue';
import { getUpcomingSessions } from '@/lib/queries/timetable';
import { ClassJsonLd } from '@/lib/seo/json-ld';
import { SITE } from '@/lib/seo/site';
import { formatUkDayLong, formatUkTime } from '@/lib/time';
import { path } from '@/lib/routes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export async function generateStaticParams() {
  const classTypes = await listClassTypes(createPublicClient());
  return classTypes.map((classType) => ({ slug: classType.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const classType = await getClassType(slug);
  if (!classType) return {};

  return {
    title: `${classType.name} classes in ${SITE.town}`,
    description:
      classType.description ??
      `${classType.name} with Barre By Kelly in ${SITE.town}. ${classType.durationMins} minutes, all levels. First class free.`,
    alternates: { canonical: `/classes/${classType.slug}` },
  };
}

const LEVEL_LABELS: Record<string, string> = {
  all_levels: 'All levels',
  beginner: 'Beginner',
  improver: 'Improver',
  advanced: 'Advanced',
};

export default async function ClassTypePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const classType = await getClassType(slug);
  if (!classType) notFound();

  const sessions = await getUpcomingSessions(6, { classTypeSlug: slug });

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
      <ClassJsonLd classType={classType} />

      <p className="text-muted text-xs font-semibold tracking-[0.12em] uppercase">
        <Link href="/classes" className="hover:text-link">
          Classes
        </Link>
      </p>
      <h1 className="mt-2 text-[length:var(--text-4xl)]">{classType.name}</h1>

      <div className="mt-5 flex flex-wrap gap-2">
        <Badge tone="neutral">
          <span className="tabular">{classType.durationMins} minutes</span>
        </Badge>
        <Badge tone="neutral">{LEVEL_LABELS[classType.level] ?? 'All levels'}</Badge>
        {classType.intensity ? (
          <Badge tone="neutral">Intensity {classType.intensity} of 5</Badge>
        ) : null}
      </div>

      {classType.description ? (
        <p className="text-secondary mt-6 max-w-[60ch] text-lg">{classType.description}</p>
      ) : null}

      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">What to expect</h2>
        {classType.longDescription ? (
          <p className="text-secondary mt-3 max-w-[60ch]">{classType.longDescription}</p>
        ) : (
          <div className="text-secondary mt-3 grid max-w-[60ch] gap-3">
            <p>
              A warm-up, then work through arms, legs, seat and core, finishing with a stretch.
              Movements are small and repeated, often holding a chair or the barre for balance.
            </p>
            <p>
              Nobody is watching you and nothing is choreographed. Kelly offers an easier and a
              harder version of most things, so you pick as you go.
            </p>
            <p className="text-muted text-sm">
              Kelly&rsquo;s own description of a class will replace this.
            </p>
          </div>
        )}
      </section>

      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">What to bring</h2>
        {classType.whatToBring ? (
          <p className="text-secondary mt-3 max-w-[60ch]">{classType.whatToBring}</p>
        ) : (
          <p className="text-secondary mt-3 max-w-[60ch]">
            Water, and clothes you can move in. Grippy socks are ideal; bare feet are fine. Whether
            mats are provided at each hall is still being confirmed, so bring one if you have one.
          </p>
        )}
      </section>

      {sessions.length > 0 ? (
        <section className="border-subtle mt-10 border-t pt-6">
          <h2 className="text-[length:var(--text-xl)]">Next sessions</h2>
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
                <Link
                  href={path(`/locations/${session.venue.slug}`)}
                  className="text-muted hover:text-link underline"
                >
                  {session.venue.name}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={path(`/timetable?class=${classType.slug}`)} className="mt-5 inline-block">
            <Button variant="accent">Book a class</Button>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
