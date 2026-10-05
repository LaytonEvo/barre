import { TZDate } from '@date-fns/tz';
import { addDays, format, startOfWeek } from 'date-fns';

/**
 * Everything the public site shows happens in UK local time, while the database
 * stores instants in UTC. These helpers are the only place that conversion
 * happens, so a page never does timezone arithmetic of its own.
 *
 * `UK_TZ` is per-venue in the schema (venues.timezone) to leave room for a
 * future venue elsewhere. Today every venue is Europe/London, and the week
 * navigation is a site-wide concept, so the site timezone is used for grouping.
 */
export const UK_TZ = 'Europe/London';

/** Monday-start week, as the UK expects. */
export function startOfUkWeek(date: Date): Date {
  const local = new TZDate(date, UK_TZ);
  return startOfWeek(local, { weekStartsOn: 1 });
}

export function addUkDays(date: Date, days: number): Date {
  return addDays(new TZDate(date, UK_TZ), days);
}

/** The seven dates of the week containing `date`, Monday first. */
export function ukWeekDays(date: Date): Date[] {
  const monday = startOfUkWeek(date);
  return Array.from({ length: 7 }, (_, i) => addUkDays(monday, i));
}

function inUk(value: Date | string): TZDate {
  return new TZDate(typeof value === 'string' ? new Date(value) : value, UK_TZ);
}

/** 24-hour time, e.g. "18:30". Tabular figures line these up in the timetable. */
export const formatUkTime = (value: Date | string) => format(inUk(value), 'HH:mm');

/** e.g. "Monday 5 October" */
export const formatUkDayLong = (value: Date | string) => format(inUk(value), 'EEEE d MMMM');

/** e.g. "Mon 5 Oct" */
export const formatUkDayShort = (value: Date | string) => format(inUk(value), 'EEE d MMM');

/** e.g. "5 October 2026" */
export const formatUkDate = (value: Date | string) => format(inUk(value), 'd MMMM yyyy');

/** `yyyy-MM-dd` in UK local time — the shape used in ?week= query params. */
export const toUkDateKey = (value: Date | string) => format(inUk(value), 'yyyy-MM-dd');

/**
 * Parse a `?week=yyyy-MM-dd` parameter, falling back to this week.
 *
 * Anything unparseable falls back silently rather than erroring: a mangled URL
 * from a shared link should still show someone a timetable.
 */
export function parseWeekParam(value: string | undefined): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new TZDate(`${value}T12:00:00`, UK_TZ);
    if (!Number.isNaN(parsed.getTime())) return startOfUkWeek(parsed);
  }
  return startOfUkWeek(new Date());
}

/** Duration in whole minutes, for "55 mins". */
export function durationMins(startsAt: string, endsAt: string): number {
  return Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
}
