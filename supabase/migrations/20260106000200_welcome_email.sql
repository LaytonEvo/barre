-- =============================================================================
-- The welcome email.
--
-- The template has existed since M4: written, registered, schema'd and covered
-- by tests. Nothing ever enqueued it. `'welcome'` appeared exactly once outside
-- the registry — in tests/db/automations.sql — so every member who ever signed
-- up got silence, and the omission was invisible from the application because
-- the queue simply stayed empty.
--
-- Enqueued from a trigger on `profiles` rather than from the signup action,
-- for the same reason the booking emails are: a member can arrive through the
-- password form, a magic link, an OAuth provider or an admin creating them by
-- hand, and only one of those paths goes through the signup action. The row
-- appearing is what "someone joined" actually means.
-- =============================================================================

create or replace function public.tg_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.enqueue_notification(
    p_user_id      => new.id,
    p_template     => 'welcome',
    -- strip_nulls because the template's schema has firstName optional, and
    -- optional means absent: a null would fail validation and the row would sit
    -- in the queue failing forever. Someone who signed up without giving a name
    -- gets "Welcome" instead of "Welcome, null".
    p_payload      => jsonb_strip_nulls(jsonb_build_object('firstName', new.first_name)),
    -- Dedupe key. One welcome per member for the life of the account, enforced
    -- by the index rather than by remembering to check.
    p_subject_type => 'member',
    p_subject_id   => new.id);

  return null;
end;
$$;

comment on function public.tg_welcome_email() is
  'Queues the welcome email when a profile is created. Deduped on (member, id), so it can only ever send once per member.';

drop trigger if exists tg_profiles_welcome_email on public.profiles;

create trigger tg_profiles_welcome_email
  after insert on public.profiles
  for each row execute function public.tg_welcome_email();

revoke all on function public.tg_welcome_email() from public, anon, authenticated;
