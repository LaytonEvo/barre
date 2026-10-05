import type { Metadata } from 'next';
import Link from 'next/link';
import { listActiveProducts, listPendingPacks } from '@/lib/queries/catalogue';
import { cancellationPolicyText, loadPolicy } from '@/lib/policy';
import { localSuffix, SITE } from '@/lib/seo/site';
import { formatPence } from '@/lib/utils';
import { freeClasses, pricePerClassPence, savingPercent } from '@/lib/pricing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: `Prices — ${localSuffix}`,
  description: `Barre class prices in ${SITE.town}. Your first class is free, with class packs available. Clear expiry rules and a 24-hour cancellation policy.`,
  alternates: { canonical: '/pricing' },
};

export default async function PricingPage() {
  const [products, pendingPacks, policy] = await Promise.all([
    listActiveProducts(),
    listPendingPacks(),
    loadPolicy(),
  ]);

  const intro = products.find((product) => product.kind === 'intro_offer');
  const dropIn = products.find((product) => product.kind === 'drop_in');
  const packs = products.filter((product) => product.kind === 'pack');

  // Everything on this page that compares prices compares against this one
  // number, so there is no second copy to drift.
  const singlePence = dropIn?.pricePence ?? null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-4xl)]">Prices</h1>
      <p className="text-secondary mt-4 max-w-[60ch] text-lg">
        Start with a free class. If you like it, packs work out cheaper than paying each time.
      </p>

      {/* The free first class is the one price that is confirmed, so it leads. */}
      {intro ? (
        <section className="bg-accent-soft mt-10 grid gap-3 rounded-xl p-6 md:p-8">
          <Badge tone="open">New here</Badge>
          <h2 className="text-[length:var(--text-2xl)]">{intro.name}</h2>
          <p className="text-primary max-w-[52ch]">
            One free class, one per person. No card needed and nothing to cancel — just book a place
            and turn up.
          </p>
          <div className="mt-1">
            <Link href="/timetable">
              <Button variant="accent" size="lg">
                Book your free class
              </Button>
            </Link>
          </div>
        </section>
      ) : null}

      <section className="border-subtle mt-12 border-t pt-6">
        <h2 className="text-[length:var(--text-2xl)]">After that</h2>

        <div className="mt-6 grid gap-4">
          {dropIn ? (
            <article className="border-subtle bg-surface grid gap-1 rounded-lg border p-5">
              <h3 className="font-display text-[length:var(--text-xl)]">{dropIn.name}</h3>
              <p className="text-secondary text-sm">
                {dropIn.description ?? 'Pay as you go, no commitment.'}
              </p>
              <p className="tabular text-heading font-display mt-1 text-[length:var(--text-xl)]">
                {formatPence(dropIn.pricePence)}
              </p>
            </article>
          ) : null}

          {packs.map((pack) => {
            // Derived, never stored: the per-class figure is what makes a pack
            // worth buying, and deriving it means it cannot contradict the price
            // printed beside it.
            const perClass = pricePerClassPence(pack.pricePence, pack.credits);
            const saving = savingPercent(pack.pricePence, pack.credits, singlePence);
            const free = freeClasses(pack.pricePence, pack.credits, singlePence);

            return (
              <article
                key={pack.slug}
                className="border-subtle bg-surface grid gap-1 rounded-lg border p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-[length:var(--text-xl)]">{pack.name}</h3>
                  {saving ? <Badge tone="open">Save {saving}%</Badge> : null}
                </div>

                <p className="text-secondary text-sm">
                  {pack.credits} classes
                  {free ? `, ${free} of them free` : ''}
                  {pack.validityDays ? `. Use them within ${pack.validityDays} days.` : '.'}
                </p>

                <p className="tabular text-heading font-display mt-1 text-[length:var(--text-xl)]">
                  {formatPence(pack.pricePence)}
                </p>

                {perClass ? (
                  <p className="text-muted tabular text-sm">
                    Works out {formatPence(perClass)} a class
                  </p>
                ) : null}
              </article>
            );
          })}

          {pendingPacks.map((pack) => (
            <article
              key={pack.slug}
              className="border-subtle bg-surface grid gap-1 rounded-lg border p-5"
            >
              <h3 className="font-display text-[length:var(--text-xl)]">{pack.name}</h3>
              <p className="text-secondary text-sm">
                {pack.credits} classes
                {pack.validityDays ? `, valid for ${pack.validityDays} days from purchase` : ''}.
              </p>
              <p className="text-muted mt-1 text-sm">Price to be confirmed.</p>
            </article>
          ))}
        </div>

        {pendingPacks.length > 0 ? (
          <p className="text-muted mt-6 max-w-[60ch] text-sm">
            Those prices are being finalised. We would rather leave them blank for a few days than
            publish a number and change it.
          </p>
        ) : null}

        <p className="text-muted mt-6 max-w-[60ch] text-sm">
          Buying online arrives with the booking system. Until then, pay Kelly at the class.
        </p>
      </section>

      {/* Generated from the settings table, so it matches what the booking
          engine will actually enforce. */}
      <section className="border-subtle mt-12 border-t pt-6">
        <h2 className="text-[length:var(--text-2xl)]">Cancelling</h2>
        <div className="mt-4 grid gap-4">
          {cancellationPolicyText(policy)
            .slice(0, 2)
            .map((paragraph) => (
              <p key={paragraph} className="text-secondary max-w-[60ch]">
                {paragraph}
              </p>
            ))}
        </div>
        <Link
          href="/policies/cancellation"
          className="text-link mt-4 inline-block text-sm underline"
        >
          Read the full cancellation policy
        </Link>
      </section>
    </div>
  );
}
