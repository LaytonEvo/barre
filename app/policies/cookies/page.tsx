import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Cookie policy',
  description:
    'What Barre By Kelly stores in your browser, and why. Analytics only loads if you say yes.',
  alternates: { canonical: '/policies/cookies' },
};

/**
 * Written from what the site actually does, not from a template.
 *
 * Each row below corresponds to real code: the Supabase auth cookies set by
 * proxy.ts, the consent key written by components/site/cookie-consent.tsx, and
 * Plausible, which only loads once consent is granted.
 */
const STORED = [
  {
    name: 'Supabase authentication',
    type: 'Cookie',
    purpose:
      'Keeps you logged in as you move between pages. Set only after you log in, and removed when you log out.',
    consent:
      'Strictly necessary — no consent needed, because without it you cannot have an account.',
  },
  {
    name: 'bbk-analytics-consent',
    type: 'Local storage',
    purpose:
      'Remembers whether you said yes or no to analytics, so we stop asking. It holds only the word "granted" or "denied".',
    consent: 'Strictly necessary — it exists to record your choice.',
  },
  {
    name: 'Plausible Analytics',
    type: 'No cookie',
    purpose:
      'Counts page views so we know which pages are useful. Plausible does not use cookies and does not build a profile of you or follow you to other sites.',
    consent: 'Only loads if you choose "That’s fine". Say no and the script is never requested.',
  },
] as const;

export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-4xl)]">Cookie policy</h1>

      <p className="text-secondary mt-5 max-w-[62ch] text-lg">
        Short version: we store what is needed to keep you logged in, we remember whether you said
        yes to analytics, and that is it. No advertising, no tracking you around the internet, and
        nothing sold to anybody.
      </p>

      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">What we store</h2>

        <div className="mt-6 grid gap-5">
          {STORED.map((item) => (
            <article key={item.name} className="border-subtle bg-surface rounded-lg border p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-[length:var(--text-lg)] font-semibold">
                  {item.name}
                </h3>
                <span className="text-muted text-xs tracking-[0.08em] uppercase">{item.type}</span>
              </div>
              <p className="text-secondary mt-2 text-sm">{item.purpose}</p>
              <p className="text-muted mt-2 text-sm">{item.consent}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Changing your mind</h2>
        <p className="text-secondary mt-3 max-w-[62ch]">
          Clearing this site&rsquo;s data in your browser settings removes your stored choice, and
          we will ask again next time you visit. Saying no does not stop you using any part of the
          site.
        </p>
      </section>

      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Why we ask at all</h2>
        <p className="text-secondary mt-3 max-w-[62ch]">
          Plausible is cookieless, and arguably we would not have to ask. We ask anyway, because it
          is still a request to someone else&rsquo;s server and you ought to get to decide.
        </p>
      </section>

      <p className="text-muted mt-10 text-sm">
        How we handle your personal information is a separate thing, covered in our{' '}
        <Link href="/policies/privacy" className="text-link underline">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
