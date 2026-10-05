import type { Metadata } from 'next';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { VideoUploader } from '@/components/admin/video-uploader';
import { VideoDetailsForm } from '@/components/admin/video-details-form';
import { isMuxConfigured, isPlaybackSigningConfigured } from '@/lib/mux/client';

export const metadata: Metadata = { title: 'Videos', robots: { index: false } };

export default async function AdminVideosPage() {
  await requireRole('admin');
  const supabase = await createClient();

  const [{ data: videos }, { data: categories }] = await Promise.all([
    supabase
      .from('videos')
      .select(
        'id, title, description, level, equipment, safe_for_pregnancy, safety_note, mux_status, mux_error, published, publish_at, duration_secs, category_id',
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('video_categories')
      .select('id, name, slug')
      .eq('active', true)
      .order('sort_order'),
  ]);

  const categoryList = (categories ?? []).map(({ name, slug }) => ({ name, slug }));
  const slugById = new Map((categories ?? []).map((c) => [c.id, c.slug]));

  const rows = (videos ?? []).map((video) => ({
    ...video,
    category_slug: video.category_id ? (slugById.get(video.category_id) ?? null) : null,
  }));

  const published = rows.filter((v) => v.published).length;
  const waiting = rows.filter((v) => v.mux_status !== 'ready').length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <h1 className="text-[length:var(--text-2xl)]">Videos</h1>
      <p className="text-secondary mt-1 text-sm">
        {rows.length} in total · {published} published
        {waiting > 0 ? ` · ${waiting} still processing` : ''}
      </p>

      {!isMuxConfigured() ? (
        <Notice>
          Mux is not configured on this deployment, so uploads will not work yet. Add
          <code className="mx-1">MUX_TOKEN_ID</code> and
          <code className="mx-1">MUX_TOKEN_SECRET</code>.
        </Notice>
      ) : !isPlaybackSigningConfigured() ? (
        <Notice>
          Uploads will work, but nothing will play: there is no Mux signing key. Add
          <code className="mx-1">MUX_SIGNING_KEY_ID</code> and
          <code className="mx-1">MUX_SIGNING_KEY_PRIVATE</code>.
        </Notice>
      ) : null}

      <div className="mt-8">
        <VideoUploader />
      </div>

      <section className="mt-10">
        <h2 className="text-[length:var(--text-xl)]">All videos</h2>

        {rows.length === 0 ? (
          <p className="text-muted mt-4 text-sm">
            Nothing uploaded yet. The first one you add will appear here.
          </p>
        ) : (
          <div className="mt-4 grid gap-5">
            {rows.map((video) => (
              <VideoDetailsForm key={video.id} video={video} categories={categoryList} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-status-nearly-bg mt-6 rounded-lg p-4">
      <p className="text-primary text-sm">{children}</p>
    </div>
  );
}
