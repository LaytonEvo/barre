import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

/**
 * Placeholder for a route that the nav links to but a later milestone builds.
 *
 * It exists so the header and footer never dead-end in a 404, and so each page
 * states plainly what it is waiting on. Better an honest placeholder than a
 * page of invented content.
 */
export function ComingAtMilestone({
  title,
  milestone,
  summary,
  needs,
}: {
  title: string;
  milestone: string;
  summary: string;
  needs?: string[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 md:px-8">
      <Badge tone="nearly">Arrives at {milestone}</Badge>
      <h1 className="mt-6 text-[length:var(--text-4xl)]">{title}</h1>
      <p className="text-secondary mt-5 max-w-[64ch] text-lg">{summary}</p>

      {needs?.length ? (
        <section className="border-subtle mt-10 border-t pt-6">
          <h2 className="text-[length:var(--text-xl)]">What this page needs first</h2>
          <ul className="text-secondary mt-4 grid gap-2 text-sm">
            {needs.map((need) => (
              <li key={need} className="border-subtle flex gap-3 border-b pb-2">
                <span aria-hidden className="text-muted">
                  —
                </span>
                <span>{need}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-muted mt-8 text-sm">
        <Link href="/" className="text-link underline">
          Back to the homepage
        </Link>
      </p>
    </div>
  );
}
