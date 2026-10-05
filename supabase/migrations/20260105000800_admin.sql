-- =============================================================================
-- Admin and instructor portal.
--
-- Kelly runs this standing up in a village hall on a phone, thirty seconds
-- before a class starts. Every query here is shaped so one screen is one round
-- trip, and every mutation records who did it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Audit.
--
-- Written by the functions below rather than by a blanket trigger, because the
-- useful record is "Kelly gave someone a credit back because the hall was
-- locked", not "a row changed". A trigger would capture the latter and miss the
-- reason, which is the only part anybody reads afterwards.
-- -----------------------------------------------------------------------------
create or replace function public.write_audit(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_before, p_after);
$$;

-- =============================================================================
-- THE REGISTER
--
-- One row per booked member, with everything Kelly needs to decide how to treat
-- them in the next thirty seconds: is this their first class, has she seen their
-- health answers, have they signed the current waiver.
-- =============================================================================
create or replace function public.register_for_session(p_session_id uuid)
returns table (
  booking_id        uuid,
  user_id           uuid,
  full_name         text,
  initials          text,
  status            public.booking_status,
  source            public.booking_source,
  entitlement_kind  text,
  is_first_class    boolean,
  attended_count    integer,
  health_flagged    boolean,
  health_summary    text,
  health_reviewed   boolean,
  waiver_signed     boolean,
  emergency_contact text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Admins see every register; an instructor sees only their own classes.
  if not public.is_admin() and not exists (
    select 1 from public.class_sessions s
    join public.instructors i on i.id = s.instructor_id
    where s.id = p_session_id and i.profile_id = auth.uid()
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select
    b.id,
    p.id,
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    upper(coalesce(left(p.first_name, 1), '') || coalesce(left(p.last_name, 1), '')),
    b.status,
    b.source,
    b.entitlement_kind,
    -- First class: no attendance anywhere before this one. The badge exists so
    -- Kelly knows to say hello and keep an eye on them.
    not exists (
      select 1 from public.bookings prior
      where prior.user_id = p.id and prior.status = 'attended' and prior.id <> b.id
    ),
    (select count(*) from public.bookings a where a.user_id = p.id and a.status = 'attended')::integer,
    coalesce(hq.flagged, false),
    hq.flag_summary,
    coalesce(hq.review_state = 'reviewed', false),
    exists (
      select 1 from public.waiver_signatures ws
      join public.waiver_versions wv on wv.id = ws.waiver_version_id
      where ws.user_id = p.id and wv.is_current
    ),
    nullif(trim(coalesce(p.emergency_contact_name, '') || ' ' ||
                coalesce(p.emergency_contact_phone, '')), '')
  from public.bookings b
  join public.profiles p on p.id = b.user_id
  left join lateral (
    select h.flagged, h.flag_summary, h.review_state
    from public.health_questionnaires h
    where h.user_id = p.id
    order by h.completed_at desc
    limit 1
  ) hq on true
  where b.session_id = p_session_id
    and public.booking_holds_a_place(b.status)
  -- First-timers first: they are the ones who need greeting.
  order by (not exists (
    select 1 from public.bookings prior
    where prior.user_id = p.id and prior.status = 'attended' and prior.id <> b.id
  )) desc, p.first_name, p.last_name;
end;
$$;

-- =============================================================================
-- Today
-- =============================================================================
create or replace function public.admin_today(p_date date default null)
returns table (
  session_id   uuid,
  starts_at    timestamptz,
  ends_at      timestamptz,
  class_name   text,
  venue_name   text,
  instructor   text,
  capacity     integer,
  booked       integer,
  waitlist     integer,
  first_timers integer,
  flagged      integer,
  status       public.session_status,
  all_marked   boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_day date := coalesce(p_date, (now() at time zone 'Europe/London')::date);
begin
  if not public.is_staff() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select
    s.id,
    s.starts_at,
    s.ends_at,
    ct.name,
    v.name,
    i.display_name,
    s.capacity,
    (select count(*) from public.bookings b
      where b.session_id = s.id and public.booking_holds_a_place(b.status))::integer,
    (select count(*) from public.waitlist_entries w
      where w.session_id = s.id and w.status = 'waiting')::integer,
    (select count(*) from public.bookings b
      where b.session_id = s.id and public.booking_holds_a_place(b.status)
        and not exists (
          select 1 from public.bookings prior
          where prior.user_id = b.user_id and prior.status = 'attended' and prior.id <> b.id
        ))::integer,
    (select count(*) from public.bookings b
      join public.health_questionnaires h on h.user_id = b.user_id
      where b.session_id = s.id and public.booking_holds_a_place(b.status) and h.flagged)::integer,
    s.status,
    -- Has every booking been marked? Drives the "register done" tick.
    not exists (
      select 1 from public.bookings b
      where b.session_id = s.id and b.status in ('booked', 'no_show_pending')
    )
  from public.class_sessions s
  join public.class_types ct on ct.id = s.class_type_id
  join public.venues v on v.id = s.venue_id
  join public.instructors i on i.id = s.instructor_id
  where (s.starts_at at time zone 'Europe/London')::date = v_day
    -- An instructor sees their own day, Kelly sees everyone's.
    and (public.is_admin() or i.profile_id = auth.uid())
  order by s.starts_at;
end;
$$;

-- =============================================================================
-- Members
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
    (select max(s.starts_at) from public.bookings b
      join public.class_sessions s on s.id = b.session_id
      where b.user_id = p.id and public.booking_holds_a_place(b.status)),
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

/**
 * Manual credit adjustment.
 *
 * A reason is mandatory — both the ledger CHECK and this function require one.
 * Six months later, "why does this member have three extra credits" has to have
 * an answer, and "Kelly adjusted it" is not one.
 *
 * Positive goes through grant_credits; negative through consume_credits, which
 * means a deduction respects FIFO and cannot take credits that are not there.
 */
create or replace function public.admin_adjust_credits(
  p_user_id uuid,
  p_delta   integer,
  p_reason  text
)
returns integer   -- the new balance
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_balance integer;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_delta = 0 then
    raise exception 'adjustment_must_be_nonzero' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  if p_delta > 0 then
    perform public.grant_credits(
      p_user_id, p_delta, 'admin_adjustment', null, null, null, null, auth.uid(), p_reason
    );
  else
    perform public.consume_credits(
      p_user_id, -p_delta, 'admin_adjustment', null, null, auth.uid(), p_reason
    );
  end if;

  v_balance := public.credit_balance(p_user_id);

  perform public.write_audit(
    'adjust_credits', 'profiles', p_user_id,
    null,
    jsonb_build_object('delta', p_delta, 'reason', p_reason, 'new_balance', v_balance)
  );

  return v_balance;
end;
$$;

-- =============================================================================
-- Schedule
-- =============================================================================
create or replace function public.admin_set_session_capacity(
  p_session_id uuid,
  p_capacity   integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_old integer; v_booked integer;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_capacity < 1 then
    raise exception 'capacity_must_be_positive' using errcode = 'P0001';
  end if;

  select capacity into v_old from public.class_sessions where id = p_session_id;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  select count(*) into v_booked from public.bookings
  where session_id = p_session_id and public.booking_holds_a_place(status);

  -- Refuse rather than silently leaving the class over capacity. Kelly would
  -- have to turn somebody away at the door, and she should find that out now.
  if p_capacity < v_booked then
    raise exception 'capacity_below_bookings' using errcode = 'P0001';
  end if;

  update public.class_sessions set capacity = p_capacity where id = p_session_id;

  perform public.write_audit(
    'set_capacity', 'class_sessions', p_session_id,
    jsonb_build_object('capacity', v_old),
    jsonb_build_object('capacity', p_capacity)
  );

  -- Raising capacity may free a place for somebody waiting.
  if p_capacity > v_old then
    perform public.promote_from_waitlist(p_session_id);
  end if;
end;
$$;

-- =============================================================================
-- Settings
-- =============================================================================
create or replace function public.admin_set_setting(
  p_key   text,
  p_value jsonb,
  p_confirmed boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_old jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select value into v_old from public.settings where key = p_key;
  if not found then
    raise exception 'unknown_setting' using errcode = 'P0001';
  end if;

  update public.settings
    set value = p_value, confirmed = p_confirmed, updated_by = auth.uid(), updated_at = now()
    where key = p_key;

  perform public.write_audit(
    'set_setting', 'settings', null,
    jsonb_build_object('key', p_key, 'value', v_old),
    jsonb_build_object('key', p_key, 'value', p_value, 'confirmed', p_confirmed)
  );
end;
$$;

-- =============================================================================
-- Reports
-- =============================================================================
create or replace function public.report_attendance(p_weeks integer default 12)
returns table (
  week_starting date,
  sessions      integer,
  capacity      integer,
  booked        integer,
  attended      integer,
  no_shows      integer,
  fill_rate     numeric
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
    (date_trunc('week', s.starts_at at time zone 'Europe/London'))::date,
    count(distinct s.id)::integer,
    sum(s.capacity)::integer,
    count(b.id) filter (where public.booking_holds_a_place(b.status))::integer,
    count(b.id) filter (where b.status = 'attended')::integer,
    count(b.id) filter (where b.status in ('no_show', 'no_show_pending'))::integer,
    case when sum(s.capacity) > 0
      then round(100.0 * count(b.id) filter (where public.booking_holds_a_place(b.status))
                 / sum(s.capacity), 1)
      else 0 end
  from public.class_sessions s
  left join public.bookings b on b.session_id = s.id
  where s.starts_at >= now() - make_interval(weeks => p_weeks)
    and s.starts_at < now()
    and s.status = 'scheduled'
  group by 1
  order by 1 desc;
end;
$$;

create or replace function public.report_revenue(p_months integer default 12)
returns table (
  month        date,
  product_name text,
  purchases    integer,
  gross_pence  bigint,
  refunded_pence bigint,
  net_pence    bigint
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
    (date_trunc('month', pu.purchased_at at time zone 'Europe/London'))::date,
    pr.name,
    count(*)::integer,
    sum(pu.amount_pence)::bigint,
    sum(pu.refunded_pence)::bigint,
    (sum(pu.amount_pence) - sum(pu.refunded_pence))::bigint
  from public.purchases pu
  join public.products pr on pr.id = pu.product_id
  where pu.status in ('paid', 'partially_refunded', 'refunded')
    and pu.purchased_at >= now() - make_interval(months => p_months)
  group by 1, 2
  order by 1 desc, 6 desc;
end;
$$;

/**
 * Members who have drifted.
 *
 * The point is a nudge before they are gone for good, so it deliberately
 * excludes people who never started — somebody who signed up and never booked
 * is a different conversation from a regular who has stopped coming.
 */
create or replace function public.report_at_risk(p_days integer default 21)
returns table (
  user_id        uuid,
  full_name      text,
  email          text,
  last_class     timestamptz,
  days_since     integer,
  attended_total integer,
  credits        integer,
  marketing_ok   boolean
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
    last.starts_at,
    extract(day from now() - last.starts_at)::integer,
    (select count(*) from public.bookings b
      where b.user_id = p.id and b.status = 'attended')::integer,
    public.credit_balance(p.id),
    p.marketing_consent
  from public.profiles p
  join lateral (
    select max(s.starts_at) as starts_at
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    where b.user_id = p.id and b.status = 'attended'
  ) last on true
  where p.anonymised_at is null
    and last.starts_at is not null
    and last.starts_at < now() - make_interval(days => p_days)
  order by last.starts_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants. Each function checks the caller itself; these just stop anonymous
-- visitors reaching them at all.
-- -----------------------------------------------------------------------------
revoke all on function public.write_audit(text, text, uuid, jsonb, jsonb) from public, anon, authenticated;

do $$
declare fn text;
begin
  foreach fn in array array[
    'register_for_session(uuid)',
    'admin_today(date)',
    'admin_search_members(text)',
    'admin_adjust_credits(uuid, integer, text)',
    'admin_set_session_capacity(uuid, integer)',
    'admin_set_setting(text, jsonb, boolean)',
    'report_attendance(integer)',
    'report_revenue(integer)',
    'report_at_risk(integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
