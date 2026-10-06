import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { path } from '@/lib/routes';
import { addUkMonths, formatUkMonthLong, startOfUkMonth, toUkMonthKey } from '@/lib/time';

/**
 * Month navigation as plain links, not client state.
 *
 * Each month is a real URL, so it can be shared, bookmarked, crawled and opened
 * in a new tab, and the page needs no JavaScript to navigate.
 *
 * The bounds come from the classes that actually exist rather than from the
 * booking window: Earlier and Later are offered exactly when there is a month
 * worth landing on, so neither ever leads to an empty page.
 */
export function MonthNav({
  month,
  earliest,
  latest,
  buildHref,
}: {
  month: Date;
  earliest: Date | null;
  latest: Date | null;
  buildHref: (month: Date) => string;
}) {
  const thisMonth = startOfUkMonth(new Date());
  const previous = addUkMonths(month, -1);
  const next = addUkMonths(month, 1);

  const floor = earliest ? toUkMonthKey(startOfUkMonth(earliest)) : toUkMonthKey(thisMonth);
  const ceiling = latest ? toUkMonthKey(startOfUkMonth(latest)) : toUkMonthKey(thisMonth);

  // Never go back past this month: the timetable is for booking, and last
  // month's classes have happened.
  const lowerBound = floor > toUkMonthKey(thisMonth) ? floor : toUkMonthKey(thisMonth);

  const canGoBack = toUkMonthKey(previous) >= lowerBound;
  const canGoForward = toUkMonthKey(next) <= ceiling;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-secondary text-sm">
        <span className="text-primary text-base font-medium">{formatUkMonthLong(month)}</span>
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

        {toUkMonthKey(month) !== toUkMonthKey(thisMonth) ? (
          <Link href={path(buildHref(thisMonth))}>
            <Button variant="ghost" size="sm">
              This month
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
