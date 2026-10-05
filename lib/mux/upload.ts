import { mux } from '@/lib/mux/client';
import { clientEnv } from '@/lib/env';

/**
 * Direct upload.
 *
 * The file goes from Kelly's phone straight to Mux and never touches this server,
 * which matters because a 2GB class video through a serverless function is a
 * timeout, not a feature. The browser gets a one-shot signed URL; we only learn
 * the result from the webhook.
 */
export type CreatedUpload = { uploadId: string; url: string };

export async function createDirectUpload(): Promise<CreatedUpload> {
  const upload = await mux().video.uploads.create({
    // Restricted to our own origin so the URL is useless if it leaks.
    cors_origin: clientEnv.NEXT_PUBLIC_SITE_URL,
    new_asset_settings: {
      // Signed, not public. This is the setting that makes the whole library
      // members-only: a public playback policy would mean a shareable URL that
      // no amount of application code could take back.
      playback_policy: ['signed'],
      video_quality: 'basic',
    },
  });

  // `url` is optional in Mux's own types. There is nothing useful to do with an
  // upload we cannot upload to, so fail here rather than hand the browser
  // `undefined` and let it fail as a confusing CORS error.
  if (!upload.url) {
    throw new Error('Mux created an upload without a URL. Nothing to upload to.');
  }

  return { uploadId: upload.id, url: upload.url };
}

/**
 * Mux keeps the asset; deleting the row alone would leave Kelly paying storage
 * for a video nobody can reach.
 */
export async function deleteMuxAsset(assetId: string): Promise<void> {
  await mux().video.assets.delete(assetId);
}
