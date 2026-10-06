import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { PASSWORD } from './factory';

/**
 * Log in through the real form.
 *
 * Through the UI rather than by injecting a session cookie, because the login form
 * and the session cookie it sets are themselves part of what these tests exist to
 * verify — and a hand-forged cookie that works is not evidence the real one does.
 *
 * Fields are addressed by id rather than by label: the page offers a magic-link
 * alternative whose label ("Email me a link instead") also contains the word
 * Email, so a label match is ambiguous.
 */
export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  // Scoped to the form: the header carries its own "Log in" control.
  await page
    .locator('form')
    .filter({ has: page.locator('#password') })
    .getByRole('button', { name: 'Log in', exact: true })
    .click();

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
  // A redirect away from /login is necessary but not sufficient — assert the
  // session actually took, or later failures blame the wrong thing.
  // Either control proves a session: a member sees "My account", and staff on a
  // phone see "Admin" instead, because the header shows one primary control at
  // that width and Kelly's is the register, not her own bookings.
  await expect(page.getByRole('link', { name: /my account|admin/i }).first()).toBeVisible({
    timeout: 10_000,
  });
}
