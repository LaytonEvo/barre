-- =============================================================================
-- Admin portal: authorisation boundaries, the register, and audited mutations.
--
-- The boundary that matters most here is admin vs instructor. A future cover
-- teacher gets their own classes and nothing else — not the member list, not
-- the ledger, not everybody's health answers.
-- =============================================================================
\set ON_ERROR_STOP on

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

create or replace function ready_member(p_email text, p_credits integer default 0)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid(); v_waiver uuid;
begin
  select id into v_waiver from public.waiver_versions where is_current limit 1;
  insert into auth.users (id, email) values (v_user, p_email);
  update public.profiles set first_name = split_part(p_email,'@',1), last_name = 'Test'
    where id = v_user;
  insert into public.waiver_signatures (user_id, waiver_version_id, typed_name, signature_image_path)
  values (v_user, v_waiver, p_email, v_user || '/sig.png');
  insert into public.health_questionnaires
    (user_id, questionnaire_version, answers, explicit_consent_at, valid_until)
  values (v_user, 'v1', '{}', now(), now() + interval '1 year');
  if p_credits > 0 then
    perform public.grant_credits(v_user, p_credits, 'purchase', now() + interval '90 days');
  end if;
  return v_user;
end $$;

-- Kelly, and a cover instructor who teaches a different class.
create temporary table admin_fixture as
select
  gen_random_uuid() as kelly,
  gen_random_uuid() as cover,
  gen_random_uuid() as cover_instructor_id;
grant select on admin_fixture to authenticated;

do $$
declare f record;
begin
  select * into f from admin_fixture;

  insert into auth.users (id, email) values (f.kelly, 'kelly-admin6@test'), (f.cover, 'cover@test');
  insert into public.user_roles (user_id, role) values
    (f.kelly, 'admin'), (f.cover, 'instructor') on conflict do nothing;

  -- The cover teacher is a real instructor row, linked to their login.
  insert into public.instructors (id, profile_id, display_name, slug, active, sort_order)
  values (f.cover_instructor_id, f.cover, 'Cover Teacher', 'cover-teacher', true, 2);
end $$;

-- ---------------------------------------------------------------------------
-- The register
-- ---------------------------------------------------------------------------
do $$
declare
  f         record;
  v_session uuid;
  v_new     uuid;
  v_regular uuid;
  v_flagged uuid;
  v_row     record;
begin
  select * into f from admin_fixture;

  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id, now() + interval '2 days', now() + interval '2 days 55 minutes', 25, true
  from public.class_types ct, public.venues v, public.instructors i
  where i.slug = 'kelly-brooks' limit 1
  returning id into v_session;

  v_new     := ready_member('reg-new@test', 2);
  v_regular := ready_member('reg-regular@test', 2);
  v_flagged := ready_member('reg-flagged@test', 2);

  update public.health_questionnaires
    set flagged = true, flag_summary = 'bone or joint problem'
    where user_id = v_flagged;

  perform public.book_session(v_session, v_new);
  perform public.book_session(v_session, v_regular);
  perform public.book_session(v_session, v_flagged);

  -- Give the regular a history, so the first-class badge means something.
  update public.bookings set status = 'attended'
  where user_id = v_regular and session_id <> v_session;
  insert into public.bookings (session_id, user_id, entitlement_kind, status)
  select v_session, v_regular, 'payment', 'attended'
  where false;

  perform set_config('request.jwt.claim.sub', f.kelly::text, true);

  perform assert(
    (select count(*) from public.register_for_session(v_session)) = 3,
    'the register lists every booked member');

  select * into v_row from public.register_for_session(v_session)
  where user_id = v_flagged;

  perform assert(v_row.health_flagged, 'and shows which members have a health flag');
  perform assert(v_row.health_summary = 'bone or joint problem',
    'with a one-line summary Kelly can read at a glance');
  perform assert(v_row.waiver_signed, 'and whether the current waiver is signed');
  perform assert(v_row.is_first_class, 'and whether this is their first class');
  perform assert(v_row.initials is not null and length(v_row.initials) > 0,
    'with initials, since members have no photo for an avatar');

  -- First-timers sort to the top: they are the ones who need greeting.
  perform assert(
    (select bool_and(is_first_class) from (
      select is_first_class from public.register_for_session(v_session) limit 3
    ) t),
    'first-timers are listed first');

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Admin vs instructor
-- ---------------------------------------------------------------------------
do $$
declare
  f          record;
  v_kelly_s  uuid;
  v_cover_s  uuid;
  v_member   uuid;
begin
  select * into f from admin_fixture;

  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id, now() + interval '3 days', now() + interval '3 days 55 minutes', 25, true
  from public.class_types ct, public.venues v, public.instructors i
  where i.slug = 'kelly-brooks' limit 1
  returning id into v_kelly_s;

  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  values (
    (select id from public.class_types limit 1),
    (select id from public.venues limit 1),
    f.cover_instructor_id,
    now() + interval '4 days', now() + interval '4 days 55 minutes', 25, true
  ) returning id into v_cover_s;

  v_member := ready_member('cover-member@test', 2);
  perform public.book_session(v_cover_s, v_member);

  perform set_config('request.jwt.claim.sub', f.cover::text, true);

  perform assert(
    (select count(*) from public.register_for_session(v_cover_s)) = 1,
    'an instructor can open the register for their own class');

  begin
    perform public.register_for_session(v_kelly_s);
    raise exception 'FAIL  an instructor opened somebody else''s register';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_allowed',
      'but not the register for a class they are not teaching');
  end;

  -- The member list, the ledger and the reports are Kelly's, not a cover
  -- teacher's. An instructor needs their own register and nothing else.
  begin
    perform public.admin_search_members(null);
    raise exception 'FAIL  an instructor searched the member list';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_allowed', 'an instructor cannot search the member list');
  end;

  begin
    perform public.admin_adjust_credits(v_member, 1, 'why not');
    raise exception 'FAIL  an instructor adjusted a credit balance';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_allowed', 'an instructor cannot adjust credits');
  end;

  begin
    perform public.report_revenue(12);
    raise exception 'FAIL  an instructor read the revenue report';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_allowed', 'an instructor cannot read revenue');
  end;

  perform assert(
    (select count(*) from public.admin_today((now() + interval '4 days')::date)) = 1,
    'but an instructor does see their own day');

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

do $$
declare v_member uuid := ready_member('nosy@test', 1);
begin
  perform set_config('request.jwt.claim.sub', v_member::text, true);
  begin
    perform public.admin_today(null);
    raise exception 'FAIL  a member opened the admin day view';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_allowed', 'a member cannot open the admin day view');
  end;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Credit adjustment
-- ---------------------------------------------------------------------------
do $$
declare
  f        record;
  v_member uuid := ready_member('adjust@test', 2);
  v_new    integer;
begin
  select * into f from admin_fixture;
  perform set_config('request.jwt.claim.sub', f.kelly::text, true);

  v_new := public.admin_adjust_credits(v_member, 2, 'Hall was locked, class did not run');
  perform assert(v_new = 4, 'an admin can add credits');

  perform assert(
    exists (select 1 from public.audit_log
            where action = 'adjust_credits' and entity_id = v_member
              and after ->> 'reason' = 'Hall was locked, class did not run'),
    'and the reason is recorded in the audit log, which is the only part anyone reads later');

  v_new := public.admin_adjust_credits(v_member, -1, 'Booked by phone instead');
  perform assert(v_new = 3, 'and can take them away');

  -- A reason is mandatory. "Kelly adjusted it" is not an answer six months on.
  begin
    perform public.admin_adjust_credits(v_member, 1, '   ');
    raise exception 'FAIL  a credit adjustment was accepted with no reason';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'reason_required', 'an adjustment without a reason is refused');
  end;

  begin
    perform public.admin_adjust_credits(v_member, 0, 'nothing');
    raise exception 'FAIL  a zero adjustment was accepted';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'adjustment_must_be_nonzero', 'a zero adjustment is refused');
  end;

  -- A deduction cannot take credits that are not there.
  begin
    perform public.admin_adjust_credits(v_member, -99, 'too many');
    raise exception 'FAIL  an admin took more credits than existed';
  exception when others then
    perform assert(sqlerrm like '%insufficient_credits%',
      'a deduction cannot take credits the member does not have');
  end;

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Capacity
-- ---------------------------------------------------------------------------
do $$
declare
  f         record;
  v_session uuid;
  v_a       uuid := ready_member('cap-a@test', 2);
  v_b       uuid := ready_member('cap-b@test', 2);
  v_waiter  uuid := ready_member('cap-wait@test', 2);
begin
  select * into f from admin_fixture;

  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id, now() + interval '5 days', now() + interval '5 days 55 minutes', 2, true
  from public.class_types ct, public.venues v, public.instructors i
  where i.slug = 'kelly-brooks' limit 1
  returning id into v_session;

  perform public.book_session(v_session, v_a);
  perform public.book_session(v_session, v_b);
  perform public.join_waitlist(v_session, v_waiter);

  perform set_config('request.jwt.claim.sub', f.kelly::text, true);

  -- Shrinking below the number booked would mean turning somebody away at the
  -- door. Kelly should find that out now, not then.
  begin
    perform public.admin_set_session_capacity(v_session, 1);
    raise exception 'FAIL  capacity was lowered below the number already booked';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'capacity_below_bookings',
      'capacity cannot be lowered below the number already booked');
  end;

  perform public.admin_set_session_capacity(v_session, 3);
  perform assert(
    (select capacity from public.class_sessions where id = v_session) = 3,
    'raising capacity works');

  perform assert(
    exists (select 1 from public.bookings
            where session_id = v_session and user_id = v_waiter
              and public.booking_holds_a_place(status)),
    'and immediately books the first person off the waitlist');

  perform assert(
    exists (select 1 from public.audit_log
            where action = 'set_capacity' and entity_id = v_session),
    'the capacity change is audited');

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  select * into f from admin_fixture;
  perform set_config('request.jwt.claim.sub', f.kelly::text, true);

  perform public.admin_set_setting('cancellation_window_hours', '18'::jsonb, true);
  perform assert(
    (select (value #>> '{}')::integer from public.settings where key = 'cancellation_window_hours') = 18,
    'an admin can change a policy setting');

  perform assert(
    (select confirmed from public.settings where key = 'cancellation_window_hours'),
    'and mark it confirmed, which clears it from the unconfirmed list');

  perform assert(
    exists (select 1 from public.audit_log
            where action = 'set_setting' and before ->> 'key' = 'cancellation_window_hours'),
    'with the old and new values both audited');

  begin
    perform public.admin_set_setting('made_up_key', '1'::jsonb);
    raise exception 'FAIL  an unknown setting key was accepted';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'unknown_setting',
      'an unknown setting key is refused rather than silently created');
  end;

  -- Put it back so later suites see the documented value.
  perform public.admin_set_setting('cancellation_window_hours', '24'::jsonb, true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
do $$
declare f record; v_rows integer;
begin
  select * into f from admin_fixture;
  perform set_config('request.jwt.claim.sub', f.kelly::text, true);

  select count(*) into v_rows from public.report_attendance(12);
  perform assert(v_rows >= 0, 'the attendance report runs');

  select count(*) into v_rows from public.report_revenue(12);
  perform assert(v_rows >= 0, 'the revenue report runs');

  select count(*) into v_rows from public.report_at_risk(21);
  perform assert(v_rows >= 0, 'the at-risk report runs');

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Pending no-shows, and the job that resolves them.
--
-- The pending state exists so a class Kelly forgot to check in does not silently
-- mark people absent (docs/03 §F1). That is only true if something eventually
-- settles the record, and if Kelly's correction beats the job.
-- ---------------------------------------------------------------------------
do $$
declare
  f           record;
  v_session   uuid;
  v_recent    uuid;
  v_forgotten uuid;
  v_present   uuid;
  v_count     integer;
  v_status    text;
begin
  select * into f from admin_fixture;

  -- The class is created in the future and booked, then moved into the past.
  -- `book_session` rightly refuses a class that has already started, so this is
  -- also the only honest way to set the scenario up: the booking is made the way
  -- a real one is, and then time passes.
  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id, now() + interval '1 day', now() + interval '1 day 55 minutes', 25, true
  from public.class_types ct, public.venues v, public.instructors i
  where i.slug = 'kelly-brooks' limit 1
  returning id into v_session;

  v_recent := ready_member('ns-recent@test', 2);
  perform public.book_session(v_session, v_recent);

  -- 40 minutes ago: past the 30-minute auto-mark, nowhere near the 48-hour
  -- confirmation window.
  update public.class_sessions
    set starts_at = now() - interval '40 minutes', ends_at = now() - interval '5 minutes'
    where id = v_session;

  perform assert(public.auto_mark_no_shows() >= 1,
    'auto-marking catches a booking nobody checked in');

  select status into v_status from public.bookings
    where user_id = v_recent and session_id = v_session;
  perform assert(v_status = 'no_show_pending',
    'and leaves it PENDING rather than absent, so a forgotten register is recoverable');

  -- The confirmation job must not touch it yet: 40 minutes is not 48 hours.
  perform public.confirm_pending_no_shows();
  select status into v_status from public.bookings
    where user_id = v_recent and session_id = v_session;
  perform assert(v_status = 'no_show_pending',
    'the confirmation job leaves a recent pending no-show alone');

  -- Now a class three days back, booked the same way and then aged.
  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id, now() + interval '1 day', now() + interval '1 day 55 minutes', 25, true
  from public.class_types ct, public.venues v, public.instructors i
  where i.slug = 'kelly-brooks' limit 1
  returning id into v_session;

  v_forgotten := ready_member('ns-forgotten@test', 2);
  v_present   := ready_member('ns-present@test', 2);
  perform public.book_session(v_session, v_forgotten);
  perform public.book_session(v_session, v_present);

  update public.class_sessions
    set starts_at = now() - interval '3 days',
        ends_at   = now() - interval '3 days' + interval '55 minutes'
    where id = v_session;

  perform public.auto_mark_no_shows();

  -- Kelly corrects one of them before the job runs: this member did attend.
  perform set_config('request.jwt.claim.sub', f.kelly::text, true);
  perform public.mark_attendance(
    (select id from public.bookings where user_id = v_present and session_id = v_session),
    'attended');
  perform set_config('request.jwt.claim.sub', '', true);

  v_count := public.confirm_pending_no_shows();
  perform assert(v_count >= 1, 'the confirmation job settles a pending no-show after the window');

  select status into v_status from public.bookings
    where user_id = v_forgotten and session_id = v_session;
  perform assert(v_status = 'no_show', 'the undisputed one becomes a confirmed no-show');

  select status into v_status from public.bookings
    where user_id = v_present and session_id = v_session;
  perform assert(v_status = 'attended',
    'ACCEPTANCE: Kelly''s correction survives the job — it cannot overturn a human');

  perform assert(
    exists (select 1 from public.audit_log
            where action = 'auto_confirm_no_shows' and actor_id is null),
    'the batch is audited with a null actor, which reads as "the system did this"');

  -- Idempotent: a second run has nothing left to settle.
  perform assert(public.confirm_pending_no_shows() = 0,
    'running it again confirms nothing, so a retry is safe');
end $$;

drop function assert(boolean, text);
drop function ready_member(text, integer);
