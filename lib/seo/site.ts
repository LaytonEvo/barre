import { clientEnv } from '@/lib/env';

/**
 * Site-level SEO constants.
 *
 * The town is deliberately read from here rather than hard-coded into page
 * titles: both venues are in the St Leonards / St Ives area, which locals
 * search for as Ringwood. If that changes it changes once.
 */
export const SITE = {
  name: 'Barre By Kelly',
  /** Primary search town. Mirrors the `primary_town` setting. */
  town: 'Ringwood',
  /** Also worth ranking for — the villages the venues are actually in. */
  nearby: ['St Leonards', 'St Ives', 'Ashley Heath', 'Verwood'],
  tagline: 'Barre classes for all levels and all bodies',
} as const;

/**
 * True only on the real, public site.
 *
 * Everything that invites a search engine in is gated on this. It is false
 * unless `NEXT_PUBLIC_SITE_ENV` explicitly says production, so a preview, a
 * staging box or a misconfigured deploy is never indexable by accident.
 */
export const IS_PRODUCTION_SITE = clientEnv.NEXT_PUBLIC_SITE_ENV === 'production';

export function siteUrl(path = '/'): string {
  const base = clientEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Title suffix that carries the local intent without stuffing keywords. */
export const localSuffix = `Barre in ${SITE.town}`;
