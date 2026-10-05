import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Deliver gift vouchers on their chosen date.
 *
 * ACCEPTANCE TEST 14's middle step. A voucher bought on the 3rd for the 25th must
 * not appear in the recipient's inbox on the 3rd, which is why delivery is driven
 * from `send_at` here rather than from the Stripe webhook.
 *
 * The order is: queue the email, then mark the voucher sent. That way a failure
 * between the two leaves the voucher unsent and it is retried next run — the
 * dedupe index on notifications stops the queued row being duplicated. Marking it
 * sent first would risk a gift that was paid for and never delivered, which is
 * the worse of the two failures by a long way.
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
  const { data: due, error } = await db.rpc('vouchers_due_to_send');

  if (error) {
    console.error('Could not read vouchers due to send', error);
    return NextResponse.json({ error: 'Could not read the voucher queue.' }, { status: 500 });
  }

  let queued = 0;

  for (const voucher of due ?? []) {
    // The recipient has no account — they may never have heard of Barre By Kelly
    // — so the notification carries the address directly rather than a user id.
    const { error: enqueueError } = await db.rpc('enqueue_notification', {
      p_user_id: null,
      p_to_email: voucher.recipient_email,
      p_template: 'voucher_gift',
      p_subject_type: 'voucher',
      p_subject_id: voucher.id,
      p_payload: {
        recipientName: voucher.recipient_name ?? undefined,
        purchaserName: voucher.purchaser_name ?? undefined,
        code: voucher.code,
        description: `${voucher.credits} ${voucher.credits === 1 ? 'class' : 'classes'}`,
        message: voucher.message ?? undefined,
        expiresAt: new Date(voucher.expires_at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      },
    });

    if (enqueueError) {
      console.error('Could not queue a gift voucher email', voucher.id, enqueueError);
      continue;
    }

    const { error: markError } = await db.rpc('mark_voucher_sent', { p_id: voucher.id });
    if (markError) {
      console.error('Queued a voucher email but could not mark it sent', voucher.id, markError);
      continue;
    }

    queued += 1;
  }

  return NextResponse.json({ ok: true, due: (due ?? []).length, queued });
}
