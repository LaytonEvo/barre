import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { clientEnv } from '@/lib/env';
import type { Database } from '@/lib/db/database.types';

export type DbClient = SupabaseClient<Database>;

/**
 * Anonymous client with no cookie handling.
 *
 * Needed for code that runs without an HTTP request — `generateStaticParams`,
 * `sitemap.ts`, build-time prerendering — where `cookies()` is unavailable.
 *
 * It uses the anon key, so RLS still applies in full: it can read exactly what a
 * logged-out visitor can read and nothing more. That is the right level of
 * access for the public catalogue, and it is emphatically NOT the service-role
 * client in `admin.ts`, which bypasses RLS entirely.
 */
export function createPublicClient(): DbClient {
  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
