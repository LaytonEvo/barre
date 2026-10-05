import './render.setup';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeekNav } from '@/components/timetable/week-nav';
import { FilterChips } from '@/components/timetable/filters';
import { startOfUkWeek, addUkDays, toUkDateKey } from '@/lib/time';

const href = (week: Date) => `/timetable?week=${toUkDateKey(week)}`;

const renderNav = (weekStart: Date, bookingWindowDays = 14) =>
  renderToStaticMarkup(
    <WeekNav weekStart={weekStart} bookingWindowDays={bookingWindowDays} buildHref={href} />,
  );

const thisWeek = startOfUkWeek(new Date());

describe('WeekNav', () => {
  it('disables Earlier on the current week, so nobody browses into the past', () => {
    const html = renderNav(thisWeek);
    // The disabled control is a button with no surrounding link.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*←\s*Earlier/);
    expect(html).not.toContain(`href="${href(addUkDays(thisWeek, -7))}"`);
  });

  it('offers Later while inside the booking window', () => {
    expect(renderNav(thisWeek)).toContain(`href="${href(addUkDays(thisWeek, 7))}"`);
  });

  it('stops offering Later past the booking window', () => {
    // A 7-day window means next week is the last one that can be reached.
    const html = renderNav(addUkDays(thisWeek, 7), 7);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*Later/);
  });

  it('hides the This week shortcut when already on this week', () => {
    expect(renderNav(thisWeek)).not.toContain('This week');
  });

  it('offers the This week shortcut once you have navigated away', () => {
    const html = renderNav(addUkDays(thisWeek, 7));
    expect(html).toContain('This week');
    expect(html).toContain(`href="${href(thisWeek)}"`);
  });

  it('marks prev and next for crawlers and assistive tech', () => {
    const html = renderNav(addUkDays(thisWeek, 7));
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
  });

  it('navigates with real links, not client state, so a week is shareable', () => {
    // Every destination is an href. No onClick-only navigation.
    expect(renderNav(addUkDays(thisWeek, 7))).toContain('href="/timetable?week=');
  });
});

describe('FilterChips', () => {
  const venues = [
    { label: 'St Leonards & St Ives Village Hall', slug: 'st-leonards-village-hall' },
    { label: 'St Ives Primary School', slug: 'st-ives-primary-school' },
  ];

  const render = (active: string | undefined, options = venues) =>
    renderToStaticMarkup(
      <FilterChips
        label="Venue"
        options={options}
        active={active}
        buildHref={(slug) => (slug ? `/timetable?venue=${slug}` : '/timetable')}
      />,
    );

  it('renders a chip per venue plus an All option', () => {
    const html = render(undefined);
    expect(html).toContain('All');
    expect(html).toContain('St Leonards &amp; St Ives Village Hall');
    expect(html).toContain('St Ives Primary School');
  });

  it('marks the active filter for assistive tech, not just visually', () => {
    const html = render('st-ives-primary-school');
    expect(html).toMatch(
      /href="\/timetable\?venue=st-ives-primary-school"[^>]*aria-current="true"/,
    );
  });

  it('treats All as active when no filter is set', () => {
    expect(render(undefined)).toMatch(/href="\/timetable"[^>]*aria-current="true"/);
  });

  it('renders nothing when there is only one thing to filter by', () => {
    // One class type means the Class filter is noise, not a feature.
    expect(render(undefined, [{ label: 'Barre', slug: 'barre' }])).toBe('');
  });
});
