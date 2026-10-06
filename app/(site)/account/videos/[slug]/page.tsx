import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VideoPlayer } from '@/components/videos/player';
import { signPlayback } from '@/lib/mux/playback';
import { isPlaybackSigningConfigured } from '@/lib/mux/client';
import { durationLabel, levelLabel } from '@/lib/videos/filters';

export const metadata: Metadata = { title: 'Video', robots: { index: false } };

// A page that mints a signed token must never be cached: the token is per-member
// and short-lived, and a cached copy would hand one member's token to the next.
export const dynamic = 'force-dynamic';

export default async function VideoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/account/videos`);
  const supabase = await createClient();

  // Metadata first, under RLS — any member may read this, which is what lets a
  // member without on-demand access see what they are missing.
  const { data: video } = await supabase
    .from('videos')
    .select(
      'id, title, slug, description, duration_secs, level, equipment, safe_for_pregnancy, safety_note, category_id, published, publish_at',
    )
    .eq('slug', slug)
    .maybeSingle();

  if (!video) notFound();

  const [{ data: entitled }, { data: progress }, { data: favourite }] = await Promise.all([
    supabase.rpc('can_watch_videos', { p_user_id: user.id }),
    supabase
      .from('video_progress')
      .select('position_secs, completed_at')
      .eq('user_id', user.id)
      .eq('video_id', video.id)
      .maybeSingle(),
    supabase
      .from('video_favourites')
      .select('video_id')
      .eq('user_id', user.id)
      .eq('video_id', video.id)
      .maybeSingle(),
  ]);

  const meta = [levelLabel(video.level), durationLabel(video.duration_secs)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 md:px-8">
      <Link href="/account/videos" className="text-link text-sm underline">
        ← All videos
      </Link>

      <h1 className="mt-4 text-[length:var(--text-2xl)]">{video.title}</h1>
      <p className="text-muted mt-1 text-sm">{meta}</p>

      <div className="mt-6">
        {entitled ? (
          <PlayerOrExplanation
            videoId={video.id}
            title={video.title}
            startAt={progress?.position_secs ?? 0}
            favourite={Boolean(favourite)}
            complete={Boolean(progress?.completed_at)}
          />
        ) : (
          <Locked />
        )}
      </div>

      {video.safety_note ? (
        <div className="bg-status-nearly-bg mt-6 rounded-lg p-4">
          <p className="text-status-nearly-fg text-sm font-semibold">Before you start</p>
          <p className="text-primary mt-1 text-sm">{video.safety_note}</p>
        </div>
      ) : null}

      {video.safe_for_pregnancy ? (
        <div className="mt-4">
          <Badge tone="open">Safe during pregnancy</Badge>
        </div>
      ) : null}

      {video.description ? (
        <div className="mt-6">
          <h2 className="text-[length:var(--text-lg)]">About this class</h2>
          <p className="text-secondary mt-2 whitespace-pre-line">{video.description}</p>
        </div>
      ) : null}

      {video.equipment.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-[length:var(--text-lg)]">What you need</h2>
          <ul className="text-secondary mt-2 list-inside list-disc text-sm">
            {video.equipment.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The playback grant is a separate call from the metadata read, and the only way
 * a playback id leaves the database. It re-checks entitlement itself, so this is
 * two independent gates rather than one trusted twice.
 */
async function PlayerOrExplanation({
  videoId,
  title,
  startAt,
  favourite,
  complete,
}: {
  videoId: string;
  title: string;
  startAt: number;
  favourite: boolean;
  complete: boolean;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('video_playback_grant', { p_video_id: videoId });
  const grant = data?.[0];

  if (error || !grant) {
    // Most likely a video that is uploaded but not published, reached by someone
    // who had the link. Saying so plainly beats a dead player.
    return (
      <Unavailable message="This video is not available to watch yet. It may still be processing, or not published." />
    );
  }

  if (!isPlaybackSigningConfigured()) {
    // A deployment with API credentials but no signing key. Worth naming exactly,
    // because the cause is one missing variable and nothing in the UI hints at it.
    return (
      <Unavailable message="Video playback is not configured on this deployment (no Mux signing key). Kelly has been told." />
    );
  }

  const signed = await signPlayback(grant.playback_id);

  return (
    <VideoPlayer
      videoId={videoId}
      playbackId={signed.playbackId}
      tokens={signed.tokens}
      title={title}
      startAt={grant.position_secs ?? startAt}
      initiallyFavourite={favourite}
      initiallyComplete={complete}
    />
  );
}

function Unavailable({ message }: { message: string }) {
  return (
    <div className="border-subtle bg-surface-sunk rounded-xl border p-6">
      <p className="text-primary text-sm">{message}</p>
    </div>
  );
}

function Locked() {
  return (
    <div className="border-strong bg-accent-soft rounded-xl border p-6">
      <p className="text-primary font-medium">This one is for on-demand members</p>
      <p className="text-secondary mt-1 text-sm">
        Add on-demand access to your plan and you can watch this and everything else in the library,
        as often as you like.
      </p>
      <div className="mt-4">
        <Link href="/pricing">
          <Button variant="accent">See the plans</Button>
        </Link>
      </div>
    </div>
  );
}
