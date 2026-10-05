'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { createDirectUpload } from '@/lib/mux/upload';
import { isMuxConfigured } from '@/lib/mux/client';
import { EQUIPMENT, LEVELS } from '@/lib/videos/filters';

/**
 * Admin video actions.
 *
 * The upload one is unusual: it returns a URL the browser then uploads to
 * directly. Nothing about the file passes through this server, which is what
 * makes a 2GB class video from a phone possible at all.
 */

export type VideoAdminResult =
  | { ok: true; message?: string }
  | { ok: true; videoId: string; uploadUrl: string }
  | { ok: false; error: string };

function fail(error: { message?: string } | null, fallback: string): VideoAdminResult {
  const raw = error?.message ?? '';
  const known: Record<string, string> = {
    not_allowed: 'You do not have access to do that.',
    title_required: 'Give the video a title first.',
    video_not_found: 'That video no longer exists.',
    unknown_category: 'Pick a category from the list.',
    unknown_level: 'Pick a level from the list.',
    not_ready_to_publish: 'Mux is still processing this one — try again in a few minutes.',
    category_required: 'Choose a category before publishing, or it will not show in any filter.',
  };
  for (const [token, message] of Object.entries(known)) {
    if (raw.includes(token)) return { ok: false, error: message };
  }
  return { ok: false, error: fallback };
}

/**
 * Step one of an upload: create the Mux upload and the draft row together.
 *
 * They are created in this order deliberately. If the row insert fails we have an
 * orphaned Mux upload that expires on its own; if it were the other way round we
 * would have a video row that can never receive an asset, showing as permanently
 * "pending" with no way to fix it from the UI.
 */
export async function startUpload(formData: FormData): Promise<VideoAdminResult> {
  await requireRole('admin');

  const title = z.string().min(1).max(200).safeParse(formData.get('title'));
  if (!title.success) return { ok: false, error: 'Give the video a title first.' };

  if (!isMuxConfigured()) {
    return {
      ok: false,
      error: 'Mux is not configured on this deployment, so uploads are not possible yet.',
    };
  }

  let upload: { uploadId: string; url: string };
  try {
    upload = await createDirectUpload();
  } catch (error) {
    console.error('Mux direct upload failed', error);
    return { ok: false, error: 'Could not reach Mux to start the upload.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_create_video_draft', {
    p_title: title.data.trim(),
    p_upload_id: upload.uploadId,
  });

  if (error || !data) return fail(error, 'Could not create the video.');

  revalidatePath('/admin/videos');
  return { ok: true, videoId: data, uploadUrl: upload.url };
}

const detailsSchema = z.object({
  videoId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  category: z.string().min(1),
  level: z.enum(LEVELS.map((l) => l.value) as [string, ...string[]]),
  equipment: z.array(z.enum(EQUIPMENT.map((e) => e.value) as [string, ...string[]])),
  safeForPregnancy: z.boolean(),
  safetyNote: z.string().max(500).optional(),
});

export async function saveVideoDetails(formData: FormData): Promise<VideoAdminResult> {
  await requireRole('admin');

  const parsed = detailsSchema.safeParse({
    videoId: formData.get('videoId'),
    title: formData.get('title'),
    description: formData.get('description') ?? undefined,
    category: formData.get('category'),
    level: formData.get('level'),
    equipment: formData.getAll('equipment').map(String),
    safeForPregnancy: formData.get('safeForPregnancy') === 'on',
    // An empty string is meaningful here: it clears the note. Mapping it to
    // undefined would make a cleared note impossible to save.
    safetyNote:
      formData.get('safetyNote') === null ? undefined : String(formData.get('safetyNote')),
  });

  if (!parsed.success) {
    return { ok: false, error: 'Check the title, category and level.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_update_video', {
    p_video_id: parsed.data.videoId,
    p_title: parsed.data.title,
    p_description: parsed.data.description ?? null,
    p_category_slug: parsed.data.category,
    p_level: parsed.data.level,
    p_equipment: parsed.data.equipment,
    p_safe_for_pregnancy: parsed.data.safeForPregnancy,
    p_safety_note: parsed.data.safetyNote ?? null,
  });

  if (error) return fail(error, 'Could not save those details.');

  revalidatePath('/admin/videos');
  return { ok: true, message: 'Saved.' };
}

export async function setVideoPublished(formData: FormData): Promise<VideoAdminResult> {
  await requireRole('admin');

  const videoId = z.string().uuid().safeParse(formData.get('videoId'));
  if (!videoId.success) return { ok: false, error: 'Unknown video.' };

  const published = formData.get('published') === 'true';
  const rawWhen = formData.get('publishAt');

  // A datetime-local value has no timezone. It is entered in UK time, so it is
  // interpreted as such rather than as UTC — otherwise a 7pm release goes live an
  // hour early for half the year.
  let publishAt: string | null = null;
  if (published && typeof rawWhen === 'string' && rawWhen.trim() !== '') {
    const parsed = new Date(`${rawWhen}:00`);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: 'That publish date does not look right.' };
    }
    publishAt = parsed.toISOString();
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_video_published', {
    p_video_id: videoId.data,
    p_published: published,
    p_publish_at: publishAt,
  });

  if (error) return fail(error, 'Could not change that.');

  revalidatePath('/admin/videos');
  revalidatePath('/account/videos');
  return { ok: true, message: published ? 'Published.' : 'Unpublished.' };
}
