/**
 * Reading Mux webhook payloads.
 *
 * Kept apart from the route so it can be tested directly: the route's job is
 * signature verification and dispatch, and this is the part where getting it
 * subtly wrong has consequences.
 */

export type AssetReady = {
  uploadId: string;
  assetId: string;
  playbackId: string;
  durationSecs: number | null;
};

/**
 * The signed playback id, or null.
 *
 * An asset can carry several playback ids with different policies. Taking the
 * first one would store a *public* id if one were ever present — and a public
 * playback id is a URL anyone can watch, forever, with no token. That would
 * silently undo the entitlement gate for that video, and nothing in the UI would
 * look wrong.
 *
 * So this insists on `signed` and returns null otherwise, which makes the video
 * stay "processing" rather than quietly become public.
 */
export function pickSignedPlaybackId(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;

  const ids = (data as { playback_ids?: unknown }).playback_ids;
  if (!Array.isArray(ids)) return null;

  for (const entry of ids) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, policy } = entry as { id?: unknown; policy?: unknown };
    if (policy === 'signed' && typeof id === 'string' && id !== '') return id;
  }

  return null;
}

/**
 * Everything needed to attach an asset, or null if the payload is not usable.
 * Returning null rather than throwing matters: the route acknowledges an
 * unusable payload so Mux stops retrying it, and logs instead.
 */
export function readAssetReady(data: unknown): AssetReady | null {
  if (typeof data !== 'object' || data === null) return null;

  const record = data as Record<string, unknown>;
  const uploadId = typeof record.upload_id === 'string' ? record.upload_id : null;
  const assetId = typeof record.id === 'string' ? record.id : null;
  const playbackId = pickSignedPlaybackId(data);

  if (!uploadId || !assetId || !playbackId) return null;

  // Mux reports duration in fractional seconds.
  const duration = typeof record.duration === 'number' ? Math.round(record.duration) : null;

  return {
    uploadId,
    assetId,
    playbackId,
    durationSecs: duration && duration > 0 ? duration : null,
  };
}

/** The error messages Mux attaches to a failed encode, as one line. */
export function readAssetError(data: unknown): { uploadId: string | null; message: string } {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const uploadId = typeof record.upload_id === 'string' ? record.upload_id : null;

  const errors = record.errors as { messages?: unknown } | undefined;
  const messages = Array.isArray(errors?.messages)
    ? errors.messages.filter((m): m is string => typeof m === 'string')
    : [];

  return {
    uploadId,
    message: messages.length > 0 ? messages.join('; ') : 'Mux could not process this video.',
  };
}
