import { mux } from '@/lib/mux/client';
import { serverEnv } from '@/lib/env';

/**
 * Signed playback tokens.
 *
 * Mux playback ids on a signed playback policy are useless on their own: every
 * request needs a short-lived JWT signed with Kelly's private signing key. That
 * is the whole reason the library is safe to put behind a login — there is no URL
 * to share, because the URL expires.
 *
 * Three separate tokens are needed per video, with different audiences: `v` for
 * the stream, `t` for the thumbnail, `s` for the storyboard (the scrubbing
 * preview). Signing one and reusing it does not work; Mux checks the audience.
 */

/** How long a token lasts. */
const TOKEN_TTL = '2h';

/**
 * Deliberately longer than any class. A token that expires mid-video stops
 * playback at the point it expires, which looks exactly like a broken site, and
 * the member has no idea that reloading would fix it. Two hours covers the
 * longest video with room for a pause to answer the door.
 *
 * It is not a security weakness: the token is minted only after an entitlement
 * check, and 2 hours is still a short window for a URL that cannot be guessed.
 * The real protection is that it expires at all.
 */
export type SignedPlayback = {
  playbackId: string;
  tokens: { playback: string; thumbnail: string; storyboard: string };
};

export async function signPlayback(playbackId: string): Promise<SignedPlayback> {
  const { MUX_SIGNING_KEY_ID, MUX_SIGNING_KEY_PRIVATE } = serverEnv();

  if (!MUX_SIGNING_KEY_ID || !MUX_SIGNING_KEY_PRIVATE) {
    throw new Error(
      'MUX_SIGNING_KEY_ID and MUX_SIGNING_KEY_PRIVATE are not set. Create a signing key in the Mux dashboard (Settings → Signing Keys); the private key is base64 and is only shown once.',
    );
  }

  const client = mux();
  const keys = { keyId: MUX_SIGNING_KEY_ID, keySecret: MUX_SIGNING_KEY_PRIVATE };

  const [playback, thumbnail, storyboard] = await Promise.all([
    client.jwt.signPlaybackId(playbackId, { ...keys, expiration: TOKEN_TTL, type: 'video' }),
    client.jwt.signPlaybackId(playbackId, { ...keys, expiration: TOKEN_TTL, type: 'thumbnail' }),
    client.jwt.signPlaybackId(playbackId, { ...keys, expiration: TOKEN_TTL, type: 'storyboard' }),
  ]);

  return { playbackId, tokens: { playback, thumbnail, storyboard } };
}
