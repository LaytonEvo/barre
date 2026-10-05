-- =============================================================================
-- Session generation.
--
-- Pulled forward from M5 because the M2 timetable needs real sessions to render.
-- One implementation, called by both the seed script and (from M5) the pg_cron
-- job, so dev and production can never generate differently.
--
-- The timezone handling is the whole point of this function. A template says
-- "Monday 18:30", which is a WALL-CLOCK time, not an instant. Generating by
-- adding 168 hours to the previous session drifts by an hour across the October
-- and March clock changes — a 18:30 class would silently become 17:30. So each
-- date is combined with the local time and converted in the venue's own
-- timezone. tests/db/invariants.sql asserts this across the BST boundary.
-- =============================================================================

create or replace function public.generate_class_sessions(
  p_weeks_ahead integer default null,
  p_from date default null
)
returns table (created integer, skipped integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_weeks   integer;
  v_from    date;
  v_to      date;
  v_created integer;
  v_total   integer;
begin
  -- The window comes from settings, so Kelly can widen it without a deploy.
  v_weeks := coalesce(
    p_weeks_ahead,
    (select (value #>> '{}')::integer from public.settings
      where key = 'session_generation_weeks_ahead'),
    8
  );
  v_from := coalesce(p_from, current_date);
  v_to   := v_from + (v_weeks * 7);

  with candidates as (
    select
      t.id as template_id,
      t.class_type_id,
      t.venue_id,
      t.instructor_id,
      t.capacity,
      ((d::date + t.start_time_local) at time zone v.timezone) as starts_at,
      ((d::date + t.start_time_local) at time zone v.timezone)
        + make_interval(mins => t.duration_mins) as ends_at
    from public.schedule_templates t
    join public.venues v on v.id = t.venue_id
    cross join generate_series(v_from, v_to, interval '1 day') as d
    where t.active
      and v.active
      and extract(dow from d) = t.weekday
      and d::date >= t.effective_from
      and (t.effective_to is null or d::date <= t.effective_to)
  ),
  -- Never create a session in the past: a re-run mid-week must not resurrect
  -- Monday's class on Wednesday.
  future as (
    select * from candidates where starts_at > now()
  ),
  inserted as (
    insert into public.class_sessions
      (template_id, class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity)
    select template_id, class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity
    from future
    -- Idempotent: the unique index on (template_id, starts_at) means a second
    -- run in the same minute creates nothing. Invariant 10.
    on conflict (template_id, starts_at) where template_id is not null do nothing
    returning 1
  )
  select
    (select count(*) from inserted)::integer,
    (select count(*) from future)::integer
  into v_created, v_total;

  insert into public.session_generation_runs
    (window_start, window_end, sessions_created, sessions_skipped)
  values (v_from, v_to, v_created, v_total - v_created);

  return query select v_created, (v_total - v_created);
end;
$$;

comment on function public.generate_class_sessions is
  'Generates concrete sessions from active templates across a rolling window. Idempotent and timezone-correct. Called by the seed script and the pg_cron job.';

revoke all on function public.generate_class_sessions(integer, date) from public, anon, authenticated;
