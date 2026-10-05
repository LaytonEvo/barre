import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Rate limiting for public write paths.
 *
 * Two buckets per request, both of which must pass:
 *
 *  - **per IP**, which is the useful one for an ordinary flood;
 *  - **global**, as a backstop, because `x-forwarded-for` is a header and a
 *    determined bot can vary it freely. Without the second bucket the first is
 *    bypassed by changing one string.
 *
 * The global cap is deliberately far above any real day's traffic for a business
 * this size, so it only ever bites during an attack.
 */

export type RateLimitOutcome = { allowed: true } | { allowed: false; reason: 'ip' | 'global' };

/**
 * The client IP, as far as it can be known.
 *
 * Behind Vercel the left-most `x-forwarded-for` entry is set by the proxy and is
 * trustworthy; off Vercel it is whatever the client sent. Treated as a hint for
 * bucketing, never as identity.
 */
async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || headerList.get('x-real-ip') || 'unknown';
}

async function setting(key: string, fallback: number): Promise<number> {
  const { data } = await createAdminClient()
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  const value = typeof data?.value === 'number' ? data.value : Number(data?.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function checkRateLimit(
  action: 'enquiries' | 'newsletter',
  fallbackPerHour: number,
): Promise<RateLimitOutcome> {
  const db = createAdminClient();
  const ip = await clientIp();

  const [perIp, globalCap] = await Promise.all([
    setting(`rate_limit_${action}_per_hour`, fallbackPerHour),
    setting('rate_limit_public_writes_per_hour', 200),
  ]);

  const { data: ipAllowed } = await db.rpc('consume_rate_limit', {
    p_key: `${action}:${ip}`,
    p_max: perIp,
    p_window_seconds: 3600,
  });
  if (ipAllowed === false) return { allowed: false, reason: 'ip' };

  const { data: globalAllowed } = await db.rpc('consume_rate_limit', {
    p_key: 'public-writes',
    p_max: globalCap,
    p_window_seconds: 3600,
  });
  if (globalAllowed === false) return { allowed: false, reason: 'global' };

  return { allowed: true };
}
