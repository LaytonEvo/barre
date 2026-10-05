import { describe, expect, it } from 'vitest';
import { pickSignedPlaybackId, readAssetError, readAssetReady } from '@/lib/mux/events';

/**
 * Webhook payloads arrive from outside, so every field here is untrusted shape as
 * well as untrusted content. The consequential case is the playback policy.
 */
describe('pickSignedPlaybackId', () => {
  it('returns the signed id', () => {
    expect(pickSignedPlaybackId({ playback_ids: [{ id: 'pb_s', policy: 'signed' }] })).toBe('pb_s');
  });

  it('REFUSES a public playback id rather than storing it', () => {
    // This is the one that matters. A public playback id is a URL anyone can
    // watch forever with no token, so storing it would silently turn a
    // members-only video public with nothing in the UI looking wrong.
    expect(pickSignedPlaybackId({ playback_ids: [{ id: 'pb_pub', policy: 'public' }] })).toBeNull();
  });

  it('picks the signed one when an asset carries both', () => {
    const data = {
      playback_ids: [
        { id: 'pb_pub', policy: 'public' },
        { id: 'pb_s', policy: 'signed' },
      ],
    };
    // Note the public one is FIRST: taking ids[0] would have passed every other
    // test in this file and leaked the library.
    expect(pickSignedPlaybackId(data)).toBe('pb_s');
  });

  it('is null for a missing, empty or malformed list', () => {
    expect(pickSignedPlaybackId({})).toBeNull();
    expect(pickSignedPlaybackId({ playback_ids: [] })).toBeNull();
    expect(pickSignedPlaybackId({ playback_ids: 'nope' })).toBeNull();
    expect(pickSignedPlaybackId(null)).toBeNull();
    expect(pickSignedPlaybackId(undefined)).toBeNull();
    expect(pickSignedPlaybackId({ playback_ids: [null, 7, 'x'] })).toBeNull();
  });

  it('ignores a signed entry with no usable id', () => {
    expect(pickSignedPlaybackId({ playback_ids: [{ policy: 'signed' }] })).toBeNull();
    expect(pickSignedPlaybackId({ playback_ids: [{ id: '', policy: 'signed' }] })).toBeNull();
  });
});

describe('readAssetReady', () => {
  const ready = {
    id: 'asset_1',
    upload_id: 'up_1',
    duration: 2730.44,
    playback_ids: [{ id: 'pb_s', policy: 'signed' }],
  };

  it('reads everything needed to attach the asset', () => {
    expect(readAssetReady(ready)).toEqual({
      uploadId: 'up_1',
      assetId: 'asset_1',
      playbackId: 'pb_s',
      durationSecs: 2730,
    });
  });

  it('rounds the fractional duration Mux reports', () => {
    expect(readAssetReady({ ...ready, duration: 2730.6 })?.durationSecs).toBe(2731);
  });

  it('treats a missing or nonsense duration as unknown rather than zero', () => {
    // A stored 0 would fail the videos.duration_secs > 0 check, and a video with
    // a real duration of 0 does not exist.
    expect(readAssetReady({ ...ready, duration: undefined })?.durationSecs).toBeNull();
    expect(readAssetReady({ ...ready, duration: 0 })?.durationSecs).toBeNull();
    expect(readAssetReady({ ...ready, duration: 'long' })?.durationSecs).toBeNull();
  });

  it('is null without an upload id, since there is no row to attach to', () => {
    expect(readAssetReady({ ...ready, upload_id: undefined })).toBeNull();
  });

  it('is null without an asset id', () => {
    expect(readAssetReady({ ...ready, id: undefined })).toBeNull();
  });

  it('is null when the only playback id is public', () => {
    expect(readAssetReady({ ...ready, playback_ids: [{ id: 'p', policy: 'public' }] })).toBeNull();
  });
});

describe('readAssetError', () => {
  it('joins the messages Mux gives', () => {
    const result = readAssetError({
      upload_id: 'up_1',
      errors: { messages: ['bad codec', 'no audio track'] },
    });
    expect(result.uploadId).toBe('up_1');
    expect(result.message).toBe('bad codec; no audio track');
  });

  it('falls back to a sentence when Mux gives no detail', () => {
    // Kelly reads this in the admin list, so it cannot be blank or "undefined".
    expect(readAssetError({ upload_id: 'up_1' }).message).toBe('Mux could not process this video.');
    expect(readAssetError({ upload_id: 'up_1', errors: { messages: [] } }).message).toContain(
      'could not process',
    );
  });

  it('drops non-string entries rather than rendering "[object Object]"', () => {
    expect(readAssetError({ errors: { messages: ['real', { nested: 1 }] } }).message).toBe('real');
  });

  it('survives a payload with no upload id', () => {
    expect(readAssetError({}).uploadId).toBeNull();
    expect(readAssetError(null).uploadId).toBeNull();
  });
});
