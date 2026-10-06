import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The magic-link landing point.
 *
 * Every assertion here is about the ORIGIN it redirects to. Behind a proxy,
 * `request.url` is the container's own address — on Railway, localhost:8080 —
 * and a redirect built from it sends the member to a machine that exists only
 * inside the datacentre. That shipped, and every sign-in link died in the
 * recipient's browser with ERR_CONNECTION_REFUSED.
 *
 * The requests below therefore all arrive looking the way they really do in
 * production: addressed to localhost:8080.
 */
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async (code: string) =>
        code === 'expired' ? { error: { message: 'expired' } } : { error: null },
    },
  }),
}));

const { GET } = await import('@/app/auth/callback/route');

/** vitest.config.ts pins NEXT_PUBLIC_SITE_URL to this. */
const SITE = 'https://barrebykelly.test';

function arrive(query: string) {
  return new NextRequest(`http://localhost:8080/auth/callback${query}`);
}

describe('auth callback redirects', () => {
  it('sends the member to the public site, not the container it ran on', async () => {
    const res = await GET(arrive('?code=good&next=%2Faccount'));

    expect(res.headers.get('location')).toBe(`${SITE}/account`);
  });

  it('never redirects to localhost, whatever the request claims', async () => {
    const res = await GET(arrive('?code=good&next=%2Faccount'));

    expect(res.headers.get('location')).not.toContain('localhost');
  });

  it('falls back to /account when next is missing', async () => {
    const res = await GET(arrive('?code=good'));

    expect(res.headers.get('location')).toBe(`${SITE}/account`);
  });

  it('refuses a protocol-relative next, which would be an open redirect', async () => {
    const res = await GET(arrive('?code=good&next=%2F%2Fevil.example'));

    expect(res.headers.get('location')).toBe(`${SITE}/account`);
  });

  it('sends an expired link back to login with a reason', async () => {
    const res = await GET(arrive('?code=expired'));

    expect(res.headers.get('location')).toBe(`${SITE}/login?error=link_expired`);
  });

  it('sends a link with no code back to login with a reason', async () => {
    const res = await GET(arrive(''));

    expect(res.headers.get('location')).toBe(`${SITE}/login?error=missing_code`);
  });
});
