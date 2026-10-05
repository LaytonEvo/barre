import { test, expect } from '@playwright/test';
import { admin, createMember, createSession, deleteMember } from './support/factory';
import { login } from './support/auth';

/**
 * Kelly's half of the product, on the device she actually uses.
 *
 * ACCEPTANCE 12 is "Kelly checks in a class from a mobile viewport; no-shows
 * processed correctly", so these run at phone width rather than desktop.
 */
test.describe('admin', () => {
  const created: string[] = [];

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test.afterAll(async () => {
    for (const id of created) await deleteMember(id);
  });

  test('ACCEPTANCE 12: Kelly marks a member present from a phone', async ({ page }) => {
    const kelly = await createMember({ prefix: 'kelly', role: 'admin' });
    const member = await createMember({ prefix: 'attendee', credits: 2 });
    created.push(kelly.id, member.id);

    const db = admin();
    // A class starting shortly, so it appears on Today.
    const sessionId = await createSession({ daysAhead: 0 });
    await db
      .from('class_sessions')
      .update({
        starts_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        ends_at: new Date(Date.now() + 85 * 60_000).toISOString(),
      })
      .eq('id', sessionId);
    await db.rpc('book_session', { p_session_id: sessionId, p_user_id: member.id });

    await login(page, kelly.email);
    await page.goto('/admin');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Open the register for that class.
    await page.goto(`/admin/register/${sessionId}`);
    await expect(page.getByText(/Test Member/i).first()).toBeVisible();

    await page
      .getByRole('button', { name: /^Here$/ })
      .first()
      .click();

    await expect(page.getByRole('button', { name: /✓ Here/ }).first()).toBeVisible({
      timeout: 15_000,
    });

    const { data } = await db
      .from('bookings')
      .select('status')
      .eq('session_id', sessionId)
      .eq('user_id', member.id)
      .maybeSingle();
    expect(data?.status, 'attendance should be recorded in the database').toBe('attended');
  });

  test('an instructor cannot reach the member list', async ({ page }) => {
    // The admin/instructor boundary is enforced in the database; this checks the
    // UI does not strand a cover teacher on a page they cannot use.
    const cover = await createMember({ prefix: 'cover', role: 'instructor' });
    created.push(cover.id);

    await login(page, cover.email);
    await page.goto('/admin/members');

    // Either redirected away, or shown a refusal — never a broken page.
    const url = page.url();
    const refused = await page.getByText(/do not have access|not allowed/i).count();
    expect(url.includes('/admin/members') === false || refused > 0).toBe(true);
  });

  test('a member cannot reach the admin area at all', async ({ page }) => {
    const member = await createMember({ prefix: 'nosy' });
    created.push(member.id);

    await login(page, member.email);
    await page.goto('/admin');

    expect(page.url()).not.toContain('/admin');
  });
});
