import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Nightly credit expiry.
 *
 * Worth being clear about what this does and does not do. It does NOT make
 * balances correct — `credit_balance` already excludes expired lots by date, so
 * a missed run can never let someone book with dead credits. What it writes is
 * the audit row that tells a member *why* credits disappeared.
 *
 * That is deliberate: a job that the system's correctness depends on is a job
 * that will eventually take the system down.
 *
 * Scheduled by Supabase pg_cron. The shared secret stops anyone else calling it.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { CRON_SECRET } = serverEnv();

  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'Cron is not configured.' }, { status: 503 });
  }

  // Vercel Cron sends Authorization; pg_cron sends the header directly.
  const provided =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.headers.get('x-cron-secret');

  if (provided !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc('expire_credits');

  if (error) {
    console.error('Credit expiry failed', error);
    return NextResponse.json({ error: 'Expiry failed.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lotsExpired: data ?? 0 });
}
