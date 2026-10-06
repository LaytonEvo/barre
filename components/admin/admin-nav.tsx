'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';
import { cn } from '@/lib/utils';

/**
 * Horizontally scrolling tab bar.
 *
 * Kelly is on a phone, so the nav scrolls sideways rather than collapsing into
 * a hamburger — one tap to reach anything, and the current section stays
 * visible. An instructor sees only the two sections they have access to, which
 * matches what the database will actually allow them.
 *
 * Two things make the sideways scroll usable rather than merely present. The
 * current tab is scrolled into view on load, because arriving at Settings and
 * seeing a nav that starts at Today reads as "Settings is not in here". And the
 * right edge fades, because a row of tabs clipped flush against the screen
 * edge looks like the end of the list: on a phone there is no scrollbar to say
 * otherwise, and Reports, Growth, Content and Settings were all off-screen with
 * nothing to suggest they existed.
 */
const ALL = [
  { href: '/admin', label: 'Today', adminOnly: false },
  { href: '/admin/schedule', label: 'Schedule', adminOnly: true },
  { href: '/admin/members', label: 'Members', adminOnly: true },
  { href: '/admin/enquiries', label: 'Enquiries', adminOnly: true },
  { href: '/admin/videos', label: 'Videos', adminOnly: true },
  { href: '/admin/growth', label: 'Growth', adminOnly: true },
  { href: '/admin/reports', label: 'Reports', adminOnly: true },
  { href: '/admin/content', label: 'Content', adminOnly: true },
  { href: '/admin/settings', label: 'Settings', adminOnly: true },
] as const;

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = ALL.filter((item) => isAdmin || !item.adminOnly);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // `nearest` so a tab already visible does not jump; `instant` because this
    // is where the page starts, not a movement the user asked for.
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'instant' });
  }, [pathname]);

  return (
    <nav
      aria-label="Admin sections"
      className="relative after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8 after:bg-gradient-to-l after:from-[var(--bg-surface)] after:to-transparent md:after:hidden"
    >
      {/* scroll-pr-12 is wider than the fade: scrollIntoView honours scroll
          padding, so without it the tab it scrolls to lands flush against the
          right edge and sits underneath the gradient — the one tab you need to
          see being the one obscured. */}
      <ul className="mx-auto flex max-w-5xl scroll-pr-12 gap-1 overflow-x-auto px-5 pb-2 md:scroll-pr-0 md:px-8">
        {items.map((item) => {
          const active =
            item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                ref={active ? activeRef : undefined}
                href={item.href as Route}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-visible:outline-focus block rounded-md px-3 py-2 text-sm whitespace-nowrap',
                  'focus-visible:outline-2 focus-visible:outline-offset-2',
                  active ? 'bg-action-primary text-white' : 'text-secondary hover:bg-surface-sunk',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
