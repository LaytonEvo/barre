import { test, expect } from '@playwright/test';

/**
 * The conversion path: a stranger arriving from a Google search.
 *
 * Job one of the brief. Nothing here needs an account, which is the point — a
 * first-time visitor must be able to find out what the class is, when it runs, and
 * what it costs before being asked for anything.
 */
test.describe('public site', () => {
  test('a visitor can get from the homepage to the timetable', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page
      .getByRole('link', { name: /book your free class/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/timetable/);
    await expect(page.getByRole('heading', { name: 'Timetable' })).toBeVisible();
  });

  test('the timetable shows real classes with times, venue and spaces', async ({ page }) => {
    await page.goto('/timetable');

    const first = page
      .locator('article, li')
      .filter({ hasText: /spaces left|Full|Waitlist/ })
      .first();
    await expect(first).toBeVisible();
    // Availability must never be colour alone — this is the most colour-coded
    // screen in the product.
    await expect(first).toContainText(/spaces left|Full|Waitlist/);
  });

  test('the timetable can be filtered by venue and the week navigated', async ({ page }) => {
    await page.goto('/timetable');

    await page
      .getByRole('link', { name: /St Ives Primary School/i })
      .first()
      .click();
    await expect(page).toHaveURL(/venue=/);

    await page.getByRole('link', { name: /later/i }).click();
    await expect(page).toHaveURL(/week=/);
    // The venue filter must survive changing week, or the member silently loses it.
    await expect(page).toHaveURL(/venue=/);
  });

  test('pricing leads the free first class rather than burying it', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/first class is free/i).first()).toBeVisible();
  });

  test('a logged-out visitor booking is sent to sign up, not to a dead button', async ({
    page,
  }) => {
    await page.goto('/timetable');
    const book = page.getByRole('link', { name: /^Book$|Sign up to join waitlist/ }).first();
    await book.click();
    await expect(page).toHaveURL(/\/signup|\/login/);
  });

  test('every public page has exactly one h1, which is how a screen reader finds the topic', async ({
    page,
  }) => {
    for (const path of [
      '/',
      '/timetable',
      '/pricing',
      '/about',
      '/classes',
      '/new-here',
      '/gift',
    ]) {
      await page.goto(path);
      await expect(page.locator('h1'), `${path} should have one h1`).toHaveCount(1);
    }
  });

  test('the old gift-vouchers URL redirects to the real page', async ({ page }) => {
    // It was a "coming soon" placeholder the footer linked to after the real page
    // shipped. Anything already pointing here must land somewhere useful.
    await page.goto('/gift-vouchers');
    await expect(page).toHaveURL(/\/gift$/);
    await expect(page.getByRole('heading', { name: /give someone barre/i })).toBeVisible();
  });

  test('the mobile menu opens and reaches the timetable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.getByLabel('Menu').click();
    // Scoped to the main nav: the footer links to the timetable too, and an
    // unscoped match is ambiguous rather than wrong.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Timetable', exact: true })
      .click();
    await expect(page).toHaveURL(/\/timetable/);
  });
});
