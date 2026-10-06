import Link from 'next/link';
import Image from 'next/image';
import { LOGO } from '@/lib/images';
import { loadPolicy } from '@/lib/policy';

const COLUMNS = [
  {
    heading: 'Classes',
    links: [
      { href: '/timetable', label: 'Timetable' },
      { href: '/classes', label: 'Class types' },
      { href: '/locations', label: 'Locations' },
      { href: '/new-here', label: 'New here' },
    ],
  },
  {
    heading: 'Book',
    links: [
      { href: '/pricing', label: 'Pricing' },
      { href: '/gift', label: 'Gift vouchers' },
      { href: '/private-and-events', label: 'Private & events' },
      { href: '/faq', label: 'FAQs' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/policies/cancellation', label: 'Cancellation policy' },
      { href: '/policies/terms', label: 'Terms' },
      { href: '/policies/privacy', label: 'Privacy' },
      { href: '/policies/cookies', label: 'Cookies' },
    ],
  },
] as const;

export async function SiteFooter() {
  // Contact details come from settings. Empty means not supplied yet, and the
  // footer hides the row rather than rendering a placeholder as if it were real.
  const policy = await loadPolicy().catch(() => null);

  return (
    <footer className="border-subtle bg-surface-sunk mt-24 border-t">
      <div className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-3">
            {/* The mark rather than the name. alt carries the name, so nothing
                is lost to a screen reader or to a search engine. */}
            <Image
              src={LOGO.src}
              alt="Barre By Kelly"
              width={160}
              height={160}
              className="size-20"
            />
            <p className="text-muted max-w-[28ch] text-sm">
              Barre classes for all levels and all bodies.
            </p>
            {policy?.contact_email ? (
              <a href={`mailto:${policy.contact_email}`} className="text-link text-sm">
                {policy.contact_email}
              </a>
            ) : null}
            {policy?.contact_phone ? (
              <a href={`tel:${policy.contact_phone}`} className="text-link text-sm">
                {policy.contact_phone}
              </a>
            ) : null}
          </div>

          {COLUMNS.map((column) => (
            <nav
              key={column.heading}
              aria-label={column.heading}
              className="grid content-start gap-3"
            >
              <p className="text-muted text-xs font-semibold tracking-[0.08em] uppercase">
                {column.heading}
              </p>
              <ul className="grid gap-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-secondary hover:text-link text-sm">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-subtle text-muted mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-6 text-xs">
          <p>&copy; {new Date().getFullYear()} Barre By Kelly</p>
          {policy?.facebook_url ? (
            <a
              href={policy.facebook_url}
              className="hover:text-link focus-visible:outline-focus inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              rel="noreferrer noopener"
            >
              {/* Inline rather than from the icon set: lucide removed its brand
                  marks, and a brand glyph is not something to approximate with a
                  generic one. */}
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="size-4 shrink-0"
              >
                <path d="M9.198 21.5h4v-8.01h3.604l.396-3.98h-4V7.5a1 1 0 0 1 1-1h3v-4h-3a5 5 0 0 0-5 5v2.01h-2l-.396 3.98h2.396v8.01Z" />
              </svg>
              Facebook
            </a>
          ) : null}
          {policy?.instagram_handle ? (
            <a
              href={`https://instagram.com/${policy.instagram_handle.replace('@', '')}`}
              className="hover:text-link"
              rel="noreferrer noopener"
            >
              Instagram
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
