import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * Signed unsubscribe links.
 *
 * Stateless on purpose: an HMAC over the user id rather than a token column. There
 * is nothing to store, nothing to expire, and no second round trip when somebody
 * clicks — which matters because an unsubscribe link that errors is both a bad
 * experience and a compliance problem.
 *
 * The point of the signature is that the link cannot be forged. Without it,
 * `?u=<uuid>` would let anyone unsubscribe any member whose id they could guess
 * or observe, which is a trivially abusable way to cut somebody off from
 * reminders they want.
 */

function secret(): string | null {
  try {
    // An empty string must count as absent, not as a secret. A deployment with
    // `EMAIL_LINK_SECRET=` set but blank would otherwise report itself as
    // configured while signing every link with an empty key — forgeable by
    // anyone who notices.
    const value = serverEnv().EMAIL_LINK_SECRET;
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function sign(userId: string, key: string): string {
  return createHmac('sha256', key).update(`unsubscribe:${userId}`).digest('base64url');
}

/**
 * Null when no signing secret is configured.
 *
 * The dispatcher treats that as a reason to SKIP marketing email rather than send
 * it with a broken or missing link. Under PECR a marketing email must carry a
 * working opt-out, so "no secret" has to mean "no marketing", not "send it
 * anyway".
 */
export function unsubscribeUrl(userId: string, siteUrl: string): string | null {
  const key = secret();
  if (!key) return null;

  const token = sign(userId, key);
  return `${siteUrl}/unsubscribe?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
}

export function verifyUnsubscribe(userId: string, token: string): boolean {
  const key = secret();
  if (!key || !token) return false;

  const expected = Buffer.from(sign(userId, key));
  const given = Buffer.from(token);

  // Length check first: timingSafeEqual throws on a length mismatch rather than
  // returning false.
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export function isEmailLinkSigningConfigured(): boolean {
  return secret() !== null;
}
