import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { clientEnv, serverEnv } from '@/lib/env';
import type { Database } from '@/lib/db/database.types';

/**
 * Service-role client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * Legitimate callers, and nothing else:
 *   - Stripe webhook handlers (fulfilment; the user has no session)
 *   - Cron routes (session generation, reminders, credit expiry)
 *   - The seed script
 *
 * Never call this from a page, a layout, or a Server Action reached from the UI.
 * ESLint blocks importing this module outside those paths; if you are adding an
 * override, that is the moment to check whether you actually want it.
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();

  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
