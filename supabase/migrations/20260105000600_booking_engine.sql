-- =============================================================================
-- The booking engine.
--
-- This is the part that has to be bulletproof. A double-booked class is a person
-- standing in a village hall with nowhere to put their mat.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- First, a structural problem.
--
-- A credit booking needs its ledger entry id, and the ledger entry needs its
-- booking id — each row wants the other's primary key. The existing CHECK
-- cannot express "true by the end of the transaction", because Postgres CHECK
-- constraints are never deferrable.
--
-- A constraint TRIGGER can be. Replacing the CHECK with a deferred one keeps
-- exactly the same guarantee at commit, while letting book_session insert the
-- booking, spend the credit against it, and link the two back up.
-- -----------------------------------------------------------------------------
alter table public.bookings drop constraint bookings_credit_has_ledger_entry;

create or replace function public.tg_booking_credit_has_ledger_entry()
returns trigger
language plpgsql
as $$
declare v_row record;
begin
  -- The row is RE-READ rather than using NEW.
  --
  -- Deferring a constraint trigger delays when it runs, not what it sees: NEW is
  -- still the tuple as it was at the moment of the INSERT, when ledger_entry_id
  -- is legitimately null because the credit has not been spent yet. Checking NEW
  -- would therefore reject every credit booking. Reading the table at commit
  -- time is what actually asks "is this row valid now?".
  select entitlement_kind, ledger_entry_id into v_row
  from public.bookings where id = new.id;

  -- Deleted later in the same transaction: nothing to validate.
  if not found then
    return null;
  end if;

  if v_row.entitlement_kind = 'credit' and v_row.ledger_entry_id is null then
    raise exception
      'booking % claims a credit entitlement but names no ledger entry', new.id
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger bookings_credit_has_ledger_entry
  after insert or update on public.bookings
  deferrable initially deferred
  for each row execute function public.tg_booking_credit_has_ledger_entry();

comment on function public.tg_booking_credit_has_ledger_entry is
  'Deferred to commit so a booking and its credit debit can reference each other. A credit booking with no ledger entry is a class given away for free with no record of it.';

-- -----------------------------------------------------------------------------
-- Which bookings count against capacity.
-- -----------------------------------------------------------------------------
create or replace function public.booking_holds_a_place(p_status public.booking_status)
returns boolean
language sql
immutable
as $$
  -- A no-show still held the place: the class was full on the night.
  select p_status in ('booked', 'attended', 'no_show_pending', 'no_show');
$$;

-- -----------------------------------------------------------------------------
-- Settings helper. Avoids every function re-parsing jsonb by hand.
-- -----------------------------------------------------------------------------
create or replace function public.setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}')::integer from public.settings where key = p_key), p_default);
$$;

create or replace function public.setting_text(p_key text, p_default text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}') from public.settings where key = p_key), p_default);
$$;

-- -----------------------------------------------------------------------------
-- live_membership(user)
--
-- Extracted from book_session, which had this logic inline. It is now the single
-- definition of "this person's membership is live", because video access and
-- booking access disagreeing about that would be a bug nobody would notice
-- until a member complained — and then only about the half they noticed.
--
-- `past_due` stays live until dunning runs out: a card expiring is not a reason
-- to lock someone out of Thursday's class, or out of the library they paid for.
-- -----------------------------------------------------------------------------
create or replace function public.live_membership(p_user_id uuid)
returns table (
  membership_id        uuid,
  product_id           uuid,
  product_kind         public.product_kind,
  status               public.membership_status,
  is_unlimited         boolean,
  max_bookings_per_day integer,
  includes_on_demand   boolean,
  current_period_end   timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.id, pr.id, pr.kind, m.status,
    pr.is_unlimited, pr.max_bookings_per_day, pr.includes_on_demand,
    m.current_period_end
  from public.memberships m
  join public.products pr on pr.id = m.product_id
  where m.user_id = p_user_id
    and m.status in ('trialing', 'active', 'past_due')
    and (m.status <> 'past_due' or m.grace_until is null or m.grace_until > now())
  limit 1;
$$;

comment on function public.live_membership(uuid) is
  'The one definition of a live membership. Used by book_session and by video entitlement so the two cannot drift.';

grant execute on function public.live_membership(uuid) to authenticated;

-- =============================================================================
-- BOOK
--
-- One transaction, one row lock, every gate checked server-side.
--
-- The lock is the whole point. Without `FOR UPDATE` on the session row, two
-- requests both read "9 of 10 booked", both decide there is room, and both
-- insert. Acceptance test 5 fires 20 of these at a 10-space class and asserts
-- exactly 10 succeed.
-- =============================================================================
create or replace function public.book_session(
  p_session_id uuid,
  p_user_id    uuid default null,
  p_source     public.booking_source default 'member'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user        uuid := coalesce(p_user_id, auth.uid());
  v_session     record;
  v_booked      integer;
  v_onboarding  record;
  v_membership  record;
  v_entitlement text;
  v_booking_id  uuid;
  v_entries     uuid[];
  v_window_days integer;
  v_day_count   integer;
  v_max_per_day integer;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- Booking on someone else's behalf is an admin action. Without this a member
  -- could spend another member's credits by passing their id.
  if p_user_id is not null and p_user_id <> coalesce(auth.uid(), p_user_id) and not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- THE LOCK. Serialises every booking attempt on this one class; attempts on
  -- other classes are unaffected.
  select s.*, ct.name as class_name
  into v_session
  from public.class_sessions s
  join public.class_types ct on ct.id = s.class_type_id
  where s.id = p_session_id
  for update of s;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if v_session.status = 'cancelled' then
    raise exception 'session_cancelled' using errcode = 'P0001';
  end if;
  if v_session.starts_at <= now() then
    raise exception 'session_started' using errcode = 'P0001';
  end if;

  v_window_days := public.setting_int('booking_window_days', 14);
  if v_session.starts_at > now() + make_interval(days => v_window_days) then
    raise exception 'outside_booking_window' using errcode = 'P0001';
  end if;

  -- The onboarding gate, from the one view that defines it.
  select * into v_onboarding
  from public.member_onboarding_status where user_id = v_user;

  if not coalesce(v_onboarding.current_waiver_signed, false) then
    raise exception 'waiver_required' using errcode = 'P0001';
  end if;
  if not coalesce(v_onboarding.parq_valid, false) then
    raise exception 'parq_required' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.bookings
    where session_id = p_session_id and user_id = v_user
      and public.booking_holds_a_place(status)
  ) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;

  -- Safe to count now: the session row is locked, so no other transaction can
  -- be adding a booking to it.
  select count(*) into v_booked
  from public.bookings
  where session_id = p_session_id and public.booking_holds_a_place(status);

  if v_booked >= v_session.capacity then
    raise exception 'session_full' using errcode = 'P0001';
  end if;

  -- --- Entitlement -----------------------------------------------------------
  -- `live_membership` is defined above and is also what video entitlement uses,
  -- so "live" cannot come to mean two different things in two places.
  select * into v_membership from public.live_membership(v_user);

  if found and v_membership.is_unlimited then
    v_max_per_day := coalesce(v_membership.max_bookings_per_day, 2);

    select count(*) into v_day_count
    from public.bookings b
    join public.class_sessions s2 on s2.id = b.session_id
    where b.user_id = v_user
      and public.booking_holds_a_place(b.status)
      -- Calendar day in UK local time, not a rolling 24 hours.
      and (s2.starts_at at time zone 'Europe/London')::date
          = (v_session.starts_at at time zone 'Europe/London')::date;

    if v_day_count >= v_max_per_day then
      raise exception 'daily_limit_reached' using errcode = 'P0001';
    end if;

    v_entitlement := 'membership';
  elsif public.credit_balance(v_user) > 0 then
    v_entitlement := 'credit';
  elsif found then
    -- A credit membership with no credits left this period.
    raise exception 'no_credits_left' using errcode = 'P0001';
  else
    raise exception 'payment_required' using errcode = 'P0001';
  end if;

  -- --- Book ------------------------------------------------------------------
  insert into public.bookings (session_id, user_id, entitlement_kind, source)
  values (p_session_id, v_user, v_entitlement, p_source)
  returning id into v_booking_id;

  if v_entitlement = 'credit' then
    -- Raises if the balance moved underneath us, which rolls the whole thing
    -- back including the booking above.
    v_entries := public.consume_credits(
      v_user, 1, 'booking_debit', v_booking_id, p_session_id
    );

    update public.bookings
      set ledger_entry_id = v_entries[1]
      where id = v_booking_id;
  end if;

  return v_booking_id;
end;
$$;

-- =============================================================================
-- CANCEL
--
-- The policy values come from settings, so the behaviour and the member-facing
-- copy on /policies/cancellation can never disagree.
-- =============================================================================
create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_user_id    uuid default null
)
returns table (outcome text, credit_returned boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := coalesce(p_user_id, auth.uid());
  v_booking  record;
  v_session  record;
  v_window   integer;
  v_penalty  text;
  v_in_window boolean;
  v_returned boolean := false;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  if v_booking.user_id <> v_user and not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if not public.booking_holds_a_place(v_booking.status) then
    raise exception 'already_cancelled' using errcode = 'P0001';
  end if;

  select * into v_session from public.class_sessions where id = v_booking.session_id for update;

  v_window  := public.setting_int('cancellation_window_hours', 24);
  v_penalty := public.setting_text('late_cancel_penalty', 'forfeit_credit');

  -- The boundary resolves in the member's favour: cancelling at exactly the
  -- window is free. An off-by-one that charges somebody is worse than one that
  -- does not. lib/policy/rules.ts makes the same choice, and is tested on it.
  v_in_window := v_session.starts_at - now() >= make_interval(hours => v_window);

  update public.bookings
    set status = (case
                    when v_in_window then 'cancelled_in_window'
                    else 'cancelled_late'
                  end)::public.booking_status,
        cancelled_at = now()
    where id = p_booking_id;

  if v_booking.entitlement_kind = 'credit' then
    if v_in_window or v_penalty <> 'forfeit_credit' then
      perform public.refund_booking_credits(p_booking_id, 'cancel_refund');
      v_returned := true;
    else
      -- Forfeited. Nothing is written: the forfeiture IS the original booking
      -- debit standing, and the ledger is append-only so it cannot be restated.
      -- The booking's own cancelled_late status is what explains the gap when a
      -- member reads their history.
      null;
    end if;
  end if;

  -- A place has opened. Try the waitlist.
  perform public.promote_from_waitlist(v_booking.session_id);

  return query select
    case when v_in_window then 'cancelled_in_window' else 'cancelled_late' end,
    v_returned;
end;
$$;

-- =============================================================================
-- WAITLIST
-- =============================================================================
create or replace function public.join_waitlist(
  p_session_id uuid,
  p_user_id    uuid default null
)
returns integer   -- position in the queue
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_position integer;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.bookings
    where session_id = p_session_id and user_id = v_user
      and public.booking_holds_a_place(status)
  ) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;

  insert into public.waitlist_entries (session_id, user_id)
  values (p_session_id, v_user)
  on conflict do nothing;

  select count(*) into v_position
  from public.waitlist_entries w
  where w.session_id = p_session_id
    and w.status = 'waiting'
    and w.joined_at <= (
      select joined_at from public.waitlist_entries
      where session_id = p_session_id and user_id = v_user and status = 'waiting'
    );

  return v_position;
end;
$$;

/**
 * Promote the first eligible person when a place opens.
 *
 * Before the cutoff a waiting member is booked automatically. After it they are
 * only notified — auto-booking somebody twenty minutes before a class they may
 * not be able to reach is worse than letting them choose.
 *
 * Anyone without an entitlement is skipped rather than blocking the queue, and
 * notified so they can buy a pack and take the place themselves.
 */
create or replace function public.promote_from_waitlist(p_session_id uuid)
returns uuid   -- the booking created, or null
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session   record;
  v_cutoff    integer;
  v_booked    integer;
  v_candidate record;
  v_booking   uuid;
begin
  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'scheduled' or v_session.starts_at <= now() then
    return null;
  end if;

  select count(*) into v_booked
  from public.bookings
  where session_id = p_session_id and public.booking_holds_a_place(status);

  if v_booked >= v_session.capacity then
    return null;  -- nothing opened after all
  end if;

  v_cutoff := public.setting_int('waitlist_cutoff_hours', 2);

  for v_candidate in
    select * from public.waitlist_entries
    where session_id = p_session_id and status = 'waiting'
    order by joined_at asc
    for update
  loop
    if v_session.starts_at - now() <= make_interval(hours => v_cutoff) then
      -- Past the cutoff: tell everyone, first come first served.
      update public.waitlist_entries
        set status = 'notified', notified_at = now()
        where session_id = p_session_id and status = 'waiting';
      return null;
    end if;

    begin
      v_booking := public.book_session(p_session_id, v_candidate.user_id, 'waitlist');
    exception when others then
      -- No credits, no waiver, already booked elsewhere: skip rather than stall
      -- the queue, and mark them notified so they know a place came up.
      update public.waitlist_entries
        set status = 'notified', notified_at = now()
        where id = v_candidate.id;
      continue;
    end;

    update public.waitlist_entries
      set status = 'promoted', promoted_at = now(), booking_id = v_booking
      where id = v_candidate.id;

    return v_booking;
  end loop;

  return null;
end;
$$;

create or replace function public.leave_waitlist(
  p_session_id uuid,
  p_user_id    uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := coalesce(p_user_id, auth.uid());
begin
  -- Always free, by design.
  update public.waitlist_entries
    set status = 'left', left_at = now()
    where session_id = p_session_id and user_id = v_user and status in ('waiting', 'notified');
end;
$$;

-- =============================================================================
-- KELLY CANCELS A CLASS
--
-- Every attendee gets their credit back automatically. Nobody should have to
-- ask for a refund for a class that did not happen.
-- =============================================================================
create or replace function public.cancel_session(
  p_session_id uuid,
  p_reason     text
)
returns integer   -- members affected
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking record;
  v_count   integer := 0;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.class_sessions
    set status = 'cancelled', cancelled_at = now(),
        cancelled_reason = p_reason, cancelled_by = auth.uid()
    where id = p_session_id and status = 'scheduled';

  if not found then
    raise exception 'session_not_found_or_already_cancelled' using errcode = 'P0001';
  end if;

  for v_booking in
    select * from public.bookings
    where session_id = p_session_id and public.booking_holds_a_place(status)
  loop
    update public.bookings
      set status = 'cancelled_in_window', cancelled_at = now()
      where id = v_booking.id;

    if v_booking.entitlement_kind = 'credit' then
      perform public.refund_booking_credits(
        v_booking.id, 'class_cancelled_refund', p_reason
      );
    end if;

    v_count := v_count + 1;
  end loop;

  -- Nobody is left waiting for a class that is not happening.
  update public.waitlist_entries
    set status = 'left', left_at = now()
    where session_id = p_session_id and status in ('waiting', 'notified');

  return v_count;
end;
$$;

-- =============================================================================
-- ATTENDANCE
-- =============================================================================
create or replace function public.mark_attendance(
  p_booking_id uuid,
  p_status     public.booking_status
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_booking record;
begin
  if p_status not in ('attended', 'no_show', 'no_show_pending', 'booked') then
    raise exception 'invalid_attendance_status' using errcode = 'P0001';
  end if;

  select b.*, s.instructor_id into v_booking
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  where b.id = p_booking_id;

  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  -- Kelly, or the instructor teaching that particular class.
  if not public.is_admin() and not exists (
    select 1 from public.instructors i
    where i.id = v_booking.instructor_id and i.profile_id = auth.uid()
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.bookings
    set status = p_status,
        checked_in_at = case when p_status = 'attended' then now() else checked_in_at end,
        marked_by = auth.uid()
    where id = p_booking_id;
end;
$$;

/**
 * Auto-mark no-shows after a class.
 *
 * Creates a PENDING no-show for Kelly to confirm rather than applying a penalty
 * outright. An automated mark will occasionally catch someone she simply forgot
 * to check in, and that person has no way to prove they were there. One tap
 * confirms it; the setting flips this to immediate if that is ever preferred.
 */
create or replace function public.auto_mark_no_shows()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delay   integer := public.setting_int('no_show_auto_mark_mins', 30);
  v_pending boolean := public.setting_text('no_show_auto_mark_requires_confirmation', 'true') = 'true';
  v_count   integer;
begin
  with marked as (
    update public.bookings b
      -- Cast required: a CASE over string literals is text, and assigning text
      -- to an enum column is an error rather than an implicit coercion.
      set status = (case when v_pending then 'no_show_pending' else 'no_show' end)::public.booking_status
      from public.class_sessions s
      where s.id = b.session_id
        and b.status = 'booked'
        and s.status = 'scheduled'
        and s.starts_at + make_interval(mins => v_delay) <= now()
      returning b.id
  )
  select count(*) into v_count from marked;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Who may call what.
--
-- Members call book/cancel/waitlist for themselves — the functions check
-- auth.uid() and refuse to act on anyone else's behalf without admin. The rest
-- are service-role only.
-- -----------------------------------------------------------------------------
revoke all on function public.book_session(uuid, uuid, public.booking_source) from public, anon;
revoke all on function public.cancel_booking(uuid, uuid) from public, anon;
revoke all on function public.join_waitlist(uuid, uuid) from public, anon;
revoke all on function public.leave_waitlist(uuid, uuid) from public, anon;
grant execute on function public.book_session(uuid, uuid, public.booking_source) to authenticated;
grant execute on function public.cancel_booking(uuid, uuid) to authenticated;
grant execute on function public.join_waitlist(uuid, uuid) to authenticated;
grant execute on function public.leave_waitlist(uuid, uuid) to authenticated;

revoke all on function public.promote_from_waitlist(uuid) from public, anon, authenticated;
revoke all on function public.cancel_session(uuid, text) from public, anon;
revoke all on function public.auto_mark_no_shows() from public, anon, authenticated;
grant execute on function public.cancel_session(uuid, text) to authenticated;
grant execute on function public.mark_attendance(uuid, public.booking_status) to authenticated;
