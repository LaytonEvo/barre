import Mux from '@mux/mux-node';
import { serverEnv } from '@/lib/env';

/**
 * Mux client. Server-only, lazily constructed for the same reason as the Stripe
 * one: the site has to run on a checkout with no Mux credentials, and it does —
 * everything except the video library works without them.
 */
let cached: Mux | null = null;

export function mux(): Mux {
  if (cached) return cached;

  const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = serverEnv();
  if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
    throw new Error(
      'MUX_TOKEN_ID and MUX_TOKEN_SECRET are not set. Create an API access token in the Mux dashboard (Settings → API Access Tokens) with Mux Video read/write.',
    );
  }

  cached = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });
  return cached;
}

export function isMuxConfigured(): boolean {
  try {
    const env = serverEnv();
    return Boolean(env.MUX_TOKEN_ID && env.MUX_TOKEN_SECRET);
  } catch {
    return false;
  }
}

/**
 * Signing is a separate credential from the API token, and a separate failure.
 * Uploading works without a signing key; playing does not. Reporting them apart
 * means "the video will not play" does not send anyone to check the wrong page
 * of the Mux dashboard.
 */
export function isPlaybackSigningConfigured(): boolean {
  try {
    const env = serverEnv();
    return Boolean(env.MUX_SIGNING_KEY_ID && env.MUX_SIGNING_KEY_PRIVATE);
  } catch {
    return false;
  }
}
