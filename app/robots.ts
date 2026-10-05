import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo/site';

export default function robots(): MetadataRoute.Robots {
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
