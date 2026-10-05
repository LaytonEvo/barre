import { createClient } from '@/lib/supabase/server';
import { addUkDays, startOfUkWeek } from '@/lib/time';

export type TimetableSession = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: 'scheduled' | 'cancelled';
  note: string | null;
  classType: { name: string; slug: string; level: string };
  venue: { name: string; slug: string; city: string | null };
  instructor: { displayName: string };
  /** `null` when availability could not be read — never guessed. */
  spacesLeft: number | null;
  bookedCount: number | null;
  waitlistCount: number | null;
};

type SessionRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: 'scheduled' | 'cancelled';
  note: string | null;
  class_types: { name: string; slug: string; level: string } | null;
  venues: { name: string; slug: string; city: string | null } | null;
  instructors: { display_name: string } | null;
};

const SELECT = `
  id, starts_at, ends_at, capacity, status, note,
  class_types!inner ( name, slug, level ),
  venues!inner ( name, slug, city ),
  instructors!inner ( display_name )
`;

/**
 * Availability comes from a separate aggregate view rather than a join, because
 * the view is deliberately aggregate-only: it exposes spaces_left without ever
 * exposing which members are booked. Joining bookings here would leak identity
 * to an anonymous visitor.
 */
async function withAvailability(rows: SessionRow[]): Promise<TimetableSession[]> {
  if (rows.length === 0) return [];

  const supabase = await createClient();
  const { data: availability } = await supabase
    .from('session_availability')
    .select('session_id, spaces_left, booked_count, waitlist_count')
    .in(
      'session_id',
      rows.map((row) => row.id),
    );

  const byId = new Map((availability ?? []).map((a) => [a.session_id, a]));

  return rows.flatMap((row) => {
    // An inner join guarantees these, but the generated types cannot express
    // that, so a missing relation is skipped rather than rendered as "undefined".
    if (!row.class_types || !row.venues || !row.instructors) return [];
    const a = byId.get(row.id);

    return [
      {
        id: row.id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        capacity: row.capacity,
        status: row.status,
        note: row.note,
        classType: row.class_types,
        venue: row.venues,
        instructor: { displayName: row.instructors.display_name },
        // `null` when availability could not be read, NOT `row.capacity`.
        //
        // The old fallback silently rendered an unknown class as completely
        // empty, which is the most dangerous direction to fail in: it offers a
        // Book button for a class that may be full, and it masked a real bug for
        // three milestones (the view counted bookings under the caller's RLS, so
        // every class always looked empty — see migration 20260105001600).
        //
        // A card that does not know how many spaces are left now says nothing
        // about spaces, rather than saying something false.
        spacesLeft: a?.spaces_left ?? null,
        bookedCount: a?.booked_count ?? null,
        waitlistCount: a?.waitlist_count ?? null,
      },
    ];
  });
}

export type TimetableFilters = {
  venueSlug?: string | undefined;
  classTypeSlug?: string | undefined;
};

/** Every session in the Monday-start week containing `anchor`. */
export async function getWeekSessions(
  anchor: Date,
  filters: TimetableFilters = {},
): Promise<TimetableSession[]> {
  const supabase = await createClient();
  const monday = startOfUkWeek(anchor);
  const nextMonday = addUkDays(monday, 7);

  let query = supabase
    .from('class_sessions')
    .select(SELECT)
    .gte('starts_at', monday.toISOString())
    .lt('starts_at', nextMonday.toISOString())
    .order('starts_at', { ascending: true });

  if (filters.venueSlug) query = query.eq('venues.slug', filters.venueSlug);
  if (filters.classTypeSlug) query = query.eq('class_types.slug', filters.classTypeSlug);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load the timetable: ${error.message}`);

  return withAvailability((data ?? []) as unknown as SessionRow[]);
}

/** The next few upcoming sessions, for the homepage and class pages. */
export async function getUpcomingSessions(
  limit = 3,
  filters: TimetableFilters = {},
): Promise<TimetableSession[]> {
  const supabase = await createClient();

  let query = supabase
    .from('class_sessions')
    .select(SELECT)
    .eq('status', 'scheduled')
    .gt('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit);

  if (filters.venueSlug) query = query.eq('venues.slug', filters.venueSlug);
  if (filters.classTypeSlug) query = query.eq('class_types.slug', filters.classTypeSlug);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load upcoming classes: ${error.message}`);

  return withAvailability((data ?? []) as unknown as SessionRow[]);
}

/** Group a week's sessions by UK calendar day, preserving order. */
export function groupByDay(sessions: TimetableSession[]): Map<string, TimetableSession[]> {
  const grouped = new Map<string, TimetableSession[]>();
  for (const session of sessions) {
    const key = session.startsAt.slice(0, 10);
    const existing = grouped.get(key);
    if (existing) existing.push(session);
    else grouped.set(key, [session]);
  }
  return grouped;
}
