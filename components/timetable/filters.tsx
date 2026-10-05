import Link from 'next/link';
import { cn } from '@/lib/utils';
import { path } from '@/lib/routes';

type Option = { label: string; slug: string | undefined };

/**
 * Filters as links rather than a <select>.
 *
 * With two venues and one class type, chips are faster to use on a phone than a
 * dropdown, and every combination gets a shareable URL.
 */
export function FilterChips({
  label,
  options,
  active,
  buildHref,
}: {
  label: string;
  options: Option[];
  active: string | undefined;
  buildHref: (slug: string | undefined) => string;
}) {
  // Nothing to filter by when there is only one of something.
  if (options.length < 2) return null;

  return (
    <div className="grid gap-2">
      <p className="text-muted text-xs font-semibold tracking-[0.08em] uppercase">{label}</p>
      <div className="flex flex-wrap gap-2">
        {[{ label: 'All', slug: undefined }, ...options].map((option) => {
          const isActive = option.slug === active;
          return (
            <Link
              key={option.slug ?? 'all'}
              href={path(buildHref(option.slug))}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'focus-visible:outline-focus rounded-full border px-3 py-1.5 text-sm',
                'focus-visible:outline-2 focus-visible:outline-offset-2',
                isActive
                  ? 'bg-action-primary border-transparent text-white'
                  : 'border-subtle text-secondary hover:bg-surface-sunk',
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
