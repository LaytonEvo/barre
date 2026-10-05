import type { MetadataRoute } from 'next';
import { createPublicClient, listClassTypes, listVenues } from '@/lib/queries/catalogue';
import { siteUrl } from '@/lib/seo/site';

/**
 * Generated from the database, so a new venue or class type appears in the
 * sitemap without anybody remembering to add it.
 *
 * Gated and no-value routes (/account, /admin, /login, /styleguide) are excluded
 * — robots.ts disallows them too.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Runs without a request during prerender, so use the anonymous client.
  const client = createPublicClient();
  const [venues, classTypes] = await Promise.all([listVenues(client), listClassTypes(client)]);
  const now = new Date();

  const staticRoutes: Array<[string, MetadataRoute.Sitemap[number]['changeFrequency'], number]> = [
    ['/', 'weekly', 1],
    ['/timetable', 'daily', 0.9],
    ['/new-here', 'monthly', 0.8],
    ['/pricing', 'monthly', 0.8],
    ['/locations', 'monthly', 0.7],
    ['/classes', 'monthly', 0.7],
    ['/about', 'monthly', 0.6],
    ['/faq', 'monthly', 0.5],
    ['/contact', 'yearly', 0.4],
    ['/private-and-events', 'yearly', 0.4],
    ['/gift-vouchers', 'yearly', 0.3],
    ['/policies/cancellation', 'yearly', 0.3],
    ['/policies/terms', 'yearly', 0.2],
    ['/policies/privacy', 'yearly', 0.2],
    ['/policies/cookies', 'yearly', 0.1],
  ];

  return [
    ...staticRoutes.map(([path, changeFrequency, priority]) => ({
      url: siteUrl(path),
      lastModified: now,
      changeFrequency,
      priority,
    })),
    ...venues.map((venue) => ({
      url: siteUrl(`/locations/${venue.slug}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...classTypes.map((classType) => ({
      url: siteUrl(`/classes/${classType.slug}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
