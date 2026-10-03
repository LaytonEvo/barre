import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { policySchema } from '@/lib/policy/schema';

/**
 * Guards the seam between the settings migration and the policy schema.
 *
 * These two files are edited at different times for different reasons, and a
 * key present in one but not the other fails at runtime on a page load rather
 * than in CI. This test moves that failure forward.
 */
const migration = readFileSync(
  new URL('../../supabase/migrations/20260101001000_settings_defaults.sql', import.meta.url),
  'utf8',
);

function seededKeys(): string[] {
  // Rows look like:  ('key_name', '<json>', 'description', false),
  return [...migration.matchAll(/^\s*\('([a-z0-9_]+)',/gm)].map((match) => match[1]!);
}

describe('settings defaults migration', () => {
  it('seeds exactly the keys the policy schema requires', () => {
    const required = Object.keys(policySchema.shape).sort();
    const seeded = seededKeys().sort();
    expect(seeded).toEqual(required);
  });

  it('marks placeholder business rules as unconfirmed', () => {
    // Section 0 of the brief was unfilled, so nothing business-specific may
    // claim to be confirmed. If someone later sets one of these to true without
    // Kelly actually confirming it, this fails.
    for (const key of [
      'cancellation_window_hours',
      'booking_window_days',
      'waitlist_cutoff_hours',
      'primary_town',
      'contact_email',
    ]) {
      const row = migration.match(new RegExp(`\\('${key}',[\\s\\S]*?\\)[,;]`))?.[0] ?? '';
      expect(row, `${key} should be seeded`).not.toBe('');
      expect(row, `${key} must not be marked confirmed`).toContain('false');
    }
  });
});
