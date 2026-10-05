import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/database.types';

/**
 * Test data, created through the service role.
 *
 * Deliberately NOT created through the UI. Signing a waiver and answering nine
 * health questions through the browser before every test would make each spec a
 * test of the onboarding flow with its real subject buried at the end — slow, and
 * misattributing every failure. Onboarding has its own spec that does drive the UI.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function admin(): SupabaseClient<Database> {
  if (!SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — run `supabase start` and export it.');
  }
  return createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const PASSWORD = 'barre-e2e-password-1';

/** A unique address per run, so repeated runs do not collide on the unique index. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

export type TestMember = { id: string; email: string };

/**
 * A confirmed member who can log in.
 *
 * `email_confirm: true` matters: without it Supabase holds the account pending a
 * confirmation click, and the login would fail for a reason that has nothing to do
 * with what is being tested.
 */
export async function createMember(
  options: {
    prefix?: string;
    waiver?: boolean;
    parq?: boolean;
    credits?: number;
    role?: 'admin' | 'instructor';
    marketingConsent?: boolean;
  } = {},
): Promise<TestMember> {
  const db = admin();
  const email = uniqueEmail(options.prefix ?? 'member');

  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !created.user) throw new Error(`could not create user: ${error?.message}`);

  const id = created.user.id;

  await db
    .from('profiles')
    .update({
      first_name: 'Test',
      last_name: 'Member',
      marketing_consent: options.marketingConsent ?? false,
    })
    .eq('id', id);

  if (options.waiver !== false) {
    const { data: waiver } = await db
      .from('waiver_versions')
      .select('id')
      .eq('is_current', true)
      .maybeSingle();

    if (waiver) {
      await db.from('waiver_signatures').insert({
        user_id: id,
        waiver_version_id: waiver.id,
        typed_name: 'Test Member',
        signature_image_path: `${id}/sig.png`,
      });
    }
  }

  if (options.parq !== false) {
    await db.from('health_questionnaires').insert({
      user_id: id,
      questionnaire_version: 'v1',
      answers: {},
      explicit_consent_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    });
  }

  if (options.credits && options.credits > 0) {
    await db.rpc('grant_credits', {
      p_user_id: id,
      p_quantity: options.credits,
      p_kind: 'purchase',
      p_expires_at: new Date(Date.now() + 180 * 86_400_000).toISOString(),
      p_reason: 'e2e fixture',
    });
  }

  if (options.role) {
    await db.from('user_roles').insert({ user_id: id, role: options.role });
  }

  return { id, email };
}

/**
 * A class in the near future, with a controllable capacity.
 *
 * `is_one_off` so it does not collide with the generated timetable, and far enough
 * ahead to sit inside the booking window but outside the cancellation window.
 */
export async function createSession(
  options: { capacity?: number; daysAhead?: number; instructorId?: string } = {},
): Promise<string> {
  const db = admin();

  const [{ data: classType }, { data: venue }, { data: instructor }] = await Promise.all([
    db.from('class_types').select('id').limit(1).maybeSingle(),
    db.from('venues').select('id').limit(1).maybeSingle(),
    db.from('instructors').select('id').eq('slug', 'kelly-brooks').maybeSingle(),
  ]);

  if (!classType || !venue || !instructor) throw new Error('seed data missing');

  const starts = new Date(Date.now() + (options.daysAhead ?? 3) * 86_400_000);
  const ends = new Date(starts.getTime() + 55 * 60_000);

  const { data, error } = await db
    .from('class_sessions')
    .insert({
      class_type_id: classType.id,
      venue_id: venue.id,
      instructor_id: options.instructorId ?? instructor.id,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      capacity: options.capacity ?? 25,
      is_one_off: true,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`could not create session: ${error?.message}`);
  return data.id;
}

/** Tear-down helper: removes a member and everything cascading from them. */
export async function deleteMember(id: string): Promise<void> {
  await admin().auth.admin.deleteUser(id);
}
