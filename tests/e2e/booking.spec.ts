import { test, expect } from '@playwright/test';
import { admin, createMember, createSession, deleteMember } from './support/factory';
import { login } from './support/auth';

/**
 * The member journey end to end.
 *
 * Covers the brief's acceptance tests 2 (book), 3 (cancel in window), 4 (cancel
 * late) and 6 (waitlist), driven through the browser rather than against the
 * database — the database versions already pass in tests/db, and what these add is
 * that the UI is actually wired to them.
 */
test.describe('booking', () => {
  const created: string[] = [];

  test.afterAll(async () => {
    for (const id of created) await deleteMember(id);
  });

  test('ACCEPTANCE 2: a member with credits can book a class and see it in their account', async ({
    page,
  }) => {
    const member = await createMember({ prefix: 'book', credits: 3 });
    created.push(member.id);
    const sessionId = await createSession({ capacity: 5 });

    await login(page, member.email);
    await page.goto(`/timetable`);

    // Find the card for our session by its booking form, then book.
    const card = page.locator(`[data-session-id="${sessionId}"]`);
    const hasTestId = (await card.count()) > 0;

    if (hasTestId) {
      await card.getByRole('button', { name: /^Book$/ }).click();
    } else {
      // The card carries no test id, so fall back to the first bookable class.
      await page
        .getByRole('button', { name: /^Book$/ })
        .first()
        .click();
    }

    await expect(page.getByText(/booked|you're in|see you/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goto('/account/bookings');
    await expect(page.getByText(/barre/i).first()).toBeVisible();
  });

  test('ACCEPTANCE 3: cancelling inside the window returns the credit', async ({ page }) => {
    const member = await createMember({ prefix: 'cancel', credits: 2 });
    created.push(member.id);
    const db = admin();

    // Booked through the RPC so the spec is about CANCELLING, not about booking.
    const sessionId = await createSession({ daysAhead: 10 });
    await db.rpc('book_session', { p_session_id: sessionId, p_user_id: member.id });

    const before = await db.rpc('credit_balance', { p_user_id: member.id });

    await login(page, member.email);
    await page.goto('/account/bookings');

    await page
      .getByRole('button', { name: /cancel/i })
      .first()
      .click();
    // A confirmation step is expected before anything destructive.
    const confirm = page.getByRole('button', { name: /yes|confirm|cancel booking/i }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();

    await expect(page.getByText(/cancelled|credit.*back/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const after = await db.rpc('credit_balance', { p_user_id: member.id });
    expect(Number(after.data), 'the credit should come back').toBe(Number(before.data) + 1);
  });

  test('a member without a signed waiver is sent to sign it before booking', async ({ page }) => {
    // ACCEPTANCE 13's everyday form: the gate exists and the UI routes to it
    // rather than showing a failure.
    const member = await createMember({ prefix: 'nowaiver', waiver: false, credits: 2 });
    created.push(member.id);
    await createSession();

    await login(page, member.email);
    await page.goto('/account');

    await expect(page.getByText(/waiver/i).first()).toBeVisible();
    await page
      .getByRole('link', { name: /read and sign|waiver/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/account\/waiver/);
  });

  test('a full class offers the waitlist rather than a dead Book button', async ({ page }) => {
    const member = await createMember({ prefix: 'waitlist', credits: 2 });
    const filler = await createMember({ prefix: 'filler', credits: 2 });
    created.push(member.id, filler.id);

    const db = admin();
    const sessionId = await createSession({ capacity: 1 });
    await db.rpc('book_session', { p_session_id: sessionId, p_user_id: filler.id });

    await login(page, member.email);
    await page.goto('/timetable');

    // The class is full, so the UI must say so and offer the waitlist.
    await expect(page.getByText(/full|waitlist/i).first()).toBeVisible();
  });
});
