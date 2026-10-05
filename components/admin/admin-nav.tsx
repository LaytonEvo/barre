'use client';

import Link from 'next/link';
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
 */
const ALL = [
  { href: '/admin', label: 'Today', adminOnly: false },
  { href: '/admin/schedule', label: 'Schedule', adminOnly: true },
  { href: '/admin/members', label: 'Members', adminOnly: true },
  { href: '/admin/enquiries', label: 'Enquiries', adminOnly: true },
  { href: '/admin/reports', label: 'Reports', adminOnly: true },
  { href: '/admin/content', label: 'Content', adminOnly: true },
  { href: '/admin/settings', label: 'Settings', adminOnly: true },
] as const;

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = ALL.filter((item) => isAdmin || !item.adminOnly);

  return (
    <nav aria-label="Admin sections" className="overflow-x-auto">
      <ul className="mx-auto flex max-w-5xl gap-1 px-5 pb-2 md:px-8">
        {items.map((item) => {
          const active =
            item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
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
