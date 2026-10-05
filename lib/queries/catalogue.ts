import { createClient } from '@/lib/supabase/server';
import { createPublicClient, type DbClient } from '@/lib/supabase/public';

/**
 * Every query here reads public catalogue data, so it can run either as the
 * signed-in visitor (normal page render) or anonymously with no request at all
 * (`generateStaticParams`, `sitemap.ts`). Callers in the second group pass a
 * client from `createPublicClient()`; everyone else gets the cookie-bound one.
 */
async function resolve(client?: DbClient): Promise<DbClient> {
  return client ?? ((await createClient()) as unknown as DbClient);
}

/** Convenience for build-time callers that have no request context. */
export { createPublicClient };

export type Venue = {
  id: string;
  name: string;
  slug: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  parkingNotes: string | null;
  accessNotes: string | null;
  photoPaths: string[];
  defaultCapacity: number | null;
};

export type ClassType = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  longDescription: string | null;
  level: string;
  intensity: number | null;
  durationMins: number;
  whatToBring: string | null;
};

export type Product = {
  id: string;
  kind: string;
  name: string;
  slug: string;
  description: string | null;
  pricePence: number;
  credits: number | null;
  validityDays: number | null;
};

/** A venue's address as a single line, skipping the parts we do not have. */
export function formatAddress(venue: Venue): string {
  return [venue.addressLine1, venue.addressLine2, venue.city, venue.postcode]
    .filter(Boolean)
    .join(', ');
}

/**
 * A maps link built from the address rather than coordinates.
 *
 * Both venues have verified postcodes but no verified lat/long, and an
 * approximate pin on a venue page is worse than none — someone drives to it.
 */
export function mapsUrl(venue: Venue): string {
  const query = [venue.name, formatAddress(venue)].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export async function listVenues(client?: DbClient): Promise<Venue[]> {
  const supabase = await resolve(client);
  const { data } = await supabase
    .from('venues')
    .select(
      'id, name, slug, address_line1, address_line2, city, county, postcode, latitude, longitude, parking_notes, access_notes, photo_paths, default_capacity',
    )
    .eq('active', true)
    .order('sort_order');

  return (data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    slug: v.slug,
    addressLine1: v.address_line1,
    addressLine2: v.address_line2,
    city: v.city,
    county: v.county,
    postcode: v.postcode,
    latitude: v.latitude,
    longitude: v.longitude,
    parkingNotes: v.parking_notes,
    accessNotes: v.access_notes,
    photoPaths: v.photo_paths ?? [],
    defaultCapacity: v.default_capacity,
  }));
}

export async function getVenue(slug: string, client?: DbClient): Promise<Venue | null> {
  const venues = await listVenues(client);
  return venues.find((venue) => venue.slug === slug) ?? null;
}

export async function listClassTypes(client?: DbClient): Promise<ClassType[]> {
  const supabase = await resolve(client);
  const { data } = await supabase
    .from('class_types')
    .select(
      'id, name, slug, description, long_description, level, intensity, default_duration_mins, what_to_bring',
    )
    .eq('active', true)
    .order('sort_order');

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    longDescription: c.long_description,
    level: c.level,
    intensity: c.intensity,
    durationMins: c.default_duration_mins,
    whatToBring: c.what_to_bring,
  }));
}

export async function getClassType(slug: string, client?: DbClient): Promise<ClassType | null> {
  const types = await listClassTypes(client);
  return types.find((type) => type.slug === slug) ?? null;
}

/**
 * Active products only.
 *
 * The packs are intentionally inactive until the single-class price is known:
 * an unpriced product must never be purchasable, and £0 is not a safe
 * placeholder to let someone check out with.
 */
export async function listActiveProducts(client?: DbClient): Promise<Product[]> {
  const supabase = await resolve(client);
  const { data } = await supabase
    .from('products')
    .select('id, kind, name, slug, description, price_pence, credits, validity_days')
    .eq('active', true)
    .order('sort_order');

  return (data ?? []).map((p) => ({
    id: p.id,
    kind: p.kind,
    name: p.name,
    slug: p.slug,
    description: p.description,
    pricePence: p.price_pence,
    credits: p.credits,
    validityDays: p.validity_days,
  }));
}

/** Pack structure is confirmed even though pricing is not, so it can be shown. */
export async function listPendingPacks(client?: DbClient): Promise<Product[]> {
  const supabase = await resolve(client);
  const { data } = await supabase
    .from('products')
    .select('id, kind, name, slug, description, price_pence, credits, validity_days')
    .eq('kind', 'pack')
    .eq('active', false)
    .order('sort_order');

  return (data ?? []).map((p) => ({
    id: p.id,
    kind: p.kind,
    name: p.name,
    slug: p.slug,
    description: p.description,
    pricePence: p.price_pence,
    credits: p.credits,
    validityDays: p.validity_days,
  }));
}

export type Faq = { id: string; question: string; answer: string; category: string | null };

export async function listFaqs(client?: DbClient): Promise<Faq[]> {
  const supabase = await resolve(client);
  const { data } = await supabase
    .from('faqs')
    .select('id, question, answer, category')
    .eq('published', true)
    .order('sort_order');
  return data ?? [];
}

export type Review = { id: string; authorName: string; rating: number; body: string | null };

/** Returns an empty array until real Google reviews are imported. */
export async function listReviews(client?: DbClient): Promise<Review[]> {
  const supabase = await resolve(client);
  const { data } = await supabase
    .from('reviews')
    .select('id, author_name, rating, body')
    .eq('published', true)
    .order('reviewed_at', { ascending: false })
    .limit(6);

  return (data ?? []).map((r) => ({
    id: r.id,
    authorName: r.author_name,
    rating: r.rating,
    body: r.body,
  }));
}
