import { describe, expect, it } from 'vitest';
import { buildIcs, googleCalendarUrl } from '@/lib/booking/ics';

/**
 * Calendar clients are strict and fail silently. A file with the wrong line
 * endings or a badly folded line does not error — it just never appears in
 * somebody's calendar, and nobody finds out until they miss a class.
 */
const base = {
  uid: 'booking-abc@barrebykelly',
  title: 'Barre with Kelly',
  startsAt: '2026-10-05T17:30:00Z',
  endsAt: '2026-10-05T18:25:00Z',
};

describe('buildIcs', () => {
  it('uses CRLF line endings, as RFC 5545 requires', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('\r\n');
    // A bare LF anywhere means some clients will reject the whole file.
    expect(ics.split('\r\n').join('')).not.toContain('\n');
  });

  it('writes times in iCalendar UTC form', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('DTSTART:20261005T173000Z');
    expect(ics).toContain('DTEND:20261005T182500Z');
  });

  it('carries a stable UID, so an update replaces rather than duplicates', () => {
    expect(buildIcs(base)).toContain('UID:booking-abc@barrebykelly');
  });

  it('escapes the characters iCalendar treats as structure', () => {
    const ics = buildIcs({
      ...base,
      location: 'St Leonards Hall, Braeside Road; Ringwood',
      description: 'Line one\nLine two',
    });
    expect(ics).toContain('Braeside Road\; Ringwood');
    expect(ics).toContain('Hall\\, Braeside');
    expect(ics).toContain('Line one\\nLine two');
  });

  it('marks a cancellation so the client removes it from the calendar', () => {
    const ics = buildIcs({ ...base, cancelled: true, sequence: 1 });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    // Without a higher SEQUENCE, clients ignore the update.
    expect(ics).toContain('SEQUENCE:1');
  });

  it('is CONFIRMED and PUBLISH by default', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('METHOD:PUBLISH');
  });

  it('folds long lines at 75 octets with a leading space', () => {
    const ics = buildIcs({ ...base, description: 'x'.repeat(200) });
    for (const line of ics.split('\r\n')) {
      expect(Buffer.from(line, 'utf8').length).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain('\r\n ');
  });

  it('folds on byte boundaries, never splitting a multi-byte character', () => {
    // A venue name with an en dash or a pound sign is multi-byte in UTF-8.
    // Splitting mid-character produces a file some clients reject outright.
    const ics = buildIcs({ ...base, description: '£'.repeat(100) });
    const unfolded = ics
      .split('\r\n')
      .map((line) => (line.startsWith(' ') ? line.slice(1) : `\n${line}`))
      .join('');
    expect(unfolded).toContain('£'.repeat(100));
    expect(unfolded).not.toContain('�'); // the replacement character
  });

  it('omits optional fields rather than emitting empty ones', () => {
    const ics = buildIcs(base);
    expect(ics).not.toContain('LOCATION:');
    expect(ics).not.toContain('DESCRIPTION:');
    expect(ics).not.toContain('ORGANIZER');
  });

  it('opens and closes the calendar and the event', () => {
    const ics = buildIcs(base);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });
});

describe('googleCalendarUrl', () => {
  it('builds a prefilled Google Calendar link', () => {
    const url = new URL(googleCalendarUrl({ ...base, location: 'St Leonards Hall' }));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('dates')).toBe('20261005T173000Z/20261005T182500Z');
    expect(url.searchParams.get('text')).toBe('Barre with Kelly');
    expect(url.searchParams.get('location')).toBe('St Leonards Hall');
  });
});
