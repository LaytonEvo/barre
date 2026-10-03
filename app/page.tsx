import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Holding page.
 *
 * M1 is foundations: auth, schema, RLS, layout. The real homepage is M2 and
 * needs Kelly's photos and the Section 0 business details before it can say
 * anything true about where and when the classes are.
 */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-24">
      <Badge tone="nearly">Pre-launch · M1 foundations</Badge>

      <h1 className="font-display mt-6 text-[length:var(--text-5xl)] leading-[1.05]">
        All levels, all bodies.
      </h1>

      <p className="text-secondary mt-6 max-w-[60ch] text-lg">
        Barre blends ballet-inspired movement with Pilates and strength work. Small movements, high
        repetitions, and a lot of shaking — which is the point. No dance experience needed.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/timetable">
          <Button variant="accent" size="lg">
            See the timetable
          </Button>
        </Link>
        <Link href="/styleguide">
          <Button variant="secondary" size="lg">
            View the styleguide
          </Button>
        </Link>
      </div>

      <section className="border-subtle mt-20 border-t pt-8">
        <h2 className="text-[length:var(--text-xl)]">What is still needed here</h2>
        <p className="text-muted mt-3 max-w-[64ch] text-sm">
          This page is deliberately sparse. The real homepage arrives at M2, and it needs the inputs
          below before it can say anything true. Nothing on this site invents a venue, a price, a
          class time or a review.
        </p>
        <ul className="text-secondary mt-5 grid max-w-[64ch] gap-2 text-sm">
          {[
            'Kelly’s photos, to replace placeholder blocks — no stock photography will be used',
            'The town, which every local-SEO decision depends on',
            'Venues, the timetable, and class type names',
            'Pricing and the intro offer',
            'Real Google reviews, or an empty state until they exist',
          ].map((item) => (
            <li key={item} className="border-subtle flex gap-3 border-b pb-2">
              <span aria-hidden className="text-muted">
                —
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted mt-5 text-sm">
          Tracked in <code className="font-mono text-xs">docs/03-OPEN-QUESTIONS.md</code>.
        </p>
      </section>
    </div>
  );
}
