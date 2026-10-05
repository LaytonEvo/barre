import './render.setup';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionCard } from '@/components/timetable/session-card';
import type { TimetableSession } from '@/lib/queries/timetable';

/**
 * The timetable card is the most-seen component in the product and the one that
 * carries the most state: open, nearly full, full, cancelled. Rendering it for
 * real is the closest thing to looking at the page.
 */
const base: TimetableSession = {
  id: 'sess-1',
  startsAt: '2026-10-05T17:30:00Z', // 18:30 BST
  endsAt: '2026-10-05T18:25:00Z',
  capacity: 25,
  status: 'scheduled',
  note: null,
  classType: { name: 'Barre', slug: 'barre', level: 'all_levels' },
  venue: {
    name: 'St Leonards & St Ives Village Hall',
    slug: 'st-leonards-village-hall',
    city: 'Ringwood',
  },
  instructor: { displayName: 'Kelly Brooks' },
  spacesLeft: 20,
  bookedCount: 5,
  waitlistCount: 0,
};

/** Signed out by default — the state most visitors arrive in. */
const render = (session: TimetableSession, signedIn = false) =>
  renderToStaticMarkup(<SessionCard session={session} signedIn={signedIn} />);

/** Visible text only, with every tag and attribute stripped. */
const visibleText = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

describe('SessionCard', () => {
  it('shows the class in UK local time, not UTC', () => {
    // The instant is 17:30Z. The member must READ 18:30, while the machine-
    // readable attribute keeps the unambiguous instant — so the UTC value is
    // expected in the markup and must be excluded before asserting on text.
    const text = visibleText(render(base));
    expect(text).toContain('18:30');
    expect(text).not.toContain('17:30');
  });

  it('shows the real duration', () => {
    expect(render(base)).toContain('55 mins');
  });

  it('names the venue and links to its page', () => {
    const html = render(base);
    expect(html).toContain('St Leonards &amp; St Ives Village Hall');
    expect(html).toContain('href="/locations/st-leonards-village-hall"');
  });

  it('names the instructor', () => {
    expect(render(base)).toContain('Kelly Brooks');
  });

  it('offers a booking action when there is room', () => {
    const html = render(base);
    expect(html).toContain('20 spaces left');
    expect(html).toContain('Book');
  });

  it('sends a signed-out visitor to sign up rather than to a dead button', () => {
    expect(render(base)).toContain('href="/signup"');
  });

  it('gives a signed-in member the real booking control', () => {
    const html = render(base, true);
    // The action form, not a link away.
    expect(html).toContain('<form');
    expect(html).toContain('name="id"');
    expect(html).not.toContain('href="/signup"');
  });

  it('singularises one remaining space', () => {
    const html = render({ ...base, spacesLeft: 1 });
    expect(html).toContain('1 space left');
    expect(html).not.toContain('1 spaces');
  });

  it('switches to the waitlist action when full, and offers no Book button', () => {
    const signedIn = render({ ...base, spacesLeft: 0 }, true);
    expect(signedIn).toContain('Full');
    expect(signedIn).toContain('Join waitlist');
    expect(signedIn).not.toContain('>Book<');
  });

  it('points a signed-out visitor at sign-up when the class is full', () => {
    const html = render({ ...base, spacesLeft: 0 });
    expect(html).toContain('Full');
    expect(html).toContain('Sign up to join waitlist');
    expect(html).toContain('href="/signup"');
  });

  it('marks a cancelled class without offering any action', () => {
    const html = render({ ...base, status: 'cancelled' }, true);
    expect(html).toContain('Cancelled');
    expect(html).not.toContain('>Book<');
    expect(html).not.toContain('Waitlist');
    // Colour alone is never the signal, but the strike-through reinforces it.
    expect(html).toContain('line-through');
  });

  it('never relies on colour alone — every state carries words', () => {
    for (const session of [
      base,
      { ...base, spacesLeft: 2 },
      { ...base, spacesLeft: 0 },
      { ...base, status: 'cancelled' as const },
    ]) {
      expect(visibleText(render(session))).toMatch(/space|Full|Cancelled/);
    }
  });

  it('renders a session note when there is one', () => {
    expect(render({ ...base, note: 'Bring a mat this week' })).toContain('Bring a mat this week');
  });

  it('carries the session id as an anchor, so structured data can deep-link', () => {
    expect(render(base)).toContain('id="sess-1"');
  });

  it('uses tabular figures so times line up down the list', () => {
    expect(render(base)).toContain('tabular');
  });

  it('emits a machine-readable datetime for the class', () => {
    // Matched case-insensitively on purpose. React 19 emits the attribute as
    // `dateTime` rather than lowercasing it the way it lowercases `className`.
    // That is harmless — HTML attribute names are ASCII case-insensitive, so a
    // browser parses it as `datetime` either way — but pinning the exact casing
    // would make this test fail on a React upgrade for no real reason.
    expect(render(base)).toMatch(/datetime="2026-10-05T17:30:00Z"/i);
  });
});
