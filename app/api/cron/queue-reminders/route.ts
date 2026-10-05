import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Queue class reminders.
 *
 * This only writes rows into `notifications`; sending is M8. Splitting the two
 * means the decision about WHO gets a reminder is made once, deterministically,
 * and can be inspected before anything leaves the building.
 *
 * Double-sending is prevented by the unique index on
 * (user_id, template, subject_type, subject_id), so two overlapping runs cannot
 * both queue the same reminder — the second loses on the index rather than
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

  const db = createAdminClient();

  const { data: setting } = await db
    .from('settings')
    .select('value')
    .eq('key', 'reminder_offsets_hours')
    .maybeSingle();

  const offsets = Array.isArray(setting?.value) ? (setting.value as number[]) : [24, 2];

  let queued = 0;

  for (const hours of offsets) {
    // Sessions starting inside this offset but not yet inside the next one down.
    const windowStart = new Date(Date.now() + hours * 3_600_000 - 30 * 60_000).toISOString();
    const windowEnd = new Date(Date.now() + hours * 3_600_000 + 30 * 60_000).toISOString();

    const { data: sessions } = await db
      .from('class_sessions')
      .select('id, starts_at')
      .eq('status', 'scheduled')
      .gte('starts_at', windowStart)
      .lt('starts_at', windowEnd);

    for (const session of sessions ?? []) {
      const { data: bookings } = await db
        .from('bookings')
        .select('id, user_id')
        .eq('session_id', session.id)
        .eq('status', 'booked');

      for (const booking of bookings ?? []) {
        const { error } = await db.from('notifications').insert({
          user_id: booking.user_id,
          template: `reminder_${hours}h`,
          subject_type: 'class_session',
          subject_id: session.id,
          scheduled_for: new Date().toISOString(),
          payload: { booking_id: booking.id, hours_before: hours },
        });

        // 23505 is the dedupe index doing its job, not a failure.
        if (!error) queued += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, queued });
}
