import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { durationLabel, levelLabel } from '@/lib/videos/filters';
import { path } from '@/lib/routes';
import { cn } from '@/lib/utils';

export type LibraryVideo = {
  id: string;
  title: string;
  slug: string;
  duration_secs: number | null;
  level: string;
  category_name: string | null;
  equipment: string[];
  is_new: boolean;
  position_secs: number;
  completed_at: string | null;
  is_favourite: boolean;
  safe_for_pregnancy: boolean;
};

/**
 * One video on the shelf.
 *
 * There is no thumbnail image yet — Mux generates them, but fetching one needs a
 * signed thumbnail token per video, and minting 40 of them to render a grid is a
 * lot of signing for a page that may not be scrolled. The coloured panel with the
 * duration reads clearly and loads instantly; real thumbnails are a worthwhile
 * follow-up once there are enough videos to make the page feel bare without them.
 */
export function VideoCard({ video }: { video: LibraryVideo }) {
  const completed = Boolean(video.completed_at);
  const percent =
    video.duration_secs && video.duration_secs > 0
      ? Math.min(100, Math.round((video.position_secs * 100) / video.duration_secs))
      : 0;
  const started = !completed && percent >= 2;

  return (
    <Link
      href={path(`/account/videos/${video.slug}`)}
      className="group focus-visible:outline-focus block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <article className="border-subtle bg-surface hover:border-strong h-full overflow-hidden rounded-xl border transition-colors">
        <div
          className={cn(
            'relative grid aspect-video place-items-center',
            completed ? 'bg-surface-sunk' : 'bg-accent-soft',
          )}
        >
          <span
            aria-hidden
            className="text-primary font-display text-[length:var(--text-2xl)] opacity-70"
          >
            {durationLabel(video.duration_secs) || 'Video'}
          </span>

          {/* The resume bar. Visible on the card so "where was I" is answered
              before the member taps, not after the player loads. */}
          {started ? (
            <div className="bg-surface-sunk absolute inset-x-0 bottom-0 h-1.5">
              <div className="bg-accent h-full" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
        </div>

        <div className="p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {video.is_new && !started && !completed ? <Badge tone="waitlist">New</Badge> : null}
            {completed ? <Badge tone="open">Done</Badge> : null}
            {started ? <Badge tone="nearly">{percent}% watched</Badge> : null}
            {video.is_favourite ? <Badge tone="neutral">Saved</Badge> : null}
          </div>

          <h3 className="text-primary mt-2 font-medium">{video.title}</h3>

          <p className="text-muted mt-1 text-xs">
            {[video.category_name, levelLabel(video.level), durationLabel(video.duration_secs)]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {video.equipment.length > 0 ? (
            <p className="text-muted mt-1 text-xs">Needs: {video.equipment.join(', ')}</p>
          ) : (
            <p className="text-muted mt-1 text-xs">No equipment</p>
          )}
        </div>
      </article>
    </Link>
  );
}
