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
            width={40}
            height={40}
            priority
            className="size-9 shrink-0"
          />
          {/* The mark alone is not legible enough at this size to stand in for
              the name, so the wordmark stays as text. */}
          <span className="font-display text-heading text-lg font-semibold tracking-tight">
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

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {user ? (
            <>
              {isStaff(user) && (
                <Link href="/admin">
                  <Button variant="ghost" size="sm">
                    Admin
                  </Button>
                </Link>
              )}
              <Link href="/account">
                <Button variant="secondary" size="sm">
                  My account
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
