import { beforeAll, describe, expect, it } from 'vitest';

const SITE = 'https://barrebykelly.example';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

let links: typeof import('@/lib/email/links');

beforeAll(async () => {
  process.env.EMAIL_LINK_SECRET = 'test-secret-value';
  links = await import('@/lib/email/links');
});

describe('unsubscribe links', () => {
  it('round-trips a signed link', () => {
    const url = links.unsubscribeUrl(USER, SITE);
    expect(url).toBeTruthy();

    const token = new URL(url!).searchParams.get('t')!;
    expect(links.verifyUnsubscribe(USER, token)).toBe(true);
  });

  it('refuses a token issued for a different member', () => {
    // Without this, anyone could unsubscribe any member whose id they saw, cutting
    // them off from reminders they actually want.
    const url = links.unsubscribeUrl(OTHER, SITE);
    const token = new URL(url!).searchParams.get('t')!;
    expect(links.verifyUnsubscribe(USER, token)).toBe(false);
  });

  it('refuses a forged, empty or truncated token', () => {
    expect(links.verifyUnsubscribe(USER, 'not-a-token')).toBe(false);
    expect(links.verifyUnsubscribe(USER, '')).toBe(false);

    const real = new URL(links.unsubscribeUrl(USER, SITE)!).searchParams.get('t')!;
    expect(links.verifyUnsubscribe(USER, real.slice(0, -1))).toBe(false);
  });

  it('puts the member id in the URL so the handler knows who to unsubscribe', () => {
    expect(links.unsubscribeUrl(USER, SITE)).toContain(`u=${USER}`);
  });

  it('produces a URL-safe token that survives a query string', () => {
    const token = new URL(links.unsubscribeUrl(USER, SITE)!).searchParams.get('t')!;
    // base64url: no +, / or = to be mangled by a mail client rewriting links.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns null with no secret configured, so marketing cannot be sent', async () => {
    const saved = process.env.EMAIL_LINK_SECRET;
    process.env.EMAIL_LINK_SECRET = '';
    try {
      // Re-imported so the module re-reads the environment.
      expect(links.unsubscribeUrl(USER, SITE)).toBeNull();
      expect(links.isEmailLinkSigningConfigured()).toBe(false);
      expect(links.verifyUnsubscribe(USER, 'anything')).toBe(false);
    } finally {
      process.env.EMAIL_LINK_SECRET = saved;
    }
  });
});
