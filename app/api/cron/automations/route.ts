import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * The lifecycle automations (brief §11).
 *
 * This route only ENQUEUES. Deciding who gets an email is done in SQL (see
 * 20260105001300_automations.sql) and sending is done by the email dispatcher, so
 * each of the three steps can be inspected on its own. Running this job does not
 * send anything, which makes it safe to run while setting up.
 *
 * Running daily is enough for all four. Nothing here is time-critical to the
 * minute, and a daily cadence means at most one of each per member per day even
 * if the dedupe index were ever relaxed.
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
  const queued = { firstClass: 0, winBack: 0, review: 0, expiring: 0 };

  // A null return from enqueue_notification means the dedupe index refused it:
  // this notification already exists. That is the normal case on a daily job and
  // is not counted or logged.
  type EnqueueArgs = {
    p_user_id: string | null;
    p_template: string;
    p_subject_type: string;
    p_subject_id: string;
    p_payload: Record<string, unknown>;
  };

  const enqueue = async (args: EnqueueArgs) => {
    const { data, error } = await db.rpc('enqueue_notification', args);
    if (error) {
      console.error('Could not enqueue', args.p_template, error);
      return false;
    }
    return data !== null;
  };

  // --- How did your first class go? -----------------------------------------
  const { data: followUps } = await db.rpc('due_first_class_follow_ups');
  for (const row of followUps ?? []) {
    // Keyed on the booking, so somebody's first class is followed up once, ever.
    if (
      await enqueue({
        p_user_id: row.user_id,
        p_template: 'first_class_follow_up',
        p_subject_type: 'booking',
        p_subject_id: row.booking_id,
        p_payload: {
          firstName: row.first_name ?? undefined,
          className: row.class_name,
          creditsLeft: row.credits_left,
        },
      })
    ) {
      queued.firstClass += 1;
    }
  }

  // --- Win-back (marketing) -------------------------------------------------
  const { data: winBacks } = await db.rpc('due_win_backs');
  for (const row of winBacks ?? []) {
    // Keyed on the member, so a win-back is sent once and does not become a
    // monthly nag. If Kelly wants a second campaign later that is a deliberate
    // act, not a side effect of this job still running.
    if (
      await enqueue({
        p_user_id: row.user_id,
        p_template: 'win_back',
        p_subject_type: 'member',
        p_subject_id: row.user_id,
        p_payload: {
          firstName: row.first_name ?? undefined,
          weeksAway: row.weeks_away,
          creditsLeft: row.credits_left,
        },
      })
    ) {
      queued.winBack += 1;
    }
  }

  // --- Review request (marketing) -------------------------------------------
  const { data: reviews } = await db.rpc('due_review_requests');
  const { data: reviewUrlSetting } = await db
    .from('settings')
    .select('value')
    .eq('key', 'google_review_url')
    .maybeSingle();

  const reviewUrl = typeof reviewUrlSetting?.value === 'string' ? reviewUrlSetting.value : null;

  if (reviewUrl) {
    for (const row of reviews ?? []) {
      if (
        await enqueue({
          p_user_id: row.user_id,
          p_template: 'review_request',
          p_subject_type: 'member',
          p_subject_id: row.user_id,
          p_payload: {
            firstName: row.first_name ?? undefined,
            classesAttended: row.attended,
            reviewUrl,
          },
        })
      ) {
        queued.review += 1;
      }
    }
  }

  // --- Credits about to expire ----------------------------------------------
  const { data: expiring } = await db.rpc('due_credit_expiry_warnings');
  for (const row of expiring ?? []) {
    // Keyed on the LOT, not the member: two packs expiring on different dates are
    // two different things to be told about.
    if (
      await enqueue({
        p_user_id: row.user_id,
        p_template: 'credits_expiring',
        p_subject_type: 'credit_lot',
        p_subject_id: row.lot_id,
        p_payload: {
          credits: row.credits,
          daysLeft: row.days_left,
          expiresAt: new Date(row.expires_at).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
          }),
        },
      })
    ) {
      queued.expiring += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    queued,
    // Stated explicitly so an empty run is not mistaken for a broken one: no
    // review URL means no review requests, by design.
    reviewRequestsSkipped: reviewUrl ? null : 'google_review_url setting is empty',
  });
}
