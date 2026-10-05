import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { path } from '@/lib/routes';
import { addUkDays, formatUkDate, toUkDateKey, startOfUkWeek } from '@/lib/time';

/**
 * Week navigation as plain links, not client state.
 *
 * Each week is a real URL, so it can be shared, bookmarked, crawled and opened
 * in a new tab — and the page needs no JavaScript to navigate.
 */
export function WeekNav({
  weekStart,
  bookingWindowDays,
  buildHref,
}: {
  weekStart: Date;
  bookingWindowDays: number;
  buildHref: (week: Date) => string;
}) {
  const thisWeek = startOfUkWeek(new Date());
  const previous = addUkDays(weekStart, -7);
  const next = addUkDays(weekStart, 7);

  // Do not offer weeks beyond the booking window: a visitor who navigates there
  // sees an empty grid and concludes there are no classes at all.
  const lastBookableWeek = startOfUkWeek(addUkDays(thisWeek, bookingWindowDays));
  const canGoBack = toUkDateKey(previous) >= toUkDateKey(thisWeek);
  const canGoForward = toUkDateKey(next) <= toUkDateKey(lastBookableWeek);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-secondary text-sm">
        Week of <span className="text-primary font-medium">{formatUkDate(weekStart)}</span>
      </p>

      <div className="flex items-center gap-2">
        {canGoBack ? (
          <Link href={path(buildHref(previous))} rel="prev">
            <Button variant="secondary" size="sm">
              &larr; Earlier
            </Button>
          </Link>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            &larr; Earlier
          </Button>
        )}

        {toUkDateKey(weekStart) !== toUkDateKey(thisWeek) ? (
          <Link href={path(buildHref(thisWeek))}>
            <Button variant="ghost" size="sm">
              This week
            </Button>
          </Link>
        ) : null}

        {canGoForward ? (
          <Link href={path(buildHref(next))} rel="next">
            <Button variant="secondary" size="sm">
              Later &rarr;
            </Button>
          </Link>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            Later &rarr;
          </Button>
        )}
      </div>
    </div>
  );
}
