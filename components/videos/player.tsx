'use client';

import MuxPlayer from '@mux/mux-player-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { markComplete, saveProgress, toggleFavourite } from '@/app/actions/videos';
import { Button } from '@/components/ui/button';

type Props = {
  videoId: string;
  playbackId: string;
  tokens: { playback: string; thumbnail: string; storyboard: string };
  title: string;
  startAt: number;
  initiallyFavourite: boolean;
  initiallyComplete: boolean;
};

/** How often progress is written while playing. */
const SAVE_EVERY_MS = 15_000;

/**
 * The player.
 *
 * Progress is saved on a timer rather than on every `timeupdate`, which fires
 * about four times a second — that would be a Server Action call per 250ms. It is
 * also saved when the tab is hidden and when the component unmounts, because the
 * common way to stop watching is to close the tab, and a member who gets back to
 * a video 14 seconds short of where they left it will think it did not work.
 */
export function VideoPlayer({
  videoId,
  playbackId,
  tokens,
  title,
  startAt,
  initiallyFavourite,
  initiallyComplete,
}: Props) {
  const [favourite, setFavourite] = useState(initiallyFavourite);
  const [complete, setComplete] = useState(initiallyComplete);
  const [error, setError] = useState<string | null>(null);

  // A ref, not state: the save timer and the unload handler need the latest
  // position without re-rendering the player every second.
  const position = useRef(startAt);
  const lastSaved = useRef(startAt);

  const flush = useCallback(() => {
    const secs = Math.floor(position.current);
    if (Math.abs(secs - lastSaved.current) < 5) return;
    lastSaved.current = secs;
    void saveProgress({ videoId, positionSecs: secs });
  }, [videoId]);

  useEffect(() => {
    const timer = setInterval(flush, SAVE_EVERY_MS);

    // `visibilitychange` rather than `beforeunload`: on mobile, closing a tab or
    // switching apps often never fires beforeunload at all.
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  return (
    <div>
      <div className="overflow-hidden rounded-xl bg-black">
        <MuxPlayer
          playbackId={playbackId}
          tokens={tokens}
          metadata={{ video_title: title }}
          startTime={startAt > 10 ? startAt : undefined}
          streamType="on-demand"
          accentColor="#AE5430"
          style={{ aspectRatio: '16 / 9', width: '100%' }}
          onTimeUpdate={(event) => {
            position.current = (event.target as HTMLMediaElement).currentTime;
          }}
          onEnded={() => {
            setComplete(true);
            void markComplete(videoId);
          }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
          variant={complete ? 'secondary' : 'primary'}
          onClick={async () => {
            // Optimistic, then corrected. Marking complete is not worth a spinner.
            setComplete(true);
            const result = await markComplete(videoId);
            if (!result.ok) {
              setComplete(false);
              setError(result.error);
            }
          }}
          disabled={complete}
        >
          {complete ? '✓ Completed' : 'Mark complete'}
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            const next = !favourite;
            setFavourite(next);
            const result = await toggleFavourite(videoId);
            if (!result.ok) {
              setFavourite(!next);
              setError(result.error);
            } else if (typeof result.favourite === 'boolean') {
              setFavourite(result.favourite);
            }
          }}
          aria-pressed={favourite}
        >
          {favourite ? '★ Saved' : '☆ Save for later'}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-status-full-fg mt-3 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
