-- =============================================================================
-- Lifecycle automations and the notification queue.
--
-- These queries decide who gets emailed. The failure that matters is not a crash
-- — it is emailing somebody who did not consent, or nagging somebody daily.
-- =============================================================================
\set ON_ERROR_STOP on

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

create or replace function a_member(p_email text, p_marketing boolean default true)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid(); v_waiver uuid;
begin
  select id into v_waiver from public.waiver_versions where is_current limit 1;
  insert into auth.users (id, email) values (v_user, p_email);
  update public.profiles
    set first_name = split_part(p_email,'@',1), last_name = 'Auto',
        marketing_consent = p_marketing
    where id = v_user;
  insert into public.waiver_signatures (user_id, waiver_version_id, typed_name, signature_image_path)
  values (v_user, v_waiver, p_email, v_user || '/sig.png');
  insert into public.health_questionnaires
    (user_id, questionnaire_version, answers, explicit_consent_at, valid_until)
  values (v_user, 'v1', '{}', now(), now() + interval '1 year');
  return v_user;
end $$;

-- An attended class, that many days ago.
create or replace function attended_ago(p_user uuid, p_days_ago numeric)
returns uuid language plpgsql as $$
declare v_session uuid; v_booking uuid; v_starts timestamptz;
begin
  -- One expression for the start, with the end derived from it. Computing both
  -- independently produced equal timestamps for whole-day values, which the
  -- times-ordered constraint rightly rejected.
  v_starts := now() - make_interval(mins => (p_days_ago * 1440)::integer);

  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id, v_starts, v_starts + interval '55 minutes', 25, true
  from public.class_types ct, public.venues v, public.instructors i
  where i.slug = 'kelly-brooks' limit 1
  returning id into v_session;

  insert into public.bookings (session_id, user_id, entitlement_kind, status)
  values (v_session, p_user, 'payment', 'attended')
  returning id into v_booking;

  return v_booking;
end $$;

-- ---------------------------------------------------------------------------
-- First-class follow-up
-- ---------------------------------------------------------------------------
do $$
declare
  v_yesterday uuid;
  v_today     uuid;
  v_ancient   uuid;
  v_regular   uuid;
begin
  v_yesterday := a_member('fu-yesterday@test');
  v_today     := a_member('fu-today@test');
  v_ancient   := a_member('fu-ancient@test');
  v_regular   := a_member('fu-regular@test');

  perform attended_ago(v_yesterday, 1);        -- yesterday evening
  perform attended_ago(v_today, 0.1);          -- about 2 hours ago
  perform attended_ago(v_ancient, 30);         -- a month ago
  perform attended_ago(v_regular, 1);          -- first class yesterday...
  perform attended_ago(v_regular, 0.2);        -- ...and another today

  perform assert(
    exists (select 1 from public.due_first_class_follow_ups() where user_id = v_yesterday),
    'somebody whose first class was yesterday is followed up');

  perform assert(
    not exists (select 1 from public.due_first_class_follow_ups() where user_id = v_today),
    'but not somebody who walked out two hours ago');

  perform assert(
    not exists (select 1 from public.due_first_class_follow_ups() where user_id = v_ancient),
    'and not somebody whose first class was a month ago — a backlog must not email about old classes');

  -- The regular's FIRST class is still the one being followed up, and it is in
  -- window, so they appear once with that booking.
  perform assert(
    (select count(*) from public.due_first_class_follow_ups() where user_id = v_regular) = 1,
    'a member appears at most once, keyed on their first class');

  perform assert(
    (select credits_left from public.due_first_class_follow_ups() where user_id = v_yesterday) = 0,
    'the follow-up knows how many credits they have left');
end $$;

-- ---------------------------------------------------------------------------
-- Win-back — MARKETING, so consent is load-bearing
-- ---------------------------------------------------------------------------
do $$
declare
  v_gone        uuid;
  v_gone_noperm uuid;
  v_recent      uuid;
  v_booked      uuid;
  v_session     uuid;
begin
  v_gone        := a_member('wb-gone@test', true);
  v_gone_noperm := a_member('wb-gone-noconsent@test', false);
  v_recent      := a_member('wb-recent@test', true);
  v_booked      := a_member('wb-booked@test', true);

  perform attended_ago(v_gone, 60);
  perform attended_ago(v_gone_noperm, 60);
  perform attended_ago(v_recent, 5);
  perform attended_ago(v_booked, 60);

  perform assert(
    exists (select 1 from public.due_win_backs() where user_id = v_gone),
    'somebody who has not been for two months gets a win-back');

  perform assert(
    not exists (select 1 from public.due_win_backs() where user_id = v_gone_noperm),
    'ACCEPTANCE: somebody without marketing consent does NOT, however long they have been away');

  perform assert(
    not exists (select 1 from public.due_win_backs() where user_id = v_recent),
    'somebody who came last week is not won back');

  -- They have a class booked, so they have not drifted away.
  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id, now() + interval '3 days', now() + interval '3 days 55 minutes', 25, true
  from public.class_types ct, public.venues v, public.instructors i
  where i.slug = 'kelly-brooks' limit 1
  returning id into v_session;
  insert into public.bookings (session_id, user_id, entitlement_kind, status)
  values (v_session, v_booked, 'payment', 'booked');

  perform assert(
    not exists (select 1 from public.due_win_backs() where user_id = v_booked),
    'and neither is somebody with a class already booked — they have not gone anywhere');

  perform assert(
    (select weeks_away from public.due_win_backs() where user_id = v_gone) >= 8,
    'the win-back knows roughly how long it has been');
end $$;

-- ---------------------------------------------------------------------------
-- Review requests — MARKETING
-- ---------------------------------------------------------------------------
do $$
declare v_keen uuid; v_new uuid; v_noperm uuid; i integer;
begin
  v_keen   := a_member('rev-keen@test', true);
  v_new    := a_member('rev-new@test', true);
  v_noperm := a_member('rev-noconsent@test', false);

  for i in 1..4 loop
    perform attended_ago(v_keen, 10 + i);
    perform attended_ago(v_noperm, 10 + i);
  end loop;
  perform attended_ago(v_new, 12);

  perform assert(
    exists (select 1 from public.due_review_requests() where user_id = v_keen),
    'a member with four classes is asked for a review');

  perform assert(
    not exists (select 1 from public.due_review_requests() where user_id = v_new),
    'somebody who has been once is not — they do not know yet');

  perform assert(
    not exists (select 1 from public.due_review_requests() where user_id = v_noperm),
    'and somebody without marketing consent is never asked');

  -- The threshold is a setting, not a number in the query.
  update public.settings set value = '10' where key = 'review_request_after_classes';
  perform assert(
    not exists (select 1 from public.due_review_requests() where user_id = v_keen),
    'raising the threshold setting changes who qualifies, with no code change');
  update public.settings set value = '3' where key = 'review_request_after_classes';
end $$;

-- ---------------------------------------------------------------------------
-- Credit expiry warnings — per lot, and only for credits that still exist
-- ---------------------------------------------------------------------------
do $$
declare
  v_member uuid;
  v_spent  uuid;
  v_lot    uuid;
  v_lot2   uuid;
  v_rows   integer;
begin
  v_member := a_member('exp-member@test');
  v_spent  := a_member('exp-spent@test');

  -- Two packs expiring on different days: two different things to be told.
  v_lot  := public.grant_credits(v_member, 5, 'purchase', now() + interval '3 days');
  v_lot2 := public.grant_credits(v_member, 5, 'purchase', now() + interval '60 days');

  perform assert(
    exists (select 1 from public.due_credit_expiry_warnings() where lot_id = v_lot),
    'a lot expiring in three days produces a warning');

  perform assert(
    not exists (select 1 from public.due_credit_expiry_warnings() where lot_id = v_lot2),
    'a lot expiring in two months does not');

  perform assert(
    (select credits from public.due_credit_expiry_warnings() where lot_id = v_lot) = 5,
    'and the warning names the number of classes in THAT lot, not the whole balance');

  -- A fully spent lot must not be warned about. This is the bug the per-lot
  -- arithmetic exists to avoid: telling somebody five classes are about to expire
  -- when they used them last week.
  v_lot := public.grant_credits(v_spent, 2, 'purchase', now() + interval '3 days');
  -- Named, and WITHOUT p_kind: passing null for it overrides the default rather
  -- than falling back to it, and the column is not nullable.
  perform public.consume_credits(p_user_id => v_spent, p_quantity => 2);

  perform assert(
    not exists (select 1 from public.due_credit_expiry_warnings() where user_id = v_spent),
    'ACCEPTANCE: a lot whose credits have all been used is NOT warned about');

  -- Already expired: too late to be useful, and the nightly expiry job covers it.
  perform assert(
    not exists (
      select 1 from public.due_credit_expiry_warnings() w
      join public.credit_ledger l on l.id = w.lot_id
      where l.expires_at <= now()),
    'an already-expired lot is not warned about');
end $$;

-- ---------------------------------------------------------------------------
-- The notification queue: claim, settle, skip, recover
-- ---------------------------------------------------------------------------
do $$
declare
  v_member uuid;
  v_id     uuid;
  v_again  uuid;
  v_rows   integer;
  v_status text;
begin
  v_member := a_member('queue@test');

  v_id := public.enqueue_notification(
    v_member, 'welcome', '{}'::jsonb, 'member', v_member);
  perform assert(v_id is not null, 'a notification can be enqueued');

  perform assert(
    (select to_email from public.notifications where id = v_id) is not null,
    'and it picks up the member''s email address automatically');

  -- The dedupe index is what stops a daily job emailing the same thing daily.
  v_again := public.enqueue_notification(
    v_member, 'welcome', '{}'::jsonb, 'member', v_member);
  perform assert(v_again is null,
    'enqueuing the same thing twice returns null rather than duplicating it');

  -- Claiming. A large batch deliberately: the booking-email triggers mean earlier
  -- suites have legitimately queued notifications of their own, and a batch of 10
  -- would be filled by those before reaching this row.
  select count(*) into v_rows from public.claim_notifications(200, 'email');
  perform assert(v_rows >= 1, 'a due notification can be claimed');

  select status into v_status from public.notifications where id = v_id;
  perform assert(v_status = 'sending',
    'a claimed row is marked sending, so a second dispatcher cannot take it');

  -- A second claim must not return it again — this is the double-send guard.
  perform assert(
    not exists (select 1 from public.claim_notifications(200, 'email') where id = v_id),
    'ACCEPTANCE: a second claim does not return an already-claimed row');

  perform public.settle_notification(v_id, true, 'msg_123');
  select status into v_status from public.notifications where id = v_id;
  perform assert(v_status = 'sent', 'settling marks it sent');
  perform assert(
    (select provider_message_id = 'msg_123' and sent_at is not null
     from public.notifications where id = v_id),
    'and records the provider message id, so a delivery can be traced');
end $$;

-- Retries, then a permanent failure
do $$
declare v_member uuid; v_id uuid; v_status text; v_attempts integer;
begin
  v_member := a_member('retry@test');
  v_id := public.enqueue_notification(v_member, 'welcome', '{}'::jsonb, 'member', v_member);

  -- Attempt 1 and 2 go back on the queue.
  perform public.claim_notifications(200, 'email');
  perform public.settle_notification(v_id, false, null, 'provider timeout');
  select status into v_status from public.notifications where id = v_id;
  perform assert(v_status = 'queued', 'a first failure goes back on the queue');

  perform assert(
    (select scheduled_for > now() from public.notifications where id = v_id),
    'held off for a few minutes rather than retried instantly');

  -- Bring it forward so the test does not have to wait.
  update public.notifications set scheduled_for = now() - interval '1 minute' where id = v_id;
  perform public.claim_notifications(200, 'email');
  perform public.settle_notification(v_id, false, null, 'provider timeout');

  update public.notifications set scheduled_for = now() - interval '1 minute' where id = v_id;
  perform public.claim_notifications(200, 'email');
  perform public.settle_notification(v_id, false, null, 'provider timeout');

  select status, attempts into v_status, v_attempts from public.notifications where id = v_id;
  perform assert(v_status = 'failed',
    'after three attempts it fails permanently rather than retrying for ever');
  perform assert(v_attempts = 3, 'and the attempt count says how hard it tried');
  perform assert(
    (select error like '%timeout%' from public.notifications where id = v_id),
    'with the provider''s reason kept, so it can be diagnosed');
end $$;

-- Skipping, and recovering a stranded row
do $$
declare v_member uuid; v_id uuid; v_status text;
begin
  v_member := a_member('skip@test', false);
  v_id := public.enqueue_notification(v_member, 'win_back', '{}'::jsonb, 'member', v_member);

  perform public.skip_notification(v_id, 'no marketing consent');
  select status into v_status from public.notifications where id = v_id;
  perform assert(v_status = 'skipped',
    'a decision not to send is recorded as skipped, not as a failure');
  perform assert(
    (select error = 'no marketing consent' from public.notifications where id = v_id),
    'with the reason, so "why did they not get it" is answerable');

  -- A dispatcher killed mid-run.
  v_member := a_member('stranded@test');
  v_id := public.enqueue_notification(v_member, 'welcome', '{}'::jsonb, 'member', v_member);
  perform public.claim_notifications(200, 'email');

  perform assert(public.release_stranded_notifications() = 0,
    'a row claimed a moment ago is NOT released — that would cause the double-send');

  update public.notifications set claimed_at = now() - interval '30 minutes' where id = v_id;
  perform assert(public.release_stranded_notifications() >= 1,
    'but one stuck in sending for half an hour is put back on the queue');

  select status into v_status from public.notifications where id = v_id;
  perform assert(v_status = 'queued', 'and is queued again rather than lost');
end $$;

-- ---------------------------------------------------------------------------
-- Booking emails, driven by triggers
--
-- The point of doing this with triggers is that no caller can forget. These tests
-- insert bookings directly — the crudest possible "caller" — and still expect the
-- email to be queued.
-- ---------------------------------------------------------------------------
do $$
declare
  v_member   uuid;
  v_walkin   uuid;
  v_waiter   uuid;
  v_session  uuid;
  v_booking  uuid;
  v_payload  jsonb;
begin
  v_member := a_member('email-booking@test');
  v_walkin := a_member('email-walkin@test');
  v_waiter := a_member('email-waitlist@test');

  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id, now() + interval '3 days', now() + interval '3 days 55 minutes', 25, true
  from public.class_types ct, public.venues v, public.instructors i
  where i.slug = 'kelly-brooks' limit 1
  returning id into v_session;

  -- A normal booking.
  insert into public.bookings (session_id, user_id, entitlement_kind, status, source)
  values (v_session, v_member, 'payment', 'booked', 'member')
  returning id into v_booking;

  perform assert(
    exists (
      select 1 from public.notifications
      where user_id = v_member and template = 'booking_confirmed' and subject_id = v_booking),
    'a new booking queues a confirmation email, with no caller having to remember');

  select payload into v_payload from public.notifications
    where subject_id = v_booking and template = 'booking_confirmed';

  perform assert(v_payload ->> 'className' is not null, 'the email knows which class');
  perform assert(v_payload ->> 'when' ~ '[0-9]{2}:[0-9]{2}', 'and when, as a UK local time');
  perform assert(v_payload ->> 'venueName' <> '', 'and where');
  perform assert((v_payload ->> 'cancellationHours')::integer = 24,
    'and quotes the cancellation window from settings rather than a hard-coded 24');

  -- A walk-in is standing in the room; an email is noise.
  insert into public.bookings (session_id, user_id, entitlement_kind, status, source)
  values (v_session, v_walkin, 'payment', 'booked', 'walk_in');

  perform assert(
    not exists (
      select 1 from public.notifications
      where user_id = v_walkin and template = 'booking_confirmed'),
    'a walk-in gets no confirmation — they are already there');

  -- A waitlist promotion is a different message.
  insert into public.bookings (session_id, user_id, entitlement_kind, status, source)
  values (v_session, v_waiter, 'payment', 'booked', 'waitlist');

  perform assert(
    exists (
      select 1 from public.notifications
      where user_id = v_waiter and template = 'waitlist_promoted'),
    'a waitlist promotion sends "a space opened up", not "you are booked"');
  perform assert(
    not exists (
      select 1 from public.notifications
      where user_id = v_waiter and template = 'booking_confirmed'),
    'and does not also send the ordinary confirmation');
end $$;

-- Cancellation
do $$
declare
  v_member  uuid;
  v_late    uuid;
  v_session uuid;
  v_booking uuid;
  v_lateb   uuid;
begin
  v_member := a_member('email-cancel@test');
  v_late   := a_member('email-cancel-late@test');

  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id, now() + interval '5 days', now() + interval '5 days 55 minutes', 25, true
  from public.class_types ct, public.venues v, public.instructors i
  where i.slug = 'kelly-brooks' limit 1
  returning id into v_session;

  insert into public.bookings (session_id, user_id, entitlement_kind, status, source)
  values (v_session, v_member, 'payment', 'booked', 'member') returning id into v_booking;
  insert into public.bookings (session_id, user_id, entitlement_kind, status, source)
  values (v_session, v_late, 'payment', 'booked', 'member') returning id into v_lateb;

  update public.bookings set status = 'cancelled_in_window' where id = v_booking;
  update public.bookings set status = 'cancelled_late' where id = v_lateb;

  perform assert(
    (select (payload ->> 'creditReturned')::boolean
     from public.notifications
     where template = 'booking_cancelled' and subject_id = v_booking),
    'an in-window cancellation tells the member their credit came back');

  perform assert(
    not (select (payload ->> 'creditReturned')::boolean
         from public.notifications
         where template = 'booking_cancelled' and subject_id = v_lateb),
    'and a late one tells them it did not — which is the honest version');
end $$;

-- Kelly cancels the whole class
do $$
declare
  v_a       uuid;
  v_b       uuid;
  v_session uuid;
  v_count   integer;
begin
  v_a := a_member('email-classcancel-a@test');
  v_b := a_member('email-classcancel-b@test');

  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id, now() + interval '2 days', now() + interval '2 days 55 minutes', 25, true
  from public.class_types ct, public.venues v, public.instructors i
  where i.slug = 'kelly-brooks' limit 1
  returning id into v_session;

  insert into public.bookings (session_id, user_id, entitlement_kind, status, source)
  values (v_session, v_a, 'payment', 'booked', 'member'), (v_session, v_b, 'payment', 'booked', 'member');

  update public.class_sessions
    set status = 'cancelled', cancelled_at = now(), cancelled_reason = 'Kelly is unwell'
    where id = v_session;

  select count(*) into v_count from public.notifications
    where template = 'class_cancelled' and subject_id = v_session;
  perform assert(v_count = 2, 'cancelling a class emails everybody booked onto it');

  perform assert(
    (select payload ->> 'reason' = 'Kelly is unwell' from public.notifications
     where template = 'class_cancelled' and subject_id = v_session limit 1),
    'and tells them why, which is the whole difference from a bare cancellation');

  -- The bookings are cancelled too, but those must NOT also produce a plain
  -- "booking cancelled" email: two emails about one event is worse than one.
  update public.bookings set status = 'cancelled_in_window' where session_id = v_session;

  perform assert(
    not exists (
      select 1 from public.notifications n
      join public.bookings b on b.id = n.subject_id
      where n.template = 'booking_cancelled' and b.session_id = v_session),
    'ACCEPTANCE: nobody gets both a class-cancelled and a booking-cancelled email');
end $$;

drop function assert(boolean, text);
drop function a_member(text, boolean);
drop function attended_ago(uuid, numeric);
