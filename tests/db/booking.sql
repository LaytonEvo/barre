-- =============================================================================
-- Booking engine behaviour.
--
-- The concurrency guarantee is tested separately, by tests/db/concurrency.sh,
-- because it needs genuinely parallel connections. Everything else — the gates,
-- the cancellation policy, the waitlist, Kelly cancelling a class — is here.
-- =============================================================================
\set ON_ERROR_STOP on

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

/** A member who satisfies the booking gate: waiver signed, PAR-Q valid. */
create or replace function ready_member(p_email text, p_credits integer default 0)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid(); v_waiver uuid;
begin
  select id into v_waiver from public.waiver_versions where is_current limit 1;
  insert into auth.users (id, email) values (v_user, p_email);
  insert into public.waiver_signatures (user_id, waiver_version_id, typed_name, signature_image_path)
  values (v_user, v_waiver, p_email, 'sig/' || p_email || '.png');
  insert into public.health_questionnaires
    (user_id, questionnaire_version, answers, explicit_consent_at, valid_until)
  values (v_user, 'v1', '{}', now(), now() + interval '1 year');
  if p_credits > 0 then
    perform public.grant_credits(v_user, p_credits, 'purchase', now() + interval '90 days');
  end if;
  return v_user;
end $$;

/** A one-off session at a chosen offset, so time-based rules can be exercised. */
create or replace function a_session(p_in interval, p_capacity integer default 10)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id, now() + p_in, now() + p_in + interval '55 minutes', p_capacity, true
  from public.class_types ct, public.venues v, public.instructors i
  limit 1
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- The booking gate
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid := gen_random_uuid();
  v_session uuid := a_session(interval '3 days');
  v_waiver uuid;
begin
  insert into auth.users (id, email) values (v_user, 'nogate@test');

  begin
    perform public.book_session(v_session, v_user);
    raise exception 'FAIL  booking without a signed waiver was permitted';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'waiver_required', 'an unsigned waiver blocks booking');
  end;

  select id into v_waiver from public.waiver_versions where is_current limit 1;
  insert into public.waiver_signatures (user_id, waiver_version_id, typed_name, signature_image_path)
  values (v_user, v_waiver, 'No Gate', 'sig/ng.png');

  begin
    perform public.book_session(v_session, v_user);
    raise exception 'FAIL  booking without a PAR-Q was permitted';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'parq_required', 'an incomplete PAR-Q blocks booking');
  end;
end $$;

do $$
declare
  v_user uuid := ready_member('nocredits@test', 0);
  v_session uuid := a_session(interval '3 days');
begin
  begin
    perform public.book_session(v_session, v_user);
    raise exception 'FAIL  booking with no entitlement was permitted';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'payment_required', 'no credits and no membership means payment is required');
  end;
end $$;

do $$
declare
  v_user uuid := ready_member('windows@test', 5);
begin
  begin
    perform public.book_session(a_session(interval '-1 hour'), v_user);
    raise exception 'FAIL  booking a class that has started was permitted';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'session_started', 'a class that has already started cannot be booked');
  end;

  begin
    -- booking_window_days is 14.
    perform public.book_session(a_session(interval '30 days'), v_user);
    raise exception 'FAIL  booking beyond the window was permitted';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'outside_booking_window', 'a class beyond the booking window cannot be booked');
  end;
end $$;

do $$
declare
  v_user uuid := ready_member('double@test', 5);
  v_session uuid := a_session(interval '3 days');
begin
  perform public.book_session(v_session, v_user);
  begin
    perform public.book_session(v_session, v_user);
    raise exception 'FAIL  the same member booked one class twice';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'already_booked', 'a member cannot book the same class twice');
  end;
  perform assert(public.credit_balance(v_user) = 4, 'and only one credit was spent');
end $$;

do $$
declare
  v_user uuid := ready_member('cancelled-session@test', 5);
  v_session uuid := a_session(interval '3 days');
begin
  update public.class_sessions set status = 'cancelled', cancelled_at = now() where id = v_session;
  begin
    perform public.book_session(v_session, v_user);
    raise exception 'FAIL  a cancelled class was bookable';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'session_cancelled', 'a cancelled class cannot be booked');
  end;
end $$;

-- ---------------------------------------------------------------------------
-- A successful booking
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid := ready_member('happy@test', 3);
  v_session uuid := a_session(interval '3 days');
  v_booking uuid;
  v_row record;
begin
  v_booking := public.book_session(v_session, v_user);
  select * into v_row from public.bookings where id = v_booking;

  perform assert(v_row.status = 'booked', 'a booking starts as booked');
  perform assert(v_row.entitlement_kind = 'credit', 'and records that a credit paid for it');
  perform assert(v_row.ledger_entry_id is not null,
    'and is linked to the ledger entry, which the deferred constraint enforces at commit');
  perform assert(public.credit_balance(v_user) = 2, 'exactly one credit was spent');
  perform assert(
    (select spaces_left from public.session_availability where session_id = v_session) = 9,
    'availability drops by one');
end $$;

-- ---------------------------------------------------------------------------
-- Cancellation. cancellation_window_hours is 24.
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid := ready_member('cancel-early@test', 3);
  v_session uuid := a_session(interval '3 days');
  v_booking uuid;
  v_result record;
begin
  v_booking := public.book_session(v_session, v_user);
  perform assert(public.credit_balance(v_user) = 2, 'booking spends a credit');

  select * into v_result from public.cancel_booking(v_booking, v_user);

  perform assert(v_result.outcome = 'cancelled_in_window', 'cancelling early is in-window');
  perform assert(v_result.credit_returned, 'and returns the credit');
  perform assert(public.credit_balance(v_user) = 3, 'the balance is restored');
  perform assert(
    (select spaces_left from public.session_availability where session_id = v_session) = 10,
    'and the place is released');
end $$;

do $$
declare
  v_user uuid := ready_member('cancel-late@test', 3);
  v_session uuid := a_session(interval '2 hours');
  v_booking uuid;
  v_result record;
begin
  v_booking := public.book_session(v_session, v_user);
  select * into v_result from public.cancel_booking(v_booking, v_user);

  perform assert(v_result.outcome = 'cancelled_late', 'cancelling inside the window is a late cancel');
  perform assert(not v_result.credit_returned, 'and the credit is forfeited');
  perform assert(public.credit_balance(v_user) = 2, 'the balance stays down');
end $$;

do $$
declare
  v_user uuid := ready_member('boundary@test', 3);
  v_session uuid := a_session(interval '24 hours 1 minute');
  v_result record;
begin
  -- The boundary resolves in the member's favour. An off-by-one that charges
  -- somebody is worse than one that does not, and lib/policy/rules.ts agrees.
  select * into v_result from public.cancel_booking(public.book_session(v_session, v_user), v_user);
  perform assert(v_result.outcome = 'cancelled_in_window',
    'cancelling a minute outside the window is free');
end $$;

do $$
declare
  v_user uuid := ready_member('double-cancel@test', 3);
  v_booking uuid;
begin
  v_booking := public.book_session(a_session(interval '3 days'), v_user);
  perform public.cancel_booking(v_booking, v_user);
  begin
    perform public.cancel_booking(v_booking, v_user);
    raise exception 'FAIL  a booking was cancelled twice';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'already_cancelled', 'cancelling twice is refused, so no credit is minted');
  end;
  perform assert(public.credit_balance(v_user) = 3, 'and the balance is right');
end $$;

do $$
declare
  v_a uuid := ready_member('owner-a@test', 3);
  v_b uuid := ready_member('owner-b@test', 3);
  v_booking uuid;
begin
  v_booking := public.book_session(a_session(interval '3 days'), v_a);
  begin
    perform public.cancel_booking(v_booking, v_b);
    raise exception 'FAIL  a member cancelled somebody else''s booking';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_allowed', 'a member cannot cancel another member''s booking');
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Waitlist
-- ---------------------------------------------------------------------------
do $$
declare
  v_first  uuid := ready_member('wl-first@test', 3);
  v_second uuid := ready_member('wl-second@test', 3);
  v_third  uuid := ready_member('wl-third@test', 3);
  v_session uuid := a_session(interval '3 days', 1);
  v_booking uuid;
begin
  v_booking := public.book_session(v_session, v_first);
  perform assert(
    (select spaces_left from public.session_availability where session_id = v_session) = 0,
    'a one-space class fills with one booking');

  begin
    perform public.book_session(v_session, v_second);
    raise exception 'FAIL  a full class accepted another booking';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'session_full', 'a full class refuses further bookings');
  end;

  perform assert(public.join_waitlist(v_session, v_second) = 1, 'the first to wait is position 1');
  perform assert(public.join_waitlist(v_session, v_third) = 2, 'the second is position 2');

  -- ACCEPTANCE TEST 6: a place opens, the first waiting member is booked.
  perform public.cancel_booking(v_booking, v_first);

  perform assert(
    exists (select 1 from public.bookings
            where session_id = v_session and user_id = v_second
              and public.booking_holds_a_place(status)),
    'ACCEPTANCE TEST 6: cancelling auto-books the first person on the waitlist');

  perform assert(public.credit_balance(v_second) = 2,
    'and consumes their credit, so the place is genuinely paid for');

  perform assert(
    (select status from public.waitlist_entries
     where session_id = v_session and user_id = v_second) = 'promoted',
    'their waitlist entry is marked promoted');

  perform assert(
    (select status from public.waitlist_entries
     where session_id = v_session and user_id = v_third) = 'waiting',
    'and the next person stays waiting');
end $$;

do $$
declare
  v_holder uuid := ready_member('wl-holder@test', 3);
  v_broke  uuid := ready_member('wl-broke@test', 0);   -- no credits
  v_ready  uuid := ready_member('wl-ready@test', 3);
  v_session uuid := a_session(interval '3 days', 1);
  v_booking uuid;
begin
  v_booking := public.book_session(v_session, v_holder);
  perform public.join_waitlist(v_session, v_broke);
  perform public.join_waitlist(v_session, v_ready);

  perform public.cancel_booking(v_booking, v_holder);

  -- Somebody with no entitlement must not block the queue behind them.
  perform assert(
    exists (select 1 from public.bookings
            where session_id = v_session and user_id = v_ready
              and public.booking_holds_a_place(status)),
    'a member without credits is skipped rather than stalling the waitlist');

  perform assert(
    (select status from public.waitlist_entries
     where session_id = v_session and user_id = v_broke) = 'notified',
    'and is notified instead, so they can buy a pack and take the next one');
end $$;

do $$
declare
  v_holder uuid := ready_member('wl-cutoff-holder@test', 3);
  v_waiter uuid := ready_member('wl-cutoff-waiter@test', 3);
  v_session uuid := a_session(interval '1 hour', 1);   -- inside the 2h cutoff
  v_booking uuid;
begin
  v_booking := public.book_session(v_session, v_holder);
  perform public.join_waitlist(v_session, v_waiter);
  perform public.cancel_booking(v_booking, v_holder);

  -- Past the cutoff nobody is auto-booked: being signed up for a class you
  -- cannot reach in an hour is worse than being told a place opened.
  perform assert(
    not exists (select 1 from public.bookings
                where session_id = v_session and user_id = v_waiter
                  and public.booking_holds_a_place(status)),
    'inside the cutoff nobody is auto-booked');

  perform assert(
    (select status from public.waitlist_entries
     where session_id = v_session and user_id = v_waiter) = 'notified',
    'everyone waiting is notified instead, first come first served');
end $$;

do $$
declare
  v_user uuid := ready_member('wl-leave@test', 3);
  v_other uuid := ready_member('wl-leave-holder@test', 3);
  v_session uuid := a_session(interval '3 days', 1);
begin
  perform public.book_session(v_session, v_other);
  perform public.join_waitlist(v_session, v_user);
  perform public.leave_waitlist(v_session, v_user);

  perform assert(
    (select status from public.waitlist_entries
     where session_id = v_session and user_id = v_user) = 'left',
    'leaving a waitlist is always free and always allowed');

  perform assert(public.credit_balance(v_user) = 3, 'and costs nothing');
end $$;

-- ---------------------------------------------------------------------------
-- ACCEPTANCE TEST 7: Kelly cancels a class
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := ready_member('kc-a@test', 3);
  v_b uuid := ready_member('kc-b@test', 3);
  v_c uuid := ready_member('kc-c@test', 3);
  v_admin uuid := gen_random_uuid();
  v_session uuid := a_session(interval '3 days', 2);
  v_affected integer;
begin
  insert into auth.users (id, email) values (v_admin, 'kelly-admin@test');
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;

  perform public.book_session(v_session, v_a);
  perform public.book_session(v_session, v_b);
  perform public.join_waitlist(v_session, v_c);

  perform assert(public.credit_balance(v_a) = 2, 'both members have spent a credit');

  -- cancel_session requires admin, and auth.uid() is null here, so impersonate.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  v_affected := public.cancel_session(v_session, 'Hall double-booked');
  perform set_config('request.jwt.claim.sub', '', true);

  perform assert(v_affected = 2, 'ACCEPTANCE TEST 7: both attendees are affected');
  perform assert(public.credit_balance(v_a) = 3, 'the first member is refunded automatically');
  perform assert(public.credit_balance(v_b) = 3, 'and so is the second');

  perform assert(
    (select status from public.class_sessions where id = v_session) = 'cancelled',
    'the session is marked cancelled');

  perform assert(
    (select status from public.waitlist_entries
     where session_id = v_session and user_id = v_c) = 'left',
    'and nobody is left waiting for a class that is not happening');
end $$;

do $$
declare
  v_user uuid := ready_member('kc-notadmin@test', 3);
  v_session uuid := a_session(interval '3 days');
begin
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  begin
    perform public.cancel_session(v_session, 'I would rather not');
    raise exception 'FAIL  a member cancelled a whole class';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_allowed', 'a member cannot cancel a class for everybody');
  end;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- No-shows
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid := ready_member('noshow@test', 3);
  v_session uuid := a_session(interval '3 days');
  v_booking uuid;
  v_marked integer;
begin
  v_booking := public.book_session(v_session, v_user);

  -- Move the class into the past so the auto-marker picks it up.
  update public.class_sessions
    set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour'
    where id = v_session;

  v_marked := public.auto_mark_no_shows();
  perform assert(v_marked >= 1, 'the auto-marker finds an unchecked-in booking');

  perform assert(
    (select status from public.bookings where id = v_booking) = 'no_show_pending',
    'and marks it PENDING rather than penalising outright, because Kelly may simply have forgotten to check somebody in');

  -- A pending no-show still held the place.
  perform assert(
    (select booked_count from public.session_availability where session_id = v_session) = 1,
    'a no-show still counts against capacity: the class was full on the night');
end $$;

do $$
declare
  v_user uuid := ready_member('attend@test', 3);
  v_session uuid := a_session(interval '3 days');
  v_booking uuid;
  v_admin uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_admin, 'kelly-attend@test');
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;

  v_booking := public.book_session(v_session, v_user);

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.mark_attendance(v_booking, 'attended');
  perform set_config('request.jwt.claim.sub', '', true);

  perform assert(
    (select status from public.bookings where id = v_booking) = 'attended',
    'Kelly can mark a member as attended');
  perform assert(
    (select checked_in_at from public.bookings where id = v_booking) is not null,
    'and the check-in time is recorded');
end $$;

do $$
declare
  v_user uuid := ready_member('mark-self@test', 3);
  v_booking uuid;
begin
  v_booking := public.book_session(a_session(interval '3 days'), v_user);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  begin
    perform public.mark_attendance(v_booking, 'attended');
    raise exception 'FAIL  a member marked their own attendance';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_allowed', 'a member cannot mark their own attendance');
  end;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

drop function assert(boolean, text);
drop function ready_member(text, integer);
drop function a_session(interval, integer);
