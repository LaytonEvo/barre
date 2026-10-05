import { SITE, siteUrl } from './site';
import type { ClassType, Faq, Venue } from '@/lib/queries/catalogue';
import type { TimetableSession } from '@/lib/queries/timetable';

/**
 * Pure builders for the JSON-LD payloads.
 *
 * Kept separate from the components that render them so they can be tested:
 * malformed structured data, or an advertised price that is not real, is a bug
 * Google and customers both see. Everything here is derived from database rows,
 * and anything we were not given is omitted rather than filled in.
 */

export type JsonLdObject = Record<string, unknown>;

export function postalAddress(venue: Venue): JsonLdObject {
  return {
    '@type': 'PostalAddress',
    streetAddress: [venue.addressLine1, venue.addressLine2].filter(Boolean).join(', '),
    addressLocality: venue.city,
    addressRegion: venue.county,
    postalCode: venue.postcode,
    addressCountry: 'GB',
  };
}

export function buildVenue(venue: Venue): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    '@id': siteUrl(`/locations/${venue.slug}#venue`),
    name: `${SITE.name} — ${venue.name}`,
    description: `Barre classes at ${venue.name} in ${venue.city ?? SITE.town}.`,
    url: siteUrl(`/locations/${venue.slug}`),
    address: postalAddress(venue),
    parentOrganization: { '@type': 'Organization', name: SITE.name, url: siteUrl('/') },
    // Omitted rather than estimated: a wrong pin is worse than no pin when
    // someone is driving to it.
    ...(venue.latitude != null && venue.longitude != null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: venue.latitude,
            longitude: venue.longitude,
          },
        }
      : {}),
  };
}

export function buildBusiness(venues: Venue[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'HealthAndBeautyBusiness',
    '@id': siteUrl('/#business'),
    name: SITE.name,
    description: SITE.tagline,
    url: siteUrl('/'),
    sameAs: ['https://www.facebook.com/barrebykelly'],
    areaServed: [SITE.town, ...SITE.nearby].map((name) => ({ '@type': 'Place', name })),
    location: venues.map((venue) => ({
      '@type': 'SportsActivityLocation',
      '@id': siteUrl(`/locations/${venue.slug}#venue`),
      name: venue.name,
      address: postalAddress(venue),
    })),
  };
}

export function buildSessions(
  sessions: TimetableSession[],
  options: { introOfferIsFree: boolean },
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@graph': sessions.map((session) => ({
      '@type': 'Event',
      '@id': siteUrl(`/timetable#${session.id}`),
      name: `${session.classType.name} — ${SITE.name}`,
      startDate: session.startsAt,
      endDate: session.endsAt,
      eventStatus:
        session.status === 'cancelled'
          ? 'https://schema.org/EventCancelled'
          : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: session.venue.name,
        address: {
          '@type': 'PostalAddress',
          addressLocality: session.venue.city,
          addressCountry: 'GB',
        },
      },
      performer: { '@type': 'Person', name: session.instructor.displayName },
      organizer: { '@type': 'Organization', name: SITE.name, url: siteUrl('/') },
      // Only declared when it is true. Advertising £0 for a class that actually
      // costs money would be a straightforward lie in a rich result.
      ...(options.introOfferIsFree
        ? {
            offers: {
              '@type': 'Offer',
              price: 0,
              priceCurrency: 'GBP',
              description: 'First class free for new members',
              // Omitted when unknown: telling Google a class is in stock when we
              // do not know is worse than saying nothing, and a wrong SoldOut
              // would have it dropped from results altogether.
              availability:
                session.spacesLeft === null
                  ? undefined
                  : session.spacesLeft > 0
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/SoldOut',
              url: siteUrl('/timetable'),
            },
          }
        : {}),
    })),
  };
}

export function buildFaq(faqs: Faq[]): JsonLdObject | null {
  if (faqs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

export function buildInstructor(input: {
  name: string;
  bio: string | null;
  qualifications: string[];
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': siteUrl('/about#kelly'),
    name: input.name,
    jobTitle: 'Barre instructor',
    worksFor: { '@type': 'Organization', name: SITE.name, url: siteUrl('/') },
    url: siteUrl('/about'),
    ...(input.bio ? { description: input.bio } : {}),
    // Never inferred. Empty until Kelly supplies the exact wording.
    ...(input.qualifications.length > 0
      ? {
          hasCredential: input.qualifications.map((credential) => ({
            '@type': 'EducationalOccupationalCredential',
            name: credential,
          })),
        }
      : {}),
  };
}

export function buildClass(classType: ClassType): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'ExercisePlan',
    name: classType.name,
    description: classType.description ?? SITE.tagline,
    url: siteUrl(`/classes/${classType.slug}`),
    exerciseType: 'Barre',
    activityDuration: `PT${classType.durationMins}M`,
  };
}
