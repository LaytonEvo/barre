-- =============================================================================
-- RLS enforcement, exercised as a real authenticated role.
--
-- This is the test that matters. Reading policy SQL tells you what was
-- intended; switching to `authenticated`, setting a JWT subject and watching
-- what comes back tells you what is enforced. Groundwork for acceptance test 11.
--
--   psql ... -f tests/db/rls.sql   (after tests/db/run.sh)
-- =============================================================================
\set ON_ERROR_STOP on

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

-- Two members and one admin.
insert into auth.users (id, email) values
  ('dddddddd-0000-4000-8000-00000000000a', 'alice@example.test'),
  ('dddddddd-0000-4000-8000-00000000000b', 'bob@example.test'),
  ('dddddddd-0000-4000-8000-00000000000c', 'kelly@example.test');

insert into public.user_roles (user_id, role)
values ('dddddddd-0000-4000-8000-00000000000c', 'admin');

-- Give each member something private: credits, and a health questionnaire.
insert into public.credit_ledger (user_id, delta, kind, expires_at) values
  ('dddddddd-0000-4000-8000-00000000000a', 5, 'purchase', now() + interval '90 days'),
  ('dddddddd-0000-4000-8000-00000000000b', 9, 'purchase', now() + interval '90 days');

insert into public.health_questionnaires
  (user_id, questionnaire_version, answers, flagged, injuries_text,
   explicit_consent_at, valid_until)
values
  ('dddddddd-0000-4000-8000-00000000000a', 'v1', '{"q1":true}', true,
   'Alice private injury detail', now(), now() + interval '12 months'),
  ('dddddddd-0000-4000-8000-00000000000b', 'v1', '{"q1":false}', false,
   'Bob private injury detail', now(), now() + interval '12 months');

-- Grant table privileges the way Supabase does. RLS filters rows; GRANT decides
-- whether the role may issue the statement at all. Both are needed.
--
-- Note the explicit BEGIN/COMMIT around each persona below: SET LOCAL outside a
-- transaction block silently does nothing, so without them psql would run every
-- check as the superuser and the whole file would pass while testing nothing.
grant select, insert, update on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to authenticated, anon;

-- ---------------------------------------------------------------------------
-- As Alice
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-0000-4000-8000-00000000000a';

-- Guard against the SET LOCAL footgun: if the role did not take, every check
-- below would run as superuser and pass meaninglessly.
select assert(current_user = 'authenticated', 'role switch took effect (not running as superuser)');

select assert(
  (select count(*) from public.profiles) = 1,
  'a member sees only their own profile row');

select assert(
  (select count(*) from public.credit_ledger) = 1,
  'a member sees only their own ledger rows');

select assert(
  (select coalesce(sum(delta), 0) from public.credit_ledger) = 5,
  'a member cannot read another member''s credit balance');

select assert(
  (select count(*) from public.health_questionnaires) = 1,
  'a member sees only their own health questionnaire');

select assert(
  not exists (
    select 1 from public.health_questionnaires
    where injuries_text = 'Bob private injury detail'
  ),
  'ACCEPTANCE TEST 11: a member cannot read another member''s PAR-Q data');

-- Writing someone else's row must fail, not silently no-op.
do $$
begin
  begin
    insert into public.health_questionnaires
      (user_id, questionnaire_version, answers, explicit_consent_at, valid_until)
    values ('dddddddd-0000-4000-8000-00000000000b', 'v1', '{}', now(), now() + interval '1 year');
    raise exception 'FAIL  a member wrote health data against another member''s id';
  exception when insufficient_privilege then
    raise notice 'PASS  a member cannot write health data for someone else';
  end;

  -- The role table is the privilege-escalation route. There is no write policy
  -- at all, so this must be refused.
  begin
    insert into public.user_roles (user_id, role)
    values ('dddddddd-0000-4000-8000-00000000000a', 'admin');
    raise exception 'FAIL  a member granted themselves the admin role';
  exception when insufficient_privilege then
    raise notice 'PASS  a member cannot grant themselves a role';
  end;

  -- Credits are granted by webhooks only.
  begin
    insert into public.credit_ledger (user_id, delta, kind)
    values ('dddddddd-0000-4000-8000-00000000000a', 100, 'purchase');
    raise exception 'FAIL  a member minted their own credits';
  exception when insufficient_privilege then
    raise notice 'PASS  a member cannot write their own credit ledger';
  end;
end $$;

select assert(
  (select count(*) from public.settings where not confirmed) > 0,
  'settings stay readable to members, so policy copy can render');

commit;

-- ---------------------------------------------------------------------------
-- As an anonymous visitor
-- ---------------------------------------------------------------------------
begin;
set local role anon;
set local request.jwt.claim.sub = '';

select assert(current_user = 'anon', 'role switch to anon took effect');

select assert((select count(*) from public.profiles) = 0,
  'anon reads no profiles');

select assert((select count(*) from public.health_questionnaires) = 0,
  'anon reads no health data');

select assert((select count(*) from public.credit_ledger) = 0,
  'anon reads no ledger rows');

select assert((select count(*) from public.bookings) = 0,
  'anon reads no bookings');

select assert((select count(*) from public.venues) > 0,
  'anon can browse venues');

select assert((select count(*) from public.class_sessions) > 0,
  'anon can browse the upcoming timetable');

select assert((select count(*) from public.products) > 0,
  'anon can see prices');

select assert((select count(*) from public.waiver_versions where is_current) = 1,
  'anon can read the waiver before signing up');

commit;

-- ---------------------------------------------------------------------------
-- As Kelly (admin)
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-0000-4000-8000-00000000000c';

select assert(current_user = 'authenticated', 'role switch for the admin took effect');

select assert((select count(*) from public.health_questionnaires) = 2,
  'an admin can see every PAR-Q, which is what the register needs');

select assert((select count(*) from public.profiles) >= 3,
  'an admin can see every member');

select assert(
  exists (select 1 from public.health_questionnaires where flagged),
  'an admin can find flagged questionnaires to review');

commit;

drop function assert(boolean, text);
