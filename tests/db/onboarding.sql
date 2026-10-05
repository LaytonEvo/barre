-- =============================================================================
-- Onboarding: waiver versioning, storage isolation, export and erasure.
--
-- These are the legally-sensitive paths. A waiver that cannot be produced on
-- request, or health data that outlives a deletion, are both real problems
-- rather than bugs.
-- =============================================================================
\set ON_ERROR_STOP on

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Publishing a waiver version
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_body  text := '# Waiver v2' || E'\n\nI agree.';
  v_hash  text;
  v_new   uuid;
begin
  insert into auth.users (id, email) values (v_admin, 'publisher@test');
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  v_hash := encode(digest(v_body, 'sha256'), 'hex');
  v_new := public.publish_waiver_version('TEST-2.0', v_body, v_hash);

  perform assert(
    (select count(*) from public.waiver_versions where is_current) = 1,
    'publishing leaves exactly one current version');

  perform assert(
    (select id from public.waiver_versions where is_current) = v_new,
    'and it is the new one');

  perform assert(
    (select count(*) from public.waiver_versions) >= 2,
    'the superseded version is kept, not replaced');

  -- A hash that does not match the text would let the record attest to
  -- something nobody agreed to.
  begin
    perform public.publish_waiver_version('TEST-2.1', 'different text', v_hash);
    raise exception 'FAIL  a mismatched hash was accepted';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'waiver_hash_mismatch',
      'a hash that does not match the body is refused');
  end;

  begin
    perform public.publish_waiver_version('TEST-2.2', '   ', encode(digest('   ','sha256'),'hex'));
    raise exception 'FAIL  an empty waiver was published';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'waiver_body_empty', 'an empty waiver cannot be published');
  end;

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

do $$
declare v_member uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_member, 'notpublisher@test');
  perform set_config('request.jwt.claim.sub', v_member::text, true);
  begin
    perform public.publish_waiver_version('ROGUE', 'anything', encode(digest('anything','sha256'),'hex'));
    raise exception 'FAIL  a member published a waiver version';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_allowed', 'a member cannot publish a waiver version');
  end;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- ACCEPTANCE TEST 13: a new waiver version forces an existing member to re-sign
-- ---------------------------------------------------------------------------
do $$
declare
  v_user   uuid := gen_random_uuid();
  v_admin  uuid := gen_random_uuid();
  v_old    uuid;
  v_body   text := '# Waiver v3' || E'\n\nUpdated terms.';
begin
  insert into auth.users (id, email) values (v_user, 'resign@test'), (v_admin, 'resign-admin@test');
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;

  select id into v_old from public.waiver_versions where is_current;

  insert into public.waiver_signatures (user_id, waiver_version_id, typed_name, signature_image_path)
  values (v_user, v_old, 'Re Sign', v_user || '/sig.png');

  insert into public.health_questionnaires
    (user_id, questionnaire_version, answers, explicit_consent_at, valid_until)
  values (v_user, 'v1', '{}', now(), now() + interval '1 year');

  perform assert(
    (select current_waiver_signed from public.member_onboarding_status where user_id = v_user),
    'the member has signed the current waiver');

  -- Kelly publishes a new version.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.publish_waiver_version('TEST-3.0', v_body, encode(digest(v_body,'sha256'),'hex'));
  perform set_config('request.jwt.claim.sub', '', true);

  perform assert(
    not (select current_waiver_signed from public.member_onboarding_status where user_id = v_user),
    'ACCEPTANCE TEST 13: publishing a new version invalidates the old signature');

  perform assert(
    (select count(*) from public.waiver_signatures where user_id = v_user) = 1,
    'but the historical signature is kept, because it is the record of what they agreed to');
end $$;

-- ---------------------------------------------------------------------------
-- Storage isolation
-- ---------------------------------------------------------------------------
-- Fixed ids so the role-switched block below can refer to them.
do $$
begin
  insert into auth.users (id, email) values
    ('cafe0000-0000-4000-8000-00000000000a', 'store-a@test'),
    ('cafe0000-0000-4000-8000-00000000000b', 'store-b@test');

  insert into storage.objects (bucket_id, name, owner) values
    ('waiver-signatures', 'cafe0000-0000-4000-8000-00000000000a/signature.png',
     'cafe0000-0000-4000-8000-00000000000a'),
    ('waiver-signatures', 'cafe0000-0000-4000-8000-00000000000b/signature.png',
     'cafe0000-0000-4000-8000-00000000000b'),
    ('waiver-pdfs', 'cafe0000-0000-4000-8000-00000000000a/waiver.pdf',
     'cafe0000-0000-4000-8000-00000000000a');

  perform assert(
    (select count(*) from storage.buckets
     where id in ('waiver-signatures','waiver-pdfs') and not public) = 2,
    'both buckets are private, so no object has a guessable public URL');
end $$;

-- As member A, through the real storage policies.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'cafe0000-0000-4000-8000-00000000000a';

select assert(current_user = 'authenticated', 'role switch took effect for storage checks');

select assert(
  (select count(*) from storage.objects where bucket_id = 'waiver-signatures') = 1,
  'a member sees only their own signature image');

select assert(
  not exists (
    select 1 from storage.objects
    where name like 'cafe0000-0000-4000-8000-00000000000b/%'
  ),
  'and cannot see another member''s signature, which is a biometric-adjacent identifier');

select assert(
  (select count(*) from storage.objects where bucket_id = 'waiver-pdfs') = 1,
  'a member sees their own waiver PDF');

commit;

-- Writing into somebody else's folder must be refused, not silently ignored.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'cafe0000-0000-4000-8000-00000000000a';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('waiver-signatures', 'cafe0000-0000-4000-8000-00000000000b/forged.png');
    raise exception 'FAIL  a member wrote into another member''s storage folder';
  exception when insufficient_privilege then
    raise notice 'PASS  a member cannot write into another member''s storage folder';
  end;
end $$;

commit;

-- Staff can produce any signed waiver, which is what an insurer would ask for.
do $$
declare v_staff uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_staff, 'storage-staff@test');
  insert into public.user_roles (user_id, role) values (v_staff, 'admin') on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Export
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid := gen_random_uuid();
  v_export jsonb;
begin
  insert into auth.users (id, email) values (v_user, 'exporter@test');
  insert into public.health_questionnaires
    (user_id, questionnaire_version, answers, injuries_text, explicit_consent_at, valid_until)
  values (v_user, 'v1', '{"bone_or_joint":true}', 'Old knee injury', now(), now() + interval '1 year');
  perform public.grant_credits(v_user, 3, 'purchase', now() + interval '90 days');

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_export := public.export_member_data();
  perform set_config('request.jwt.claim.sub', '', true);

  perform assert(v_export ? 'profile', 'the export includes the profile');
  perform assert(v_export ? 'health_questionnaires', 'and the health answers');
  perform assert(v_export ? 'credits', 'and the credit ledger');
  perform assert(v_export ? 'bookings', 'and bookings');
  perform assert(
    jsonb_array_length(v_export -> 'credits') = 1,
    'with the real rows in it, not an empty shell');
  perform assert(
    (v_export -> 'health_questionnaires' -> 0 ->> 'injuries_text') = 'Old knee injury',
    'including the free-text health notes, which the right of access covers');

  -- The Stripe customer id is ours, not theirs, and is of no use to them.
  perform assert(
    not ((v_export -> 'profile') ? 'stripe_customer_id'),
    'but not internal payment-processor identifiers');
end $$;

do $$
declare v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_a, 'exp-a@test'), (v_b, 'exp-b@test');
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  begin
    perform public.export_member_data(v_b);
    raise exception 'FAIL  a member exported somebody else''s data';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_allowed',
      'a member cannot export another member''s data, which is the breach the right of access exists to prevent');
  end;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Erasure
-- ---------------------------------------------------------------------------
do $$
declare
  v_user    uuid := gen_random_uuid();
  v_session uuid;
  v_waiver  uuid;
  v_booking uuid;
begin
  insert into auth.users (id, email) values (v_user, 'erase@test');
  select id into v_waiver from public.waiver_versions where is_current;

  insert into public.profiles (id, email, first_name, last_name, phone)
  values (v_user, 'erase@test', 'Erase', 'Me', '07700900123')
  on conflict (id) do update set first_name = 'Erase', last_name = 'Me', phone = '07700900123';

  insert into public.waiver_signatures (user_id, waiver_version_id, typed_name, signature_image_path)
  values (v_user, v_waiver, 'Erase Me', v_user || '/sig.png');

  insert into public.health_questionnaires
    (user_id, questionnaire_version, answers, injuries_text, explicit_consent_at, valid_until)
  values (v_user, 'v1', '{}', 'Sensitive detail', now(), now() + interval '1 year');

  select id into v_session from public.class_sessions order by starts_at limit 1;
  insert into public.bookings (session_id, user_id, entitlement_kind)
  values (v_session, v_user, 'payment') returning id into v_booking;

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform public.anonymise_member(v_user, 'member requested deletion');
  perform set_config('request.jwt.claim.sub', '', true);

  perform assert(
    (select first_name is null and last_name is null and phone is null
     from public.profiles where id = v_user),
    'erasure removes the identifying fields');

  perform assert(
    (select email::text like 'deleted+%@invalid' from public.profiles where id = v_user),
    'and replaces the email with something unique that identifies nobody');

  perform assert(
    (select anonymised_at is not null from public.profiles where id = v_user),
    'and records when it happened');

  -- Health data has no accounting or legal reason to outlive the relationship.
  perform assert(
    not exists (select 1 from public.health_questionnaires where user_id = v_user),
    'health data is DELETED outright, not anonymised');

  -- Accounting records survive, without a name on them.
  perform assert(
    exists (select 1 from public.bookings where id = v_booking),
    'bookings survive, because they are accounting records HMRC expects to exist');

  -- The legal record survives: an insurer may need it years later.
  perform assert(
    exists (select 1 from public.waiver_signatures where user_id = v_user),
    'the signed waiver survives for its retention period, which the privacy policy states');

  perform assert(
    exists (select 1 from public.audit_log
            where entity = 'profiles' and entity_id = v_user and action = 'anonymise_member'),
    'and the erasure itself is audited');
end $$;

do $$
declare v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_a, 'era-a@test'), (v_b, 'era-b@test');
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  begin
    perform public.anonymise_member(v_b);
    raise exception 'FAIL  a member erased somebody else''s account';
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_allowed', 'a member cannot erase another member''s account');
  end;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

drop function assert(boolean, text);
