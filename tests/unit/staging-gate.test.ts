import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stagingGate } from '@/lib/staging-gate';

/**
 * The curtain in front of a staging deployment.
 *
 * Worth real tests for one reason: the failure is silent. A gate that quietly
 * stops challenging looks exactly like a gate that is working, right up until
 * somebody finds the site.
 */
const PASSWORD = 'open-sesame-123';

function request(path = '/', auth?: string): NextRequest {
  return new NextRequest(`https://staging.example${path}`, {
    headers: auth ? { authorization: auth } : {},
  });
}

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.STAGING_PASSWORD;
  process.env.STAGING_PASSWORD = PASSWORD;
});

afterEach(() => {
  if (saved === undefined) delete process.env.STAGING_PASSWORD;
  else process.env.STAGING_PASSWORD = saved;
});

describe('when no password is configured', () => {
  it('lets everything through, so production is untouched', () => {
    delete process.env.STAGING_PASSWORD;
    expect(stagingGate(request('/'))).toBeNull();
    expect(stagingGate(request('/admin'))).toBeNull();
  });

  it('treats an empty password as not configured rather than as a password', () => {
    // Otherwise `STAGING_PASSWORD=` in a dashboard would gate the site behind a
    // password nobody can type.
    process.env.STAGING_PASSWORD = '';
    expect(stagingGate(request('/'))).toBeNull();
  });
});

describe('challenging a visitor', () => {
  it('refuses a request with no credentials', () => {
    const response = stagingGate(request('/'));
    expect(response?.status).toBe(401);
  });

  it('asks the browser for a password, which is what shows the prompt', () => {
    const response = stagingGate(request('/'));
    expect(response?.headers.get('WWW-Authenticate')).toContain('Basic');
  });

  it('tells crawlers not to index the challenge either', () => {
    expect(stagingGate(request('/'))?.headers.get('X-Robots-Tag')).toContain('noindex');
  });

  it('refuses the wrong password', () => {
    expect(stagingGate(request('/', basic('kelly', 'wrong')))?.status).toBe(401);
  });

  it('refuses a password that merely starts correctly', () => {
    expect(stagingGate(request('/', basic('kelly', PASSWORD.slice(0, -1))))?.status).toBe(401);
    expect(stagingGate(request('/', basic('kelly', PASSWORD + 'x')))?.status).toBe(401);
  });

  it('refuses a malformed or non-Basic header rather than throwing', () => {
    expect(stagingGate(request('/', 'Bearer something'))?.status).toBe(401);
    expect(stagingGate(request('/', 'Basic !!!not-base64!!!'))?.status).toBe(401);
    expect(stagingGate(request('/', 'Basic '))?.status).toBe(401);
  });

  it('gates every page, not just the gated areas', () => {
    for (const path of ['/', '/timetable', '/pricing', '/about', '/gift', '/robots.txt']) {
      expect(stagingGate(request(path))?.status, path).toBe(401);
    }
  });
});

describe('letting the right people in', () => {
  it('accepts the correct password', () => {
    expect(stagingGate(request('/', basic('kelly', PASSWORD)))).toBeNull();
  });

  it('ignores the username, so anything can go in the first box', () => {
    expect(stagingGate(request('/', basic('', PASSWORD)))).toBeNull();
    expect(stagingGate(request('/', basic('anyone-at-all', PASSWORD)))).toBeNull();
  });

  it('handles a password containing a colon', () => {
    // The username is everything before the FIRST colon, so a colon in the
    // password must not truncate it.
    process.env.STAGING_PASSWORD = 'pass:with:colons';
    expect(stagingGate(request('/', basic('kelly', 'pass:with:colons')))).toBeNull();
  });
});

describe('machine callers', () => {
  it('lets webhooks and cron through without a password', () => {
    // They cannot type one, and each authenticates itself: Stripe and Mux sign
    // their webhooks, the cron routes require CRON_SECRET. Gating them would
    // make staging silently stop fulfilling payments and sending email.
    for (const path of [
      '/api/stripe/webhook',
      '/api/mux/webhook',
      '/api/cron/send-email',
      '/api/admin/reports/revenue.csv',
    ]) {
      expect(stagingGate(request(path)), path).toBeNull();
    }
  });

  it('does not let a lookalike path slip past the exemption', () => {
    expect(stagingGate(request('/apishop'))?.status).toBe(401);
    expect(stagingGate(request('/not/api/thing'))?.status).toBe(401);
  });
});
