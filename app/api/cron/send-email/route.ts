import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchEmails } from '@/lib/email/dispatch';
import { isEmailConfigured } from '@/lib/email/client';

/**
 * Drain the email queue.
 *
 * Runs often — every few minutes — because a booking confirmation that arrives an
 * hour later is worse than useless: the member has already wondered whether the
 * booking worked and emailed Kelly to ask.
 *
 * All the rules live in `lib/email/dispatch.ts`. This route authenticates and
 * reports.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { CRON_SECRET } = serverEnv();
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'Cron is not configured.' }, { status: 503 });
  }

  const provided =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.headers.get('x-cron-secret');

  if (provided !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
  }

  if (!isEmailConfigured()) {
    // 200, not 503: a deployment without email keys is a valid state during
    // setup, and a cron job that alarms every five minutes about it trains
    // everyone to ignore the alarm.
    return NextResponse.json({ ok: true, skipped: 'email is not configured' });
  }

  const outcome = await dispatchEmails(createAdminClient());

  return NextResponse.json({ ok: true, ...outcome });
}
