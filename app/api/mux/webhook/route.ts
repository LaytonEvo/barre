import { NextResponse, type NextRequest } from 'next/server';
import { mux } from '@/lib/mux/client';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { readAssetError, readAssetReady } from '@/lib/mux/events';

/**
 * The Mux webhook. How a video becomes playable.
 *
 * Kelly's browser uploads straight to Mux, so this server never sees the file and
 * has no idea whether it worked. Mux tells us here, and only here.
 *
 * Anyone can POST to this URL, so the signature is verified against the raw body
 * before anything is read out of it. `webhooks.unwrap` does both the verification
 * and the parse, and throws if the signature does not match.
 *
 * Idempotency needs no event table here, unlike Stripe: both database functions
 * this calls are declared idempotent, because attaching the same asset twice is
 * the same state and Mux retries deliveries freely.
 *
 * Testing locally: the Mux dashboard can re-send any delivery, or
 *   mux webhooks forward --to http://localhost:3000/api/mux/webhook
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { MUX_WEBHOOK_SECRET } = serverEnv();
  if (!MUX_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Mux webhooks are not configured.' }, { status: 503 });
  }

  // The RAW body. Parsing first and re-serialising would change the bytes and
  // the signature would never match.
  const raw = await request.text();

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = mux().webhooks.unwrap(raw, Object.fromEntries(request.headers), MUX_WEBHOOK_SECRET) as {
      type?: string;
      data?: Record<string, unknown>;
    };
  } catch {
    // Deliberately terse: a bad signature means someone is poking at the
    // endpoint, and telling them why is free help.
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const db = createAdminClient();

  try {
    switch (event.type) {
      case 'video.asset.ready': {
        const asset = readAssetReady(event.data);

        if (!asset) {
          // Either nothing to attach it to, or no SIGNED playback id — see
          // lib/mux/events.ts for why a public one is refused rather than used.
          // Acknowledged so Mux stops retrying; the admin list keeps showing it
          // as not ready, which is the truth.
          console.error('Mux asset.ready payload not usable', {
            uploadId: (event.data as { upload_id?: unknown } | undefined)?.upload_id,
          });
          return NextResponse.json({ ok: true, attached: false });
        }

        const { error } = await db.rpc('attach_mux_asset', {
          p_upload_id: asset.uploadId,
          p_asset_id: asset.assetId,
          p_playback_id: asset.playbackId,
          p_duration_secs: asset.durationSecs,
        });
        if (error) throw error;

        return NextResponse.json({ ok: true, attached: true });
      }

      case 'video.asset.errored': {
        const { uploadId, message } = readAssetError(event.data);

        if (uploadId) {
          const { error } = await db.rpc('mark_mux_errored', {
            p_upload_id: uploadId,
            p_error: message,
          });
          if (error) throw error;
        }

        return NextResponse.json({ ok: true });
      }

      default:
        // Mux sends a lot of events. Acknowledging the rest keeps the delivery
        // log clean, which is what makes a real failure visible in it.
        return NextResponse.json({ ok: true, ignored: event.type });
    }
  } catch (error) {
    // 500 so Mux retries. A video stuck on "processing" is recoverable; one
    // silently lost is not.
    console.error('Mux webhook handler failed', error);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }
}
