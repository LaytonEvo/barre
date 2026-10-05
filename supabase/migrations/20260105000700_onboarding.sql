-- =============================================================================
-- Onboarding: private storage for signatures and waiver PDFs, plus waiver
-- version publishing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Private buckets.
--
-- `public = false`, so there is no guessable URL: every read goes through a
-- short-lived signed URL minted server-side after an authorisation check. A
-- signature image is a biometric-adjacent identifier and a waiver PDF names
-- somebody and records their IP address — neither belongs behind a URL that
-- leaks by being shared.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('waiver-signatures', 'waiver-signatures', false, 524288, array['image/png']),
  ('waiver-pdfs',       'waiver-pdfs',       false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- Objects are stored at `<user_id>/<filename>`, so the first path segment is
-- the owner and RLS can compare it to auth.uid() without a lookup.
create policy "members read their own signature"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'waiver-signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "members write their own signature"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'waiver-signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "members read their own waiver pdf"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'waiver-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "members write their own waiver pdf"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'waiver-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Staff read everything in both buckets: Kelly needs to produce a signed waiver
-- if an insurer ever asks for one. Note there is no UPDATE or DELETE policy for
-- anyone — these files are evidence, and the signatures table they belong to is
-- append-only for the same reason.
create policy "staff read every signature"
  on storage.objects for select to authenticated
  using (bucket_id in ('waiver-signatures', 'waiver-pdfs') and public.is_staff());

-- =============================================================================
-- Publishing a waiver version.
--
-- Publishing is what makes a version signable, and it is the act that forces
-- every member to re-sign — the booking gate asks for a signature against the
-- CURRENT version, so flipping is_current invalidates everyone at once.
-- =============================================================================
create or replace function public.publish_waiver_version(
  p_version_label text,
  p_body_markdown text,
  p_body_sha256   text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_body_markdown), '') = '' then
    raise exception 'waiver_body_empty' using errcode = 'P0001';
  end if;

  -- The hash is computed by the caller and verified here, so a mismatch between
  -- the text being stored and the hash recorded against it is impossible.
  if encode(digest(p_body_markdown, 'sha256'), 'hex') <> p_body_sha256 then
    raise exception 'waiver_hash_mismatch' using errcode = 'P0001';
  end if;

  -- Stand the current version down first: the partial unique index allows only
  -- one is_current, and doing this in the same transaction means there is never
  -- a moment with none.
  update public.waiver_versions set is_current = false where is_current;

  insert into public.waiver_versions
    (version_label, body_markdown, body_sha256, is_current, published_at, published_by)
  values
    (p_version_label, p_body_markdown, p_body_sha256, true, now(), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.publish_waiver_version is
  'Publishing forces every member to re-sign, because the booking gate asks for a signature against the current version. Historical signatures are kept.';

revoke all on function public.publish_waiver_version(text, text, text) from public, anon;
grant execute on function public.publish_waiver_version(text, text, text) to authenticated;

-- =============================================================================
-- Data export and erasure (UK GDPR rights).
-- =============================================================================

/**
 * Everything we hold about one member, as a single JSON document.
 *
 * security_invoker is deliberately NOT used: this runs as definer so it can
 * assemble the whole picture, and it checks that the caller is the subject (or
 * an admin) itself. A member exporting somebody else's data would be the exact
 * breach the right of access exists to prevent.
 */
create or replace function public.export_member_data(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if v_user <> coalesce(auth.uid(), v_user) and not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'profile', (
      select to_jsonb(p) - 'stripe_customer_id'
      from public.profiles p where p.id = v_user
    ),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(b)) from public.bookings b where b.user_id = v_user
    ), '[]'::jsonb),
    'waitlist', coalesce((
      select jsonb_agg(to_jsonb(w)) from public.waitlist_entries w where w.user_id = v_user
    ), '[]'::jsonb),
    'credits', coalesce((
      select jsonb_agg(to_jsonb(l)) from public.credit_ledger l where l.user_id = v_user
    ), '[]'::jsonb),
    'purchases', coalesce((
      select jsonb_agg(to_jsonb(pu)) from public.purchases pu where pu.user_id = v_user
    ), '[]'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(to_jsonb(m)) from public.memberships m where m.user_id = v_user
    ), '[]'::jsonb),
    'waiver_signatures', coalesce((
      select jsonb_agg(to_jsonb(ws)) from public.waiver_signatures ws where ws.user_id = v_user
    ), '[]'::jsonb),
    'health_questionnaires', coalesce((
      select jsonb_agg(to_jsonb(hq)) from public.health_questionnaires hq where hq.user_id = v_user
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n)) from public.notifications n where n.user_id = v_user
    ), '[]'::jsonb)
  );
end;
$$;

/**
 * Erasure.
 *
 * Anonymises rather than deletes, and the distinction is deliberate:
 *
 *   - Bookings and purchases survive, without a name attached. They are
 *     accounting records, and HMRC expects them to exist.
 *   - Waiver signatures survive untouched. They are the legal record of what
 *     somebody agreed to, and an insurer may need them years later. The
 *     retention period is stated in the privacy policy.
 *   - Health answers are DELETED outright. Special category data has no
 *     accounting or legal reason to outlive the relationship.
 *
 * The auth user is left for the caller to delete, because that is the Supabase
 * admin API rather than SQL.
 */
create or replace function public.anonymise_member(p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := coalesce(p_user_id, auth.uid());
begin
  if v_user <> coalesce(auth.uid(), v_user) and not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- Health data goes entirely.
  delete from public.health_questionnaires where user_id = v_user;

  -- Queued messages are pointless and would be sent to a stranger.
  delete from public.notifications where user_id = v_user and sent_at is null;

  update public.profiles set
    first_name = null,
    last_name = null,
    -- The email must stay unique and must not identify anyone.
    email = ('deleted+' || v_user::text || '@invalid')::citext,
    phone = null,
    phone_normalised = null,
    date_of_birth = null,
    emergency_contact_name = null,
    emergency_contact_phone = null,
    marketing_consent = false,
    marketing_consent_at = null,
    notify_email = false,
    notify_sms = false,
    anonymised_at = now()
  where id = v_user;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'anonymise_member', 'profiles', v_user,
          jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.export_member_data(uuid) from public, anon;
revoke all on function public.anonymise_member(uuid, text) from public, anon;
grant execute on function public.export_member_data(uuid) to authenticated;
grant execute on function public.anonymise_member(uuid, text) to authenticated;
