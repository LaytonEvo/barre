-- =============================================================================
-- Narrowing what an anonymous caller can execute.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default. Each migration
-- here granted deliberately to `authenticated` and revoked from `public` where it
-- remembered to — but "where it remembered to" is the problem, and nineteen
-- SECURITY DEFINER functions were reachable by `anon` as a result.
--
-- None was exploitable: every one checks auth.uid() or a role before doing
-- anything, which is why calling `admin_vouchers` as anon returns `not_allowed`
-- rather than a list of vouchers. But "safe because each function remembers to
-- check" is weaker than "not callable at all", and it holds only until somebody
-- adds one that forgets.
--
-- So: revoke across the schema, then grant back exactly what each caller needs.
--
-- The revoke deliberately SKIPS extension-owned functions (citext, pgcrypto and
-- friends install into public here). Those are not ours to re-permission, and
-- revoking PUBLIC's execute on citext's comparison operators would break every
-- query that touches a citext column.
-- =============================================================================

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      -- Ours, not an extension's.
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon', fn.sig);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Grant back: the two helpers RLS itself depends on.
--
-- RLS policies are evaluated as the querying role, so a policy reading
-- `using (published or public.is_staff())` fails outright for a visitor who
-- cannot execute `is_staff()`. Safe to expose: with no JWT, auth.uid() is null
-- and both return false.
-- -----------------------------------------------------------------------------
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Grant back: what a signed-in member or staff member legitimately calls.
--
-- Listed explicitly, with real signatures, so that adding a function is a
-- decision about who may call it rather than an accident of the default grant.
-- A name that does not resolve raises, so this list cannot rot silently.
-- -----------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'has_role(public.app_role)',
    'setting_int(text, integer)',
    'setting_text(text, text)',
    'credit_balance(uuid)',
    'live_membership(uuid)',

    'book_session(uuid, uuid, public.booking_source)',
    'cancel_booking(uuid, uuid)',
    'join_waitlist(uuid, uuid)',
    'leave_waitlist(uuid, uuid)',

    'export_member_data(uuid)',
    'anonymise_member(uuid, text)',

    'can_watch_videos(uuid)',
    'video_library(text, text, text, text[], boolean, boolean)',
    'continue_watching(integer)',
    'video_playback_grant(uuid)',
    'save_video_progress(uuid, integer, boolean)',
    'toggle_video_favourite(uuid)',

    'redeem_voucher(text)',

    -- Staff-facing. Each checks is_admin/is_staff internally; the grant only
    -- decides who may reach that check.
    'register_for_session(uuid)',
    'admin_today(date)',
    'admin_search_members(text)',
    'admin_adjust_credits(uuid, integer, text)',
    'admin_set_session_capacity(uuid, integer)',
    'admin_set_setting(text, jsonb, boolean)',
    'mark_attendance(uuid, public.booking_status)',
    'cancel_session(uuid, text)',
    'publish_waiver_version(text, text, text)',
    'report_attendance(integer)',
    'report_revenue(integer)',
    'report_at_risk(integer)',
    'report_popular_videos(integer)',
    'admin_create_video_draft(text, text)',
    'admin_update_video(uuid, text, text, text, text, text[], uuid, boolean, text)',
    'admin_set_video_published(uuid, boolean, timestamptz)',
    'admin_videos()',
    'admin_vouchers()'
  ] loop
    begin
      execute format('grant execute on function public.%s to authenticated', fn);
    exception when undefined_function then
      raise exception 'grant-back list names a function that does not exist: %', fn;
    end;
  end loop;
end $$;
