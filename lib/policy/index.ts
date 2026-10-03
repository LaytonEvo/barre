import { createClient } from '@/lib/supabase/server';
import { policySchema, type Policy } from './schema';

export * from './rules';
export { policySchema };
export type { Policy, PolicyKey } from './schema';

/**
 * Load the live policy from the settings table.
 *
 * Throws if a key is missing or malformed rather than falling back to a
 * default. A silent default here would mean the cancellation window quietly
 * becoming zero after a bad migration, which is exactly the class of bug that
 * putting these values in the database is meant to prevent.
 */
export async function loadPolicy(): Promise<Policy> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('settings').select('key, value');

  if (error) throw new Error(`Could not load settings: ${error.message}`);

  const raw = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  const parsed = policySchema.safeParse(raw);

  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`settings table does not satisfy the policy schema — ${problems}`);
  }

  return parsed.data;
}

/** Settings nobody has signed off yet. Surfaced in admin and checked at launch. */
export async function unconfirmedSettings(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('key').eq('confirmed', false);
  return (data ?? []).map((row) => row.key);
}
