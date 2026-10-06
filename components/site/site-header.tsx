import Link from 'next/link';
import Image from 'next/image';
import { LOGO } from '@/lib/images';
import { getSessionUser, isStaff } from '@/lib/supabase/auth';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/timetable', label: 'Timetable' },
  { href: '/classes', label: 'Classes' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/new-here', label: 'New here' },
  { href: '/about', label: 'About' },
] as const;

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="border-subtle bg-page/95 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-5 md:px-8">
        <Link
          href="/"
          className="focus-visible:outline-focus flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Image
            src={LOGO.src}
            alt=""
            width={96}
            height={96}
            priority
            className="size-12 shrink-0"
          />
          {/* The mark carries the name, but only at a size nobody reads it at:
              the ring of letters turns to texture below about 48px. The wordmark
              therefore stays as live text — smaller now that the mark is doing
              more of the work, but still the thing that is actually legible. */}
          <span className="font-display text-heading text-base font-semibold tracking-tight">
            Barre By Kelly
          </span>
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-secondary hover:bg-surface-sunk hover:text-link focus-visible:outline-focus rounded-md px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile menu.
            A <details> disclosure rather than a client component with state: it
            needs no JavaScript, no hydration, and keeps this header a server
            component — and <summary> is keyboard-operable for free.

            Without it a phone visitor saw only the logo and "Book a class", with
            no route to the timetable, pricing or class descriptions except by
            scrolling to the footer. On a site where most traffic is a phone, that
            is most of the navigation missing. */}
        <details className="group relative ml-auto md:hidden">
          <summary
            className="focus-visible:outline-focus text-secondary hover:bg-surface-sunk flex size-9 cursor-pointer list-none items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
            aria-label="Menu"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" className="group-open:hidden" />
              <path d="M6 6l12 12M18 6L6 18" className="hidden group-open:block" />
            </svg>
          </summary>

          <nav
            aria-label="Main"
            className="border-subtle bg-surface absolute right-0 z-50 mt-2 w-56 rounded-lg border p-2 shadow-lg"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-secondary hover:bg-surface-sunk hover:text-link focus-visible:outline-focus block rounded-md px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {item.label}
              </Link>
            ))}
            {isStaff(user) ? (
              <Link
                href="/account"
                className="text-secondary hover:bg-surface-sunk hover:text-link focus-visible:outline-focus border-subtle mt-1 block rounded-md border-t px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                My account
              </Link>
            ) : null}
            {!user ? (
              <Link
                href="/login"
                className="text-secondary hover:bg-surface-sunk hover:text-link focus-visible:outline-focus border-subtle mt-1 block rounded-md border-t px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Log in
              </Link>
            ) : null}
          </nav>
        </details>

        <div className="flex items-center gap-2 md:ml-0">
          {user ? (
            <>
              {/* One primary control on a phone, both from md up.
                  Signed in as staff the bar held a 48px mark, the wordmark, a
                  menu button and two labelled buttons, which is wider than a
                  390px screen. Admin is the one that stays: Kelly runs classes
                  from a phone in a hall, and the register is what she is
                  reaching for. A member has no Admin button, so they keep
                  theirs. Whichever gives way is in the menu below. */}
              {isStaff(user) && (
                <Link href="/admin">
                  <Button variant="secondary" size="sm">
                    Admin
                  </Button>
                </Link>
              )}
              <Link
                href="/account"
                aria-label="My account"
                className={isStaff(user) ? 'hidden md:inline-flex' : undefined}
              >
                <Button variant="secondary" size="sm">
                  <span className="md:hidden">Account</span>
                  <span className="hidden md:inline">My account</span>
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </Link>
              <Link href="/timetable">
                <Button variant="accent" size="sm">
                  Book a class
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
