import { describe, expect, it } from 'vitest';
import {
  buildBusiness,
  buildClass,
  buildFaq,
  buildInstructor,
  buildSessions,
  buildVenue,
} from '@/lib/seo/structured-data';
import type { Venue, ClassType } from '@/lib/queries/catalogue';
import type { TimetableSession } from '@/lib/queries/timetable';

/**
 * Structured data is consumed by Google and shown to people in search results,
 * so a wrong price or an invented coordinate is a real-world problem rather than
 * a cosmetic one. These tests pin the things we have promised not to do.
 */

const villageHall: Venue = {
  id: 'v1',
  name: 'St Leonards & St Ives Village Hall',
  slug: 'st-leonards-village-hall',
  addressLine1: 'Braeside Road',
  addressLine2: 'St Leonards',
  city: 'Ringwood',
  county: 'Dorset',
  postcode: 'BH24 2PH',
  latitude: null,
  longitude: null,
  parkingNotes: null,
  accessNotes: null,
  photoPaths: [],
  defaultCapacity: 16,
};

const session: TimetableSession = {
  id: 'abc',
  startsAt: '2026-10-05T17:30:00Z',
  endsAt: '2026-10-05T18:25:00Z',
  capacity: 16,
  status: 'scheduled',
  hasStarted: false,
  note: null,
  classType: { name: 'Barre', slug: 'barre', level: 'all_levels' },
  venue: { name: villageHall.name, slug: villageHall.slug, city: 'Ringwood' },
  instructor: { displayName: 'Kelly' },
  spacesLeft: 16,
  bookedCount: 0,
  waitlistCount: 0,
};

describe('buildVenue', () => {
  it('includes the verified postal address', () => {
    const address = buildVenue(villageHall).address as Record<string, unknown>;
    expect(address.postalCode).toBe('BH24 2PH');
    expect(address.streetAddress).toBe('Braeside Road, St Leonards');
    expect(address.addressCountry).toBe('GB');
  });

  it('omits geo entirely when coordinates are unknown', () => {
    // A wrong pin is worse than a missing one when someone drives to it.
    expect(buildVenue(villageHall)).not.toHaveProperty('geo');
  });

  it('includes geo once coordinates exist', () => {
    const withGeo = buildVenue({ ...villageHall, latitude: 50.84, longitude: -1.82 });
    expect(withGeo.geo).toMatchObject({ latitude: 50.84, longitude: -1.82 });
  });

  it('does not emit a null street address when address lines are missing', () => {
    const sparse = buildVenue({ ...villageHall, addressLine1: null, addressLine2: null });
    expect((sparse.address as Record<string, unknown>).streetAddress).toBe('');
  });
});

describe('canonical URLs', () => {
  it('builds absolute @id and url values from the site URL', () => {
    // Relative URLs in structured data are ignored by Google, so these must be
    // absolute. vitest.config.ts pins NEXT_PUBLIC_SITE_URL so this is stable.
    const data = buildVenue(villageHall);
    expect(data['@id']).toBe('https://barrebykelly.test/locations/st-leonards-village-hall#venue');
    expect(data.url).toBe('https://barrebykelly.test/locations/st-leonards-village-hall');
  });
});

describe('buildBusiness', () => {
  it('lists every venue as a location', () => {
    const business = buildBusiness([villageHall]);
    expect(Array.isArray(business.location)).toBe(true);
    expect((business.location as unknown[]).length).toBe(1);
  });

  it('names the towns worth ranking for', () => {
    const served = (buildBusiness([]).areaServed as Array<{ name: string }>).map((p) => p.name);
    expect(served).toContain('Ringwood');
    expect(served).toContain('St Leonards');
  });
});

describe('buildSessions', () => {
  it('emits one Event per session with real start and end instants', () => {
    const graph = buildSessions([session], { introOfferIsFree: true })['@graph'] as Array<
      Record<string, unknown>
    >;
    expect(graph).toHaveLength(1);
    expect(graph[0]!.startDate).toBe('2026-10-05T17:30:00Z');
    expect(graph[0]!.endDate).toBe('2026-10-05T18:25:00Z');
    expect(graph[0]!.eventStatus).toBe('https://schema.org/EventScheduled');
  });

  it('marks a cancelled class as cancelled rather than hiding it', () => {
    const graph = buildSessions([{ ...session, status: 'cancelled' }], {
      introOfferIsFree: true,
    })['@graph'] as Array<Record<string, unknown>>;
    expect(graph[0]!.eventStatus).toBe('https://schema.org/EventCancelled');
  });

  it('declares the £0 offer only when the first class really is free', () => {
    const free = buildSessions([session], { introOfferIsFree: true })['@graph'] as Array<
      Record<string, unknown>
    >;
    expect(free[0]!.offers).toMatchObject({ price: 0, priceCurrency: 'GBP' });
  });

  it('omits offers entirely when there is no confirmed price', () => {
    // Advertising £0 for a class that costs money would be a lie in a rich result.
    const paid = buildSessions([session], { introOfferIsFree: false })['@graph'] as Array<
      Record<string, unknown>
    >;
    expect(paid[0]).not.toHaveProperty('offers');
  });

  it('reports a full class as sold out', () => {
    const full = buildSessions([{ ...session, spacesLeft: 0 }], {
      introOfferIsFree: true,
    })['@graph'] as Array<Record<string, unknown>>;
    expect((full[0]!.offers as Record<string, unknown>).availability).toBe(
      'https://schema.org/SoldOut',
    );
  });

  it('produces an empty graph rather than failing on no sessions', () => {
    expect(buildSessions([], { introOfferIsFree: true })['@graph']).toEqual([]);
  });
});

describe('buildInstructor', () => {
  it('omits credentials entirely when none have been supplied', () => {
    // Claiming a qualification someone has not told us they hold is the one
    // thing this must never do.
    expect(buildInstructor({ name: 'Kelly', bio: null, qualifications: [] })).not.toHaveProperty(
      'hasCredential',
    );
  });

  it('omits the description when there is no bio', () => {
    expect(buildInstructor({ name: 'Kelly', bio: null, qualifications: [] })).not.toHaveProperty(
      'description',
    );
  });

  it('includes credentials verbatim once supplied', () => {
    const data = buildInstructor({
      name: 'Kelly',
      bio: 'Teaches barre in Ringwood.',
      qualifications: ['Example Barre Certification Level 3'],
    });
    expect(data.hasCredential).toMatchObject([{ name: 'Example Barre Certification Level 3' }]);
    expect(data.description).toBe('Teaches barre in Ringwood.');
  });
});

describe('buildFaq', () => {
  it('returns null for an empty list, so no empty FAQPage is emitted', () => {
    expect(buildFaq([])).toBeNull();
  });

  it('pairs each question with its answer', () => {
    const data = buildFaq([
      { id: '1', question: 'Do I need experience?', answer: 'No.', category: null },
    ]);
    expect(data?.mainEntity).toMatchObject([
      { name: 'Do I need experience?', acceptedAnswer: { text: 'No.' } },
    ]);
  });
});

describe('buildClass', () => {
  it('expresses the duration as an ISO 8601 period', () => {
    const classType: ClassType = {
      id: 'c1',
      name: 'Barre',
      slug: 'barre',
      description: 'Ballet-inspired strength work.',
      longDescription: null,
      level: 'all_levels',
      intensity: 3,
      durationMins: 55,
      whatToBring: null,
    };
    expect(buildClass(classType).activityDuration).toBe('PT55M');
  });
});
