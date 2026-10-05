import { test as setup, expect } from '@playwright/test';
import { admin } from './support/factory';

/**
 * Fails fast and legibly if the stack is not what the suite assumes.
 *
 * Without this, a missing `supabase start` surfaces as a dozen timeouts in
 * unrelated specs, and the real cause — "the database is not running" — is the one
 * thing none of them says.
 */
setup('the stack is up and seeded', async ({ request }) => {
  const db = admin();

  const { error } = await db.from('settings').select('key').limit(1);
  expect(error, 'Supabase is not reachable — run `supabase start`').toBeNull();

  const { data: venues } = await db.from('venues').select('id');
  expect(
    venues?.length ?? 0,
    'no venues — run `supabase db reset` to apply the seed',
  ).toBeGreaterThan(0);

  const { data: waiver } = await db
    .from('waiver_versions')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  expect(
    waiver,
    'no current waiver — booking is gated on one, so every spec would fail',
  ).not.toBeNull();

  const response = await request.get('/');
  expect(response.status(), 'the app did not start').toBe(200);
});
