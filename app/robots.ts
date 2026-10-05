import type { MetadataRoute } from 'next';
import { IS_PRODUCTION_SITE, siteUrl } from '@/lib/seo/site';

/**
 * Computed per request rather than prerendered.
 *
 * `NEXT_PUBLIC_SITE_ENV` is read at build time for a statically generated route,
 * which froze robots.txt to whatever the BUILD knew. A single artifact promoted from
 * staging to production would then keep serving the staging answer — and the
 * failure is invisible, because the page itself looks right.
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  // Staging and previews are closed to crawlers outright. Not a nicety: this
  // site is a surprise for the person it is named after, and an indexed staging
  // URL is exactly how somebody finds a thing early by searching their own name.
  if (!IS_PRODUCTION_SITE) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Gated areas and the internal styleguide carry no search value, and
      // /auth/* would waste crawl budget on redirects.
      disallow: ['/account', '/admin', '/login', '/signup', '/auth/', '/styleguide'],
    },
    sitemap: siteUrl('/sitemap.xml'),
  };
}
