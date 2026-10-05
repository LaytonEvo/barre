import { describe, expect, it } from 'vitest';
import {
  addUkDays,
  durationMins,
  formatUkDayLong,
  formatUkTime,
  parseWeekParam,
  startOfUkWeek,
  toUkDateKey,
  ukWeekDays,
} from '@/lib/time';

/**
 * The timetable is read in UK local time while the database stores UTC, so these
 * conversions are the difference between a class showing at 18:30 and at 17:30.
 * The clock-change cases are the ones that actually bite.
 */

describe('formatUkTime', () => {
  it('renders a BST instant in local time', () => {
    // 2026-10-19 18:30 BST is 17:30 UTC.
    expect(formatUkTime('2026-10-19T17:30:00Z')).toBe('18:30');
  });

  it('renders a GMT instant in local time', () => {
    // After the 25 October change, 18:30 local is 18:30 UTC.
    expect(formatUkTime('2026-10-26T18:30:00Z')).toBe('18:30');
  });

  it('shows the same wall-clock time either side of the clock change', () => {
    // This is the property that matters: a weekly 18:30 class stays 18:30.
    expect(formatUkTime('2026-10-19T17:30:00Z')).toBe(formatUkTime('2026-10-26T18:30:00Z'));
  });

  it('handles the March change too', () => {
    // 2027-03-28 is the spring change; 19:15 local is 18:15 UTC afterwards.
    expect(formatUkTime('2027-03-29T18:15:00Z')).toBe('19:15');
  });
});

describe('startOfUkWeek', () => {
  it('starts weeks on Monday, as the UK expects', () => {
    // 2026-10-07 is a Wednesday.
    expect(toUkDateKey(startOfUkWeek(new Date('2026-10-07T12:00:00Z')))).toBe('2026-10-05');
  });

  it('treats Sunday as the end of the week, not the start', () => {
    // 2026-10-11 is a Sunday; its week began on Monday the 5th.
    expect(toUkDateKey(startOfUkWeek(new Date('2026-10-11T12:00:00Z')))).toBe('2026-10-05');
  });

  it('is stable when applied twice', () => {
    const once = startOfUkWeek(new Date('2026-10-07T12:00:00Z'));
    expect(toUkDateKey(startOfUkWeek(once))).toBe(toUkDateKey(once));
  });

  it('puts a late-evening Sunday instant in the right week', () => {
    // 23:30 UTC on Sunday 11 October is still Sunday locally (BST, so 00:30 Mon
    // would be the next week — this is 00:30 BST on the 12th).
    expect(toUkDateKey(startOfUkWeek(new Date('2026-10-11T23:30:00Z')))).toBe('2026-10-12');
  });
});

describe('ukWeekDays', () => {
  it('returns seven days, Monday first', () => {
    const days = ukWeekDays(new Date('2026-10-07T12:00:00Z')).map(toUkDateKey);
    expect(days).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('spans the clock change without losing or repeating a day', () => {
    // The week containing 25 October 2026, when the clocks go back.
    const days = ukWeekDays(new Date('2026-10-21T12:00:00Z')).map(toUkDateKey);
    expect(days).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(new Set(days).size).toBe(7);
  });
});

describe('addUkDays', () => {
  it('adds a calendar day across the clock change, not 24 hours', () => {
    // 24 to 25 October 2026 is a 25-hour day locally.
    expect(toUkDateKey(addUkDays(new Date('2026-10-24T12:00:00Z'), 1))).toBe('2026-10-25');
  });

  it('goes backwards', () => {
    expect(toUkDateKey(addUkDays(new Date('2026-10-05T12:00:00Z'), -7))).toBe('2026-09-28');
  });
});

describe('parseWeekParam', () => {
  it('accepts a valid date and snaps it to that Monday', () => {
    expect(toUkDateKey(parseWeekParam('2026-10-07'))).toBe('2026-10-05');
  });

  it('falls back to this week on junk rather than throwing', () => {
    // A mangled URL from a shared link should still show someone a timetable.
    const thisWeek = toUkDateKey(startOfUkWeek(new Date()));
    for (const junk of ['', 'next-week', '2026-13-99', '../../etc/passwd', '2026-10-7']) {
      expect(toUkDateKey(parseWeekParam(junk))).toBe(thisWeek);
    }
  });

  it('falls back when the parameter is absent', () => {
    expect(toUkDateKey(parseWeekParam(undefined))).toBe(toUkDateKey(startOfUkWeek(new Date())));
  });

  it('rejects a well-shaped but impossible date', () => {
    const thisWeek = toUkDateKey(startOfUkWeek(new Date()));
    expect(toUkDateKey(parseWeekParam('2026-02-30'))).not.toBe('2026-02-30');
    expect(toUkDateKey(parseWeekParam('9999-99-99'))).toBe(thisWeek);
  });
});

describe('durationMins', () => {
  it('measures the real 55-minute class', () => {
    expect(durationMins('2026-10-05T17:30:00Z', '2026-10-05T18:25:00Z')).toBe(55);
  });

  it('is unaffected by the clock change, because it compares instants', () => {
    expect(durationMins('2026-10-25T00:30:00Z', '2026-10-25T01:25:00Z')).toBe(55);
  });
});

describe('formatUkDayLong', () => {
  it('reads as a UK date', () => {
    expect(formatUkDayLong('2026-10-05T17:30:00Z')).toBe('Monday 5 October');
  });
});
