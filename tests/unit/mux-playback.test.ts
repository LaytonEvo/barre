import { generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Signed playback is the only thing standing between "members-only library" and
 * "a URL anyone can paste into a group chat", so it is worth testing against a
 * real key rather than trusting the SDK call looks right.
 *
 * No Mux account is needed: the token is an RS256 JWT, so a locally generated
 * keypair proves the signing, the audiences and the expiry.
 */
function decode(token: string) {
  const [header, payload] = token
    .split('.')
    .slice(0, 2)
    .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()));
  return { header, payload };
}

let signPlayback: typeof import('@/lib/mux/playback').signPlayback;

beforeAll(async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

  // Mux takes the private key base64-encoded, which is how the dashboard hands
  // it over.
  process.env.MUX_TOKEN_ID = 'test-token-id';
  process.env.MUX_TOKEN_SECRET = 'test-token-secret';
  process.env.MUX_SIGNING_KEY_ID = 'test-key-id';
  process.env.MUX_SIGNING_KEY_PRIVATE = Buffer.from(pem).toString('base64');

  ({ signPlayback } = await import('@/lib/mux/playback'));
});

describe('signPlayback', () => {
  it('signs three tokens, because Mux checks the audience per use', async () => {
    const signed = await signPlayback('pb_abc123');

    expect(signed.playbackId).toBe('pb_abc123');
    expect(decode(signed.tokens.playback).payload.aud).toBe('v');
    expect(decode(signed.tokens.thumbnail).payload.aud).toBe('t');
    expect(decode(signed.tokens.storyboard).payload.aud).toBe('s');
  });

  it('signs with RS256 and names the signing key, so Mux can find the public half', async () => {
    const { header, payload } = decode((await signPlayback('pb_abc123')).tokens.playback);
    expect(header.alg).toBe('RS256');
    // Mux carries the key id in the payload rather than the header's `kid`,
    // which is unusual enough to be worth pinning: a token signed with the right
    // key but missing this is rejected as if the key were wrong.
    expect(payload.kid).toBe('test-key-id');
  });

  it('scopes each token to the one playback id it was minted for', async () => {
    const { payload } = decode((await signPlayback('pb_only_this_one')).tokens.playback);
    expect(payload.sub).toBe('pb_only_this_one');
  });

  it('expires, which is the entire point', async () => {
    const { payload } = decode((await signPlayback('pb_abc123')).tokens.playback);
    expect(payload.exp).toBeTypeOf('number');

    const lifetimeMins = (payload.exp - Math.floor(Date.now() / 1000)) / 60;
    // Long enough to outlast the longest class with a pause in it, short enough
    // that a leaked URL is worthless by the time it is passed on.
    expect(lifetimeMins).toBeGreaterThan(60);
    expect(lifetimeMins).toBeLessThanOrEqual(121);
  });

  it('refuses to sign when no signing key is configured, rather than returning an unsigned URL', async () => {
    const saved = process.env.MUX_SIGNING_KEY_PRIVATE;
    process.env.MUX_SIGNING_KEY_PRIVATE = '';
    try {
      await expect(signPlayback('pb_abc123')).rejects.toThrow(/MUX_SIGNING_KEY/);
    } finally {
      process.env.MUX_SIGNING_KEY_PRIVATE = saved;
    }
  });
});
