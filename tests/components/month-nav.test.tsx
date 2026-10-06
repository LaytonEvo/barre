import './render.setup';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MonthNav } from '@/components/timetable/month-nav';
import { FilterChips } from '@/components/timetable/filters';
import { addUkMonths, startOfUkMonth, toUkMonthKey } from '@/lib/time';

const href = (month: Date) => `/timetable?month=${toUkMonthKey(month)}`;

const thisMonth = startOfUkMonth(new Date());

/** By default there are classes from this month until three months out. */
const renderNav = (
  month: Date,
  latest: Date | null = addUkMonths(thisMonth, 3),
  earliest: Date | null = thisMonth,
) =>
  renderToStaticMarkup(
    <MonthNav month={month} earliest={earliest} latest={latest} buildHref={href} />,
  );

describe('MonthNav', () => {
  it('disables Earlier on the current month, so nobody browses into the past', () => {
    const html = renderNav(thisMonth);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*←\s*Earlier/);
    expect(html).not.toContain(`href="${href(addUkMonths(thisMonth, -1))}"`);
  });

  it('offers Later while there are still classes scheduled', () => {
    expect(renderNav(thisMonth)).toContain(`href="${href(addUkMonths(thisMonth, 1))}"`);
  });

  it('stops offering Later past the last scheduled class, so it never lands on an empty month', () => {
    // Nothing scheduled beyond this month.
    const html = renderNav(thisMonth, thisMonth);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*Later/);
  });

  it('offers Later even beyond the booking window, because the timetable is also read to plan', () => {
    // Three months of classes exist; only two weeks of them can be booked. The
    // nav follows the classes, not the window.
    const html = renderNav(addUkMonths(thisMonth, 1));
    expect(html).toContain(`href="${href(addUkMonths(thisMonth, 2))}"`);
  });

  it('copes with no classes at all rather than offering a month that cannot exist', () => {
    const html = renderNav(thisMonth, null, null);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*Later/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*←\s*Earlier/);
  });

  it('hides the This month shortcut when already on this month', () => {
    expect(renderNav(thisMonth)).not.toContain('This month');
  });

  it('offers the This month shortcut once you have navigated away', () => {
    const html = renderNav(addUkMonths(thisMonth, 1));
    expect(html).toContain('This month');
    expect(html).toContain(`href="${href(thisMonth)}"`);
  });

  it('marks prev and next for crawlers and assistive tech', () => {
    const html = renderNav(addUkMonths(thisMonth, 1));
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
  });

  it('navigates with real links, not client state, so a month is shareable', () => {
    expect(renderNav(addUkMonths(thisMonth, 1))).toContain('href="/timetable?month=');
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
