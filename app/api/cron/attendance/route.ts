import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Nightly attendance tidy-up, in two steps that must happen in this order.
 *
 * 1. `auto_mark_no_shows` turns bookings nobody checked in into *pending*
 *    no-shows, 30 minutes after the class starts.
 * 2. `confirm_pending_no_shows` promotes pending ones nobody disputed to
 *    confirmed, 48 hours after the class.
 *
 * Running them in the other order would confirm a no-show in the same pass that
 * created it whenever the job had not run for two days — which is precisely the
 * window the pending state exists to protect.
 *
 * Unlike credit expiry, this job does change what the data says: an unchecked-in
 * booking stays `booked` until it runs. That is the safe direction to fail in
 * (nobody is marked absent by a job that did not run), but it does mean a long
 * outage shows up as a register full of stale rows rather than silently.
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

  const marked = await db.rpc('auto_mark_no_shows');
  if (marked.error) {
    console.error('Auto-marking no-shows failed', marked.error);
    return NextResponse.json({ error: 'Auto-mark failed.' }, { status: 500 });
  }

  const confirmed = await db.rpc('confirm_pending_no_shows');
  if (confirmed.error) {
    // The first step already committed, and it is idempotent, so a retry is safe.
    console.error('Confirming pending no-shows failed', confirmed.error);
    return NextResponse.json({ error: 'Confirmation failed.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    markedPending: marked.data ?? 0,
    confirmed: confirmed.data ?? 0,
  });
}
