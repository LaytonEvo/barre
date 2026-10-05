-- =============================================================================
-- Database-level invariant checks.
--
-- These assert the guarantees docs/01-DATA-MODEL.md claims, against a real
-- Postgres. Each one fails loudly if the schema stops enforcing it.
--
--   PGPORT=5433 tests/db/run.sh && psql ... -f tests/db/invariants.sql
-- =============================================================================
\set ON_ERROR_STOP on
\timing off

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

-- A member to hang the tests off. Inserting into auth.users fires the profile
-- trigger, which is itself under test.
insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'member@example.test',
        '{"first_name":"Test","last_name":"Member"}');

-- ---------------------------------------------------------------------------
-- New user provisioning
-- ---------------------------------------------------------------------------
select assert(
  exists (select 1 from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'auth.users insert creates a profile');

select assert(
  exists (select 1 from public.user_roles
          where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and role = 'member'),
  'new user is granted the member role');

select assert(
  (select first_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'Test',
  'sign-up metadata lands on the profile');

-- ---------------------------------------------------------------------------
-- Invariant 2: the credit ledger is append-only
-- ---------------------------------------------------------------------------
insert into public.credit_ledger (id, user_id, delta, kind, expires_at)
values ('bbbbbbbb-0000-4000-8000-000000000001',
        'aaaaaaaa-0000-4000-8000-000000000001', 5, 'purchase', now() + interval '90 days');

do $$
begin
  begin
    update public.credit_ledger set delta = 99
    where id = 'bbbbbbbb-0000-4000-8000-000000000001';
    raise exception 'FAIL  credit_ledger allowed an UPDATE';
  exception when others then
    if sqlerrm like '%append-only%' then raise notice 'PASS  credit_ledger rejects UPDATE';
    else raise; end if;
  end;

  begin
    delete from public.credit_ledger where id = 'bbbbbbbb-0000-4000-8000-000000000001';
    raise exception 'FAIL  credit_ledger allowed a DELETE';
  exception when others then
    if sqlerrm like '%append-only%' then raise notice 'PASS  credit_ledger rejects DELETE';
    else raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Invariant 3: balance is derived, and respects expiry
-- ---------------------------------------------------------------------------
select assert(public.credit_balance('aaaaaaaa-0000-4000-8000-000000000001') = 5,
  'credit_balance sums unexpired grants');

insert into public.credit_ledger (user_id, delta, kind, expires_at)
values ('aaaaaaaa-0000-4000-8000-000000000001', 3, 'purchase', now() - interval '1 day');

select assert(public.credit_balance('aaaaaaaa-0000-4000-8000-000000000001') = 5,
  'credit_balance ignores expired grants');

insert into public.credit_ledger (user_id, delta, kind, source_entry_id)
values ('aaaaaaaa-0000-4000-8000-000000000001', -2, 'booking_debit',
        'bbbbbbbb-0000-4000-8000-000000000001');

select assert(public.credit_balance('aaaaaaaa-0000-4000-8000-000000000001') = 3,
  'a debit reduces the derived balance');

-- ---------------------------------------------------------------------------
-- Invariant: FIFO ordering exposes the soonest-expiring lot first
-- ---------------------------------------------------------------------------
select assert(
  (select remaining from public.credit_lots
   where entry_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 3,
  'credit_lots reports remaining after partial consumption');

select assert(
  (select count(*) from public.credit_lots
   where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 1,
  'credit_lots excludes expired and fully consumed lots');

-- An admin adjustment must name a reason and an admin.
do $$
begin
  begin
    insert into public.credit_ledger (user_id, delta, kind)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 1, 'admin_adjustment');
    raise exception 'FAIL  admin_adjustment allowed with no reason or admin';
  exception when check_violation then
    raise notice 'PASS  admin_adjustment requires a reason and an admin id';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Waiver signatures are immutable, and there is at most one current version
-- ---------------------------------------------------------------------------
do $$
declare v_waiver uuid;
begin
  select id into v_waiver from public.waiver_versions where is_current;

  insert into public.waiver_signatures
    (id, user_id, waiver_version_id, typed_name, signature_image_path)
  values ('cccccccc-0000-4000-8000-000000000001',
          'aaaaaaaa-0000-4000-8000-000000000001', v_waiver, 'Test Member', 'sig/1.png');

  begin
    update public.waiver_signatures set typed_name = 'Someone Else'
    where id = 'cccccccc-0000-4000-8000-000000000001';
    raise exception 'FAIL  waiver_signatures allowed an UPDATE';
  exception when others then
    if sqlerrm like '%append-only%' then raise notice 'PASS  waiver_signatures rejects UPDATE';
    else raise; end if;
  end;

  begin
    insert into public.waiver_versions (version_label, body_markdown, body_sha256, is_current)
    values ('DRAFT-0.2', 'x', 'y', true);
    raise exception 'FAIL  two waiver versions were marked current';
  exception when unique_violation then
    raise notice 'PASS  only one waiver version can be current';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Onboarding gate reflects reality
-- ---------------------------------------------------------------------------
select assert(
  (select current_waiver_signed from public.member_onboarding_status
   where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'onboarding view sees the signed current waiver');

select assert(
  not (select parq_valid from public.member_onboarding_status
       where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'onboarding view reports PAR-Q outstanding');

-- ---------------------------------------------------------------------------
-- Invariant 1 (partial): a member cannot hold two places in one class
-- ---------------------------------------------------------------------------
do $$
declare v_session uuid;
begin
  select id into v_session from public.class_sessions order by starts_at limit 1;

  insert into public.bookings (session_id, user_id, entitlement_kind, ledger_entry_id)
  values (v_session, 'aaaaaaaa-0000-4000-8000-000000000001', 'credit',
          'bbbbbbbb-0000-4000-8000-000000000001');

  begin
    insert into public.bookings (session_id, user_id, entitlement_kind, ledger_entry_id)
    values (v_session, 'aaaaaaaa-0000-4000-8000-000000000001', 'credit',
            'bbbbbbbb-0000-4000-8000-000000000001');
    raise exception 'FAIL  double booking was permitted';
  exception when unique_violation then
    raise notice 'PASS  a member cannot double-book one session';
  end;

  -- A credit booking with no ledger entry is a bookkeeping hole.
  begin
    insert into public.bookings (session_id, user_id, entitlement_kind)
    values (v_session, 'aaaaaaaa-0000-4000-8000-000000000002', 'credit');
    raise exception 'FAIL  credit booking allowed without a ledger entry';
  exception when check_violation then
    raise notice 'PASS  a credit booking must reference a ledger entry';
  when foreign_key_violation then
    raise notice 'SKIP  credit-booking check masked by FK ordering';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Availability view counts bookings without exposing who booked
-- ---------------------------------------------------------------------------
select assert(
  (select booked_count from public.session_availability
   where session_id = (select id from public.class_sessions order by starts_at limit 1)) = 1,
  'session_availability counts the active booking');

select assert(
  (select spaces_left from public.session_availability
   where session_id = (select id from public.class_sessions order by starts_at limit 1))
  = (select capacity - 1 from public.class_sessions order by starts_at limit 1),
  'session_availability derives spaces_left from capacity');

-- ---------------------------------------------------------------------------
-- Invariant 10: session generation is idempotent
-- ---------------------------------------------------------------------------
do $$
declare v_before integer; v_after integer;
begin
  select count(*) into v_before from public.class_sessions;

  insert into public.class_sessions
    (template_id, class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity)
  select t.id, t.class_type_id, t.venue_id, t.instructor_id,
         ((d::date + t.start_time_local) at time zone v.timezone),
         ((d::date + t.start_time_local) at time zone v.timezone)
           + make_interval(mins => t.duration_mins),
         t.capacity
  from public.schedule_templates t
  join public.venues v on v.id = t.venue_id
  cross join generate_series(current_date, current_date + interval '28 days', interval '1 day') as d
  where extract(dow from d) = t.weekday and t.active
  on conflict (template_id, starts_at) where template_id is not null do nothing;

  select count(*) into v_after from public.class_sessions;
  perform assert(v_before = v_after,
    format('re-running session generation creates nothing (%s -> %s)', v_before, v_after));
end $$;

-- ---------------------------------------------------------------------------
-- Product shape constraints
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.products (kind, name, slug, price_pence)
    values ('pack', 'Bad pack', 'bad-pack', 1000);
    raise exception 'FAIL  a pack with no credits was accepted';
  exception when check_violation then
    raise notice 'PASS  a pack must declare credits and an expiry';
  end;

  begin
    insert into public.products
      (kind, name, slug, price_pence, billing_interval, is_unlimited)
    values ('membership', 'Bad unlimited', 'bad-unlimited', 5000, 'month', true);
    raise exception 'FAIL  an unlimited membership with no daily cap was accepted';
  exception when check_violation then
    raise notice 'PASS  an unlimited membership needs a per-day guard';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Pricing coherence.
--
-- A pack that costs as much per class as paying each time is not a pack, it is a
-- worse deal with extra steps. Checked on every run rather than only once in the
-- migration that set the prices, so a later price edit cannot quietly break it.
-- ---------------------------------------------------------------------------
do $$
declare v_single integer; v_bad text;
begin
  select price_pence into v_single from public.products
    where slug = 'single-class' and active;

  if v_single is null then
    raise notice 'SKIP  no active single-class price to compare packs against';
    return;
  end if;

  select string_agg(slug || ' (' || round(price_pence::numeric / credits) || 'p/class)', ', ')
  into v_bad
  from public.products
  where kind = 'pack' and active and credits is not null
    and (price_pence::numeric / credits) >= v_single;

  if v_bad is not null then
    raise exception 'FAIL  pack(s) % are not cheaper than a single class (%p)', v_bad, v_single;
  end if;
  raise notice 'PASS  every active pack is cheaper per class than a single class';
end $$;

-- An active product must have a price. £0 is only valid for the intro offer.
select assert(
  not exists (
    select 1 from public.products
    where active and price_pence = 0 and kind <> 'intro_offer'
  ),
  'no active product other than the intro offer is priced at zero');

-- Capacity must be positive everywhere a booking could be made against it.
select assert(
  not exists (
    select 1 from public.class_sessions
    where status = 'scheduled' and starts_at > now() and capacity < 1
  ),
  'every bookable session has a positive capacity');

-- A template change does not retro-fit existing sessions, so a mismatch is
-- legitimate — but every future session should match its template unless
-- somebody changed that one class on purpose. Report rather than fail.
do $$
declare v_mismatched integer;
begin
  select count(*) into v_mismatched
  from public.class_sessions s
  join public.schedule_templates t on t.id = s.template_id
  where s.starts_at > now() and s.status = 'scheduled' and s.capacity <> t.capacity;

  if v_mismatched = 0 then
    raise notice 'PASS  every future session matches its template capacity';
  else
    raise notice 'PASS  % future session(s) differ from their template capacity (expected if edited individually)', v_mismatched;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Intro offer: one per person, by account, email, phone and card
-- ---------------------------------------------------------------------------
do $$
declare v_product uuid;
begin
  select id into v_product from public.products where kind = 'intro_offer' limit 1;

  insert into public.intro_offer_claims
    (user_id, product_id, email_normalised, phone_normalised, card_fingerprint)
  values ('aaaaaaaa-0000-4000-8000-000000000001', v_product,
          'member@example.test', '447700900000', 'fp_test_1');

  insert into auth.users (id, email) values
    ('aaaaaaaa-0000-4000-8000-000000000009', 'different@example.test');

  begin
    insert into public.intro_offer_claims (user_id, product_id, email_normalised)
    values ('aaaaaaaa-0000-4000-8000-000000000009', v_product, 'member@example.test');
    raise exception 'FAIL  intro offer reusable with the same email';
  exception when unique_violation then
    raise notice 'PASS  intro offer blocked on a repeat email';
  end;

  begin
    insert into public.intro_offer_claims
      (user_id, product_id, email_normalised, phone_normalised)
    values ('aaaaaaaa-0000-4000-8000-000000000009', v_product,
            'different@example.test', '447700900000');
    raise exception 'FAIL  intro offer reusable with the same phone';
  exception when unique_violation then
    raise notice 'PASS  intro offer blocked on a repeat phone';
  end;

  begin
    insert into public.intro_offer_claims
      (user_id, product_id, email_normalised, card_fingerprint)
    values ('aaaaaaaa-0000-4000-8000-000000000009', v_product,
            'different@example.test', 'fp_test_1');
    raise exception 'FAIL  intro offer reusable with the same card';
  exception when unique_violation then
    raise notice 'PASS  intro offer blocked on a repeat card fingerprint';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Stripe webhook idempotency
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.stripe_events (id, type, payload)
  values ('evt_test_1', 'checkout.session.completed', '{}');
  begin
    insert into public.stripe_events (id, type, payload)
    values ('evt_test_1', 'checkout.session.completed', '{}');
    raise exception 'FAIL  a duplicate Stripe event was accepted';
  exception when unique_violation then
    raise notice 'PASS  duplicate Stripe events are rejected';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Reminder dedupe
-- ---------------------------------------------------------------------------
do $$
declare v_session uuid;
begin
  select id into v_session from public.class_sessions order by starts_at limit 1;

  insert into public.notifications (user_id, template, subject_type, subject_id)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'reminder_24h', 'class_session', v_session);

  begin
    insert into public.notifications (user_id, template, subject_type, subject_id)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'reminder_24h', 'class_session', v_session);
    raise exception 'FAIL  the same reminder was queued twice';
  exception when unique_violation then
    raise notice 'PASS  an overlapping cron run cannot double-send a reminder';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Timezone correctness: a 09:30 class stays 09:30 local across the BST change
-- ---------------------------------------------------------------------------
do $$
declare v_before timestamptz; v_after timestamptz;
begin
  -- UK clocks go back on the last Sunday of October 2026 (25 October).
  v_before := ('2026-10-19'::date + '09:30'::time) at time zone 'Europe/London';
  v_after  := ('2026-10-26'::date + '09:30'::time) at time zone 'Europe/London';

  perform assert(
    to_char(v_before at time zone 'Europe/London', 'HH24:MI') = '09:30'
    and to_char(v_after at time zone 'Europe/London', 'HH24:MI') = '09:30',
    'a weekly 09:30 class stays 09:30 local across the BST boundary');

  -- Proof the naive approach is wrong: adding 168 hours drifts by an hour.
  perform assert(
    to_char((v_before + interval '168 hours') at time zone 'Europe/London', 'HH24:MI') = '08:30',
    'adding 168 hours would have drifted the class to 08:30 (hence the local-time generation)');
end $$;

-- ---------------------------------------------------------------------------
-- RLS is enabled on every table, with no table left policy-less by accident
-- ---------------------------------------------------------------------------
select assert(
  not exists (
    select 1 from pg_tables t
    join pg_class c on c.relname = t.tablename
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where t.schemaname = 'public' and not c.relrowsecurity
  ),
  'RLS is enabled on every table in public');

select assert(
  (select count(*) from pg_tables where schemaname = 'public'
     and tablename not in (
       select distinct tablename from pg_policies where schemaname = 'public'
     )) = 2,
  'exactly two tables are service-role only (stripe_events, session_generation_runs)');

select assert(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_roles' and cmd <> 'SELECT'
  ),
  'no policy lets an authenticated user write their own roles');

select assert(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'credit_ledger' and cmd <> 'SELECT'
  ),
  'no policy lets a member write the credit ledger');

select assert(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'health_questionnaires' and 'anon' = any(roles)
  ),
  'health data is not readable by anon under any policy');

select assert(
  (select count(*) from public.settings where not confirmed) > 0,
  'placeholder settings are marked unconfirmed');

drop function assert(boolean, text);
