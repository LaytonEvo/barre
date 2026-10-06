-- =============================================================================
-- "Last class" was showing a date in the future.
--
-- The member list computed it as max(starts_at) over every booking that holds a
-- place, which includes the ones that have not happened. Read on 6 October,
-- every row said "Last class 19 October 2026".
--
-- Worse than confusing: useless for the question the column exists to answer.
-- Kelly reads a member list to see who has stopped coming, and a value
-- dominated by future bookings can never show that — anyone still booking looks
-- recent, and anyone drifting away is flattered by whatever they last booked
-- rather than judged on when they last turned up.
--
-- Now the most recent class they were actually marked present at. Null until
-- somebody has been marked, which the list already renders as nothing rather
-- than inventing a date.
-- =============================================================================

create or replace function public.admin_search_members(p_query text default null)
returns table (
  user_id        uuid,
  full_name      text,
  email          text,
  phone          text,
  credits        integer,
  attended       integer,
  last_booking   timestamptz,
  health_flagged boolean,
  waiver_signed  boolean,
  anonymised     boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select
    p.id,
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    p.email::text,
    p.phone,
    public.credit_balance(p.id),
    (select count(*) from public.bookings b where b.user_id = p.id and b.status = 'attended')::integer,
    -- Attended, and already happened. Both matter: a booking is not a visit,
    -- and a class next week is not a class they have been to.
    (select max(s.starts_at) from public.bookings b
      join public.class_sessions s on s.id = b.session_id
      where b.user_id = p.id
        and b.status = 'attended'
        and s.starts_at < now()),
    coalesce((
      select h.flagged from public.health_questionnaires h
      where h.user_id = p.id order by h.completed_at desc limit 1
    ), false),
    exists (
      select 1 from public.waiver_signatures ws
      join public.waiver_versions wv on wv.id = ws.waiver_version_id
      where ws.user_id = p.id and wv.is_current
    ),
    p.anonymised_at is not null
  from public.profiles p
  where p_query is null
     or trim(p_query) = ''
     or p.email::text ilike '%' || p_query || '%'
     or coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') ilike '%' || p_query || '%'
     or coalesce(p.phone, '') ilike '%' || p_query || '%'
  order by p.created_at desc
  limit 100;
end;
$$;

-- create or replace resets nothing, but be explicit about the grant this
-- function needs, because the first version of this migration revoked EXECUTE
-- from `authenticated` and emptied the member list: the function checks
-- is_admin() internally, so the grant only decides who may reach that check,
-- and a signed-in admin is `authenticated`.
revoke all on function public.admin_search_members(text) from public, anon;
grant execute on function public.admin_search_members(text) to authenticated;
