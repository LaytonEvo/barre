import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { LibraryFilters } from '@/components/videos/library-filters';
import { VideoCard, type LibraryVideo } from '@/components/videos/video-card';
import { isLength, isLevel, parseEquipment, durationLabel } from '@/lib/videos/filters';
import { path } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'At-home videos',
  robots: { index: false },
};

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function VideosPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser('/account/videos');
  const supabase = await createClient();
  const params = await searchParams;

  // Entitlement decides what this page IS, so it is read first. The library is
  // still shown to members without access — that is the upsell — but without a
  // link into a player they cannot use.
  const { data: entitled } = await supabase.rpc('can_watch_videos', { p_user_id: user.id });
  const canWatch = Boolean(entitled);

  const length = one(params.length);
  const level = one(params.level);

  const [{ data: videos }, { data: resumable }, { data: categories }] = await Promise.all([
    supabase.rpc('video_library', {
      p_category: one(params.category) ?? null,
      p_length: isLength(length) ? length : null,
      p_level: isLevel(level) ? level : null,
      p_equipment: parseEquipment(one(params.equipment)),
      p_favourites: one(params.favourites) === '1',
      p_pregnancy: one(params.pregnancy) === '1',
    }),
    supabase.rpc('continue_watching', { p_limit: 4 }),
    supabase.from('video_categories').select('name, slug').eq('active', true).order('sort_order'),
  ]);

  const library = (videos ?? []) as LibraryVideo[];
  const filtered = ['category', 'length', 'level', 'equipment', 'favourites', 'pregnancy'].some(
    (key) => key in params,
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-3xl)]">At-home videos</h1>
      <p className="text-secondary mt-2 max-w-2xl">
        Barre in your front room, whenever you can find twenty minutes. Same cues, same music, no
        drive.
      </p>

      {!canWatch ? <UpsellBanner /> : null}

      {canWatch && (resumable ?? []).length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[length:var(--text-xl)]">Pick up where you left off</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(resumable ?? []).map((video) => (
              <Link
                key={video.id}
                href={path(`/account/videos/${video.slug}`)}
                className="border-subtle bg-surface hover:border-strong focus-visible:outline-focus block rounded-xl border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <p className="text-primary font-medium">{video.title}</p>
                <p className="text-muted mt-1 text-xs">
                  {video.percent}% through · {durationLabel(video.duration_secs)}
                </p>
                <div className="bg-surface-sunk mt-3 h-1.5 overflow-hidden rounded-full">
                  <div className="bg-accent h-full" style={{ width: `${video.percent}%` }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="text-[length:var(--text-xl)]">
          {filtered ? 'Matching classes' : 'The whole library'}
        </h2>

        <LibraryFilters categories={categories ?? []} />

        {library.length === 0 ? (
          <EmptyLibrary filtered={filtered} />
        ) : (
          <>
            <p className="text-muted mt-6 text-sm">
              {library.length} {library.length === 1 ? 'class' : 'classes'}
            </p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {library.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Shown to a signed-in member without on-demand access. Deliberately not a wall:
 * they can still browse, because seeing a library of 30 classes is a better
 * argument for subscribing than a locked door is.
 */
function UpsellBanner() {
  return (
    <Card className="border-strong bg-accent-soft mt-8">
      <CardTitle>Your plan does not include the video library yet</CardTitle>
      {/* text-secondary, not the default text-muted: muted is 4.08:1 on the mint
          and fails AA. axe caught this one live. */}
      <CardDescription className="text-secondary">
        Have a look round — then add on-demand access to watch any of them.
      </CardDescription>
      <CardContent className="mt-4">
        <Link href="/pricing">
          <Button variant="accent">See the plans</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function EmptyLibrary({ filtered }: { filtered: boolean }) {
  // Two genuinely different situations that a single "no results" would blur:
  // the filters are too narrow, or Kelly has not uploaded anything yet.
  return (
    <div className="border-subtle mt-8 rounded-xl border border-dashed p-8 text-center">
      {filtered ? (
        <>
          <p className="text-primary font-medium">Nothing matches all of those</p>
          <p className="text-secondary mt-1 text-sm">
            Try dropping one filter — the length and the equipment together are usually the pair
            that leaves nothing.
          </p>
        </>
      ) : (
        <>
          <p className="text-primary font-medium">No videos yet</p>
          <p className="text-secondary mt-1 text-sm">
            Kelly is filming these. They will appear here as they are published.
          </p>
        </>
      )}
    </div>
  );
}
