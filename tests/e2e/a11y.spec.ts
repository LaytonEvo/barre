import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createMember, deleteMember } from './support/factory';
import { login } from './support/auth';

/**
 * Accessibility, against the real rendered DOM.
 *
 * axe cannot prove a page is usable — it cannot judge whether a label makes
 * sense, or whether focus order is logical. What it does catch is the mechanical
 * majority: contrast, names, roles, landmarks, form labelling. Those are the
 * failures that make a page unusable with a screen reader, and they are exactly
 * the ones that creep back in silently.
 *
 * Run at WCAG 2.2 AA because that is the level UK public-facing services are held
 * to, and a small business site has no reason to aim lower.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * A failure that names the element and the measured problem.
 *
 * A bare rule id ("color-contrast") sends you hunting through a page; the
 * selector and axe's own summary say which element and by how much.
 */
function describe(
  path: string,
  violation: { id: string; nodes: { target: unknown[]; failureSummary?: string }[] },
) {
  return violation.nodes.map(
    (node) =>
      `${path} — ${violation.id} at ${node.target.join(' ')}: ${(node.failureSummary ?? '').replace(/\s+/g, ' ').trim()}`,
  );
}

const PUBLIC_PAGES = [
  '/',
  '/timetable',
  '/pricing',
  '/classes',
  '/about',
  '/new-here',
  '/contact',
  '/gift',
  '/redeem',
  '/login',
  '/signup',
  '/policies/cancellation',
];

test.describe('accessibility', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), `${path} did not load`).toBeLessThan(400);

      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

      // Named in the failure rather than just counted, so a regression says what
      // broke without opening a report.
      expect(
        violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`),
        `${path} accessibility violations`,
      ).toEqual([]);
    });
  }

  test('the mobile menu is accessible when open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByLabel('Menu').click();

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  test('the member account area is accessible', async ({ page }) => {
    const member = await createMember({ prefix: 'a11y', credits: 1 });
    try {
      await login(page, member.email);

      for (const path of ['/account', '/account/bookings', '/account/videos']) {
        await page.goto(path);
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(violations.flatMap((v) => describe(path, v))).toEqual([]);
      }
    } finally {
      await deleteMember(member.id);
    }
  });

  test('Kelly’s admin pages are accessible on a phone', async ({ page }) => {
    // The register is used one-handed in a cold hall, so it is the screen where
    // tap targets and labelling matter most.
    const kelly = await createMember({ prefix: 'a11y-admin', role: 'admin' });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await login(page, kelly.email);

      for (const path of ['/admin', '/admin/members', '/admin/schedule', '/admin/growth']) {
        await page.goto(path);
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(violations.flatMap((v) => describe(path, v))).toEqual([]);
      }
    } finally {
      await deleteMember(kelly.id);
    }
  });
});
