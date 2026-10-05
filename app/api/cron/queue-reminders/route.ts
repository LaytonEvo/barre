import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Queue class reminders.
 *
 * This only writes rows into `notifications`; `/api/cron/send-email` sends them.
 * Splitting the two means the decision about WHO gets a reminder is made once,
 * deterministically, and can be inspected before anything leaves the building.
 *
 * The selection and the payload are both in `queue_class_reminders()`. They used
 * to be here, and the payload was wrong: it carried `{booking_id, hours_before}`
 * while the template needs the class, the time, the venue and the cancellation
 * window, so every reminder would have failed to render. Building it from
 * `booking_email_payload` — the same function the confirmation email uses — is
 * what stops that happening again.
 *
 * Double-sending is prevented by the unique index on
 * (user_id, template, subject_type, subject_id): two overlapping runs cannot both
 * queue the same reminder, because the second loses on the index rather than
 * relying on this code to remember.
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

  const { data, error } = await createAdminClient().rpc('queue_class_reminders');

  if (error) {
    console.error('Queueing reminders failed', error);
    return NextResponse.json({ error: 'Could not queue reminders.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, queued: data ?? 0 });
}
