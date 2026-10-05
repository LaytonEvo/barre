'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * Member-facing video actions.
 *
 * Both of these re-check entitlement in the database. The page already checked it
 * before rendering a player, but a Server Action is a public endpoint: anybody
 * signed in can call it with any video id.
 */

export type VideoResult = { ok: true; favourite?: boolean } | { ok: false; error: string };

const progressSchema = z.object({
  videoId: z.string().uuid(),
  positionSecs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60),
  completed: z.boolean().default(false),
});

export async function saveProgress(input: {
  videoId: string;
  positionSecs: number;
  completed?: boolean;
}): Promise<VideoResult> {
  await requireUser('/account/videos');

  const parsed = progressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'That position does not look right.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('save_video_progress', {
    p_video_id: parsed.data.videoId,
    p_position_secs: parsed.data.positionSecs,
    p_completed: parsed.data.completed,
  });

  if (error) {
    if (error.message.includes('not_entitled')) {
      return { ok: false, error: 'Your membership does not include the video library.' };
    }
    return { ok: false, error: 'Could not save your place.' };
  }

  // Deliberately NOT revalidating here. Progress saves every few seconds while a
  // video plays, and revalidating the library on each one would throw away the
  // cache constantly for a number nobody is looking at mid-class.
  return { ok: true };
}

export async function markComplete(videoId: string): Promise<VideoResult> {
  await requireUser('/account/videos');

  const parsed = z.string().uuid().safeParse(videoId);
  if (!parsed.success) return { ok: false, error: 'Unknown video.' };

  const supabase = await createClient();

  // Position is left to the database, which clamps it to the duration: passing a
  // guess from the client would store a wrong resume point on a video the member
  // has just told us they finished.
  const { error } = await supabase.rpc('save_video_progress', {
    p_video_id: parsed.data,
    p_position_secs: 24 * 60 * 60,
    p_completed: true,
  });

  if (error) return { ok: false, error: 'Could not mark that complete.' };

  revalidatePath('/account/videos');
  return { ok: true };
}

export async function toggleFavourite(videoId: string): Promise<VideoResult> {
  await requireUser('/account/videos');

  const parsed = z.string().uuid().safeParse(videoId);
  if (!parsed.success) return { ok: false, error: 'Unknown video.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('toggle_video_favourite', {
    p_video_id: parsed.data,
  });

  if (error) return { ok: false, error: 'Could not save that.' };

  revalidatePath('/account/videos');
  return { ok: true, favourite: Boolean(data) };
}
