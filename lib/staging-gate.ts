import { NextResponse, type NextRequest } from 'next/server';

/**
 * HTTP Basic auth in front of a staging deployment.
 *
 * Active only when `STAGING_PASSWORD` is set, so production is untouched —
 * there is no flag to forget to turn off, because the gate exists only where the
 * variable does.
 *
 * This is a privacy curtain, not a security boundary: it keeps a link from being
 * browsable by anyone who happens on it, which is what a site being built as a
 * surprise actually needs. The real security is unchanged underneath — RLS,
 * requireUser, requireRole.
 *
 * Basic auth rather than a login page because it costs nothing to build, every
 * browser understands it, and it covers every route including the ones a crawler
 * would otherwise reach.
 */

/**
 * Paths that must stay reachable without the password.
 *
 * Machine callers cannot type one, and each already authenticates itself:
 * Stripe and Mux sign their webhooks, and the cron routes require CRON_SECRET.
 * Gating them would mean a staging deployment silently stopped fulfilling
 * payments and sending email, which is the opposite of what staging is for.
 */
const OPEN_PREFIXES = ['/api/'];

function unauthorised(): NextResponse {
  return new NextResponse('Not available yet.', {
    status: 401,
    headers: {
      // ASCII only. HTTP header values are a ByteString, so an em dash here
      // throws when the response is constructed — which would turn every
      // challenge into a 500 instead of a password prompt.
      'WWW-Authenticate': 'Basic realm="Barre By Kelly - not public yet", charset="UTF-8"',
      // Belt and braces alongside the noindex metadata: a 401 is not indexed
      // anyway, but this says so explicitly for anything that looks.
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/**
 * Returns a 401 response when the request should be challenged, or null to let
 * it through.
 */
export function stagingGate(request: NextRequest): NextResponse | null {
  const password = process.env.STAGING_PASSWORD;
  if (!password) return null;

  if (OPEN_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) {
    return null;
  }

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return unauthorised();

  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorised();
  }

  // "user:pass" — the username is ignored, so Kelly can type anything in the
  // first box. One fewer thing to explain when handing the link over.
  const supplied = decoded.slice(decoded.indexOf(':') + 1);

  // Length-independent compare. Over-engineering for a staging curtain, but it
  // costs three lines and the alternative teaches the wrong habit.
  if (supplied.length !== password.length) return unauthorised();
  let mismatch = 0;
  for (let i = 0; i < supplied.length; i += 1) {
    mismatch |= supplied.charCodeAt(i) ^ password.charCodeAt(i);
  }

  return mismatch === 0 ? null : unauthorised();
}
