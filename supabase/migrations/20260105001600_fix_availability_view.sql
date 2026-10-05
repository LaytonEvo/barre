-- =============================================================================
-- Fixing the spaces-left view, which always reported every class as empty.
--
-- `session_availability` was created `with (security_invoker = true)`, so it
-- counted bookings under the RLS of whoever asked. No visitor — anonymous or
-- signed in — may read other members' booking rows, which is correct and
-- deliberate. The consequence was that `count(b.id)` returned 0 for everybody but
-- an admin, so `spaces_left` always equalled `capacity`.
--
-- The public timetable therefore showed EVERY class as completely empty, however
-- full it was. A sold-out class offered a Book button; the "only 2 spaces left"
-- urgency the brief asks for could never appear; and the waitlist was never
-- offered, because nothing ever looked full.
--
-- No overbooking resulted — `book_session` takes the row lock and refuses, which
-- is why this never showed up as corrupt data. It was purely a lie told to
-- visitors, which is exactly the kind of fault that survives every test that does
-- not drive a real browser as a real anonymous user.
--
-- The fix is to run the view as its owner, which is what a view aggregating rows
-- the caller cannot see has to do. That is safe here for one specific reason:
-- the view exposes counts only. There is no column through which a member's
-- identity could escape, which was the stated design intent all along.
-- =============================================================================

drop view if exists public.session_availability;

create view public.session_availability
-- Deliberately NOT security_invoker. See above: the whole purpose is to count
-- rows the caller is not allowed to read, and the output is aggregate only.
with (security_invoker = false)
as
select
  s.id as session_id,
  s.capacity,
  count(b.id) filter (
    where b.status in ('booked', 'attended', 'no_show_pending', 'no_show')
  )::integer as booked_count,
  greatest(
    s.capacity - count(b.id) filter (
      where b.status in ('booked', 'attended', 'no_show_pending', 'no_show')
    ),
    0
  )::integer as spaces_left,
  count(w.id) filter (where w.status = 'waiting')::integer as waitlist_count
from public.class_sessions s
left join public.bookings b on b.session_id = s.id
left join public.waitlist_entries w on w.session_id = s.id
group by s.id, s.capacity;

comment on view public.session_availability is
  'Read path for spaces-left. Aggregate only: never exposes which members are booked. Runs as owner on purpose — under security_invoker it counted only the caller''s own bookings and reported every class as empty.';

grant select on public.session_availability to anon, authenticated;
