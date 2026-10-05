import type { Metadata } from 'next';
import Link from 'next/link';
import { listClassTypes } from '@/lib/queries/catalogue';
import { localSuffix, SITE } from '@/lib/seo/site';
import { path } from '@/lib/routes';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: `Classes — ${localSuffix}`,
  description: `The barre classes Kelly teaches in ${SITE.town}, St Leonards and St Ives. What to expect, how hard it is, and what to bring.`,
  alternates: { canonical: '/classes' },
};

export default async function ClassesPage() {
  const classTypes = await listClassTypes();

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-4xl)]">Classes</h1>
      <p className="text-secondary mt-4 max-w-[60ch] text-lg">
        Every class is 55 minutes, suitable for all levels, and taught by Kelly.
      </p>

      <div className="mt-10 grid gap-4">
        {classTypes.map((classType) => (
          <article
            key={classType.slug}
            className="border-subtle bg-surface grid gap-3 rounded-lg border p-5 shadow-sm"
          >
            <h2 className="font-display text-[length:var(--text-xl)]">{classType.name}</h2>
            {classType.description ? (
              <p className="text-secondary">{classType.description}</p>
            ) : null}
            <p className="text-muted tabular text-sm">{classType.durationMins} mins · all levels</p>
            <div className="flex flex-wrap gap-2">
              <Link href={path(`/classes/${classType.slug}`)}>
                <Button variant="secondary" size="sm">
                  What to expect
                </Button>
              </Link>
              <Link href={path(`/timetable?class=${classType.slug}`)}>
                <Button variant="accent" size="sm">
                  See times
                </Button>
              </Link>
            </div>
          </article>
        ))}
      </div>

      {classTypes.length === 1 ? (
        <p className="text-muted mt-10 max-w-[60ch] text-sm">
          Kelly currently teaches one class format. If she runs distinct sessions — a shorter
          express class, a beginners&rsquo; course, a pre or postnatal class — each one gets its own
          page here.
        </p>
      ) : null}
    </div>
  );
}
