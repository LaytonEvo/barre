'use client';

import { useActionState } from 'react';
import {
  saveVideoDetails,
  setVideoPublished,
  type VideoAdminResult,
} from '@/app/actions/admin-videos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EQUIPMENT, LEVELS } from '@/lib/videos/filters';

type Video = {
  id: string;
  title: string;
  description: string | null;
  category_slug: string | null;
  level: string;
  equipment: string[];
  safe_for_pregnancy: boolean;
  safety_note: string | null;
  mux_status: string;
  mux_error: string | null;
  published: boolean;
  publish_at: string | null;
  duration_secs: number | null;
};

async function runSave(_prev: VideoAdminResult | undefined, formData: FormData) {
  return saveVideoDetails(formData);
}
async function runPublish(_prev: VideoAdminResult | undefined, formData: FormData) {
  return setVideoPublished(formData);
}

export function VideoDetailsForm({
  video,
  categories,
}: {
  video: Video;
  categories: { name: string; slug: string }[];
}) {
  const [saveState, save, saving] = useActionState(runSave, undefined);
  const [pubState, publish, publishing] = useActionState(runPublish, undefined);

  const ready = video.mux_status === 'ready';

  return (
    <div className="border-subtle bg-surface rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-primary font-medium">{video.title}</h3>
        <div className="flex gap-1.5">
          <StatusBadge status={video.mux_status} />
          {video.published ? (
            <Badge tone="open">Published</Badge>
          ) : (
            <Badge tone="neutral">Draft</Badge>
          )}
        </div>
      </div>

      {video.mux_error ? (
        <p className="text-status-full-fg mt-2 text-sm">Mux error: {video.mux_error}</p>
      ) : null}

      <form action={save} className="mt-4 grid gap-4">
        <input type="hidden" name="videoId" value={video.id} />

        <div>
          <Label htmlFor={`title-${video.id}`}>Title</Label>
          <Input
            id={`title-${video.id}`}
            name="title"
            defaultValue={video.title}
            required
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor={`desc-${video.id}`}>Description</Label>
          <textarea
            id={`desc-${video.id}`}
            name="description"
            rows={3}
            defaultValue={video.description ?? ''}
            className="border-subtle bg-surface text-primary focus-visible:outline-focus mt-1 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-2"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`cat-${video.id}`}>Category</Label>
            <select
              id={`cat-${video.id}`}
              name="category"
              defaultValue={video.category_slug ?? ''}
              required
              className="border-subtle bg-surface text-primary focus-visible:outline-focus mt-1 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-2"
            >
              <option value="" disabled>
                Choose one
              </option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor={`level-${video.id}`}>Level</Label>
            <select
              id={`level-${video.id}`}
              name="level"
              defaultValue={video.level}
              className="border-subtle bg-surface text-primary focus-visible:outline-focus mt-1 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-2"
            >
              {LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="text-secondary text-sm font-medium">Equipment needed</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {EQUIPMENT.map((item) => (
              <label key={item.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="equipment"
                  value={item.value}
                  defaultChecked={video.equipment.includes(item.value)}
                />
                {item.label}
              </label>
            ))}
          </div>
          <p className="text-muted mt-2 text-xs">
            Members filter by what they have to hand, so a video listing equipment it does not need
            will be hidden from people who could do it.
          </p>
        </fieldset>

        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="safeForPregnancy"
              defaultChecked={video.safe_for_pregnancy}
            />
            Safe during pregnancy
          </label>
        </div>

        <div>
          <Label htmlFor={`note-${video.id}`}>Safety note (optional)</Label>
          <Input
            id={`note-${video.id}`}
            name="safetyNote"
            defaultValue={video.safety_note ?? ''}
            placeholder="Skip the plank section if you have wrist pain"
            className="mt-1"
          />
          <p className="text-muted mt-1 text-xs">Shown above the player, before they start.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </Button>
          {saveState && !saveState.ok ? (
            <span role="alert" className="text-status-full-fg text-sm">
              {saveState.error}
            </span>
          ) : saveState?.ok && 'message' in saveState && saveState.message ? (
            <span className="text-muted text-sm">{saveState.message}</span>
          ) : null}
        </div>
      </form>

      <form action={publish} className="border-subtle mt-5 border-t pt-5">
        <input type="hidden" name="videoId" value={video.id} />
        <input type="hidden" name="published" value={video.published ? 'false' : 'true'} />

        {!video.published ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label htmlFor={`when-${video.id}`}>Publish at (leave empty for now)</Label>
              <Input
                id={`when-${video.id}`}
                name="publishAt"
                type="datetime-local"
                className="mt-1"
              />
              <p className="text-muted mt-1 text-xs">UK time.</p>
            </div>
            <Button type="submit" disabled={publishing || !ready}>
              {publishing ? 'Publishing…' : 'Publish'}
            </Button>
          </div>
        ) : (
          <Button type="submit" variant="secondary" disabled={publishing}>
            {publishing ? 'Unpublishing…' : 'Unpublish'}
          </Button>
        )}

        {!ready ? (
          <p className="text-muted mt-2 text-sm">
            Cannot publish until Mux has finished processing — otherwise members would open a dead
            player.
          </p>
        ) : null}

        {pubState && !pubState.ok ? (
          <p role="alert" className="text-status-full-fg mt-2 text-sm">
            {pubState.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ready') return <Badge tone="open">Ready</Badge>;
  if (status === 'errored') return <Badge tone="full">Failed</Badge>;
  if (status === 'processing') return <Badge tone="nearly">Processing</Badge>;
  return <Badge tone="neutral">Waiting for upload</Badge>;
}
