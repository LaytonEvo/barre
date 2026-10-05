/**
 * Calendar invitations.
 *
 * Hand-built rather than pulled from a library: the format is small, and a
 * dependency that silently changes how it escapes text is a worse trade than
 * forty lines we control. The fiddly parts are all here — CRLF line endings,
 * escaping, and folding at 75 octets — because calendar clients are strict and
 * fail silently when they are not met.
 */

export type CalendarEvent = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: Date | string;
  endsAt: Date | string;
  url?: string;
  organiser?: { name: string; email?: string };
  /** A cancellation, which tells the client to remove it from the calendar. */
  cancelled?: boolean;
  /** Bumped on each change so clients accept the update rather than ignoring it. */
  sequence?: number;
};

/** iCalendar's UTC form: 20261005T173000Z. */
function stamp(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** Commas, semicolons, backslashes and newlines are all significant. */
function escape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold at 75 octets, continuing with a leading space.
 *
 * Counted in BYTES, not characters: a venue name with an en dash or a pound
 * sign is multi-byte in UTF-8, and splitting mid-character produces a file some
 * clients reject outright.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  let start = 0;

  while (start < bytes.length) {
    const limit = chunks.length === 0 ? 75 : 74; // continuations spend one on the space
    let end = Math.min(start + limit, bytes.length);

    // Walk back off a continuation byte so a character is never split.
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;

    chunks.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
  }

  return chunks.join('\r\n ');
}

export function buildIcs(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Barre By Kelly//Booking//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${event.cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(event.endsAt)}`,
    `SUMMARY:${escape(event.title)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `STATUS:${event.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(event.description ? [`DESCRIPTION:${escape(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escape(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    ...(event.organiser
      ? [
          `ORGANIZER;CN=${escape(event.organiser.name)}:mailto:${
            event.organiser.email ?? 'noreply@barrebykelly.invalid'
          }`,
        ]
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // CRLF is required by RFC 5545. Plain \n works in some clients and not others,
  // which is the worst kind of bug to chase.
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** "Add to calendar" link for Google, which takes its own URL format. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(event.startsAt)}/${stamp(event.endsAt)}`,
    ...(event.description ? { details: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
