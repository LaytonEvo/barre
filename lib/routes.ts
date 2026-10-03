import type { Route } from 'next';

/**
 * Validate a caller-supplied redirect target and narrow it to a typed route.
 *
 * `next=` parameters arrive from the query string, so they are attacker
 * controlled: without the same-origin check an attacker could send
 * `/login?next=https://evil.example` and use our login page as a credible
 * redirect to their own. Rejecting anything that is not a single-slash absolute
 * path closes that, including the `//evil.example` protocol-relative form.
 *
 * The cast is the one concession to typed routes: a runtime string cannot be
 * proven to be a real route at compile time. Keeping it in this single function
 * means there is exactly one place to audit, rather than a cast at every
 * redirect site.
 */
export function internalPath(candidate: string | null | undefined, fallback: Route): Route {
  if (!candidate) return fallback;
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//')) return fallback;
  // Backslashes are normalised to slashes by some browsers, so `/\evil.example`
  // can behave like a protocol-relative URL.
  if (candidate.includes('\\')) return fallback;
  return candidate as Route;
}
