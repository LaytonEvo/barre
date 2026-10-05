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

/**
 * Build an internal link whose shape is known at the call site but whose value
 * comes from data — a venue slug, a class slug, a querystring assembled from
 * filters.
 *
 * Typed routes cannot verify these at compile time, so this is the one place the
 * cast lives. It is a plain narrowing, not a validation: the inputs come from our
 * own database rows, not from the request, so there is nothing to sanitise. For
 * anything that does come from the request, use `internalPath` above.
 */
export function path(value: string): Route {
  return value as Route;
}
