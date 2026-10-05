-- =============================================================================
-- M8, part 1: actually sending the queue.
--
-- M1 created `notifications` as a queue and M5 started filling it. Nothing has
-- ever drained it. This adds the claim/settle cycle that lets a dispatcher send
-- without the two failure modes that matter:
--
--   * sending the same email twice, because two cron runs overlapped;
--   * losing an email, because a row was marked sent before it was.
--
-- Both are solved by a middle state. A row is claimed (queued -> sending) in one
-- atomic statement, and only settled (-> sent | failed) once the provider has
-- answered.
-- =============================================================================

-- A claimed-but-not-yet-settled state. `sent` and `failed` already existed; the
-- gap between them was where double-sends lived.
alter type public.notification_status add value if not exists 'sending' after 'queued';

alter table public.notifications
  add column if not exists claimed_at timestamptz;

comment on column public.notifications.claimed_at is
  'When a dispatcher took this row. Used to recover rows stranded in "sending" by a crashed run.';

-- -----------------------------------------------------------------------------
-- claim_notifications(limit, channel)
--
-- `for update skip locked` is the whole trick: two dispatchers running at once
-- take different rows rather than blocking or colliding. Without `skip locked`
-- the second run waits for the first and then re-reads rows it has already
-- claimed.
-- -----------------------------------------------------------------------------
create or replace function public.claim_notifications(
  p_limit   integer default 25,
  p_channel public.notification_channel default 'email'
)
returns table (
  id           uuid,
  user_id      uuid,
  to_email     citext,
  to_phone     text,
  template     text,
  payload      jsonb,
  subject_type text,
  subject_id   uuid,
  attempts     integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimed as (
    update public.notifications n
      set status = 'sending', claimed_at = now(), attempts = n.attempts + 1
      where n.id in (
        select n2.id
        from public.notifications n2
        where n2.status = 'queued'
          and n2.channel = p_channel
          and n2.scheduled_for <= now()
        order by n2.scheduled_for
        limit greatest(1, least(p_limit, 200))
        for update skip locked
      )
      returning n.*
  )
  select c.id, c.user_id, c.to_email, c.to_phone, c.template, c.payload,
         c.subject_type, c.subject_id, c.attempts
  from claimed c;
end;
$$;

-- -----------------------------------------------------------------------------
-- settle_notification(id, sent, provider_message_id, error)
--
-- A failure after 3 attempts stays failed; before that it goes back to the queue.
-- The dedupe index deliberately excludes failed rows, so a genuine retry is
-- possible — which is the reason a permanently failed row must not be left as
-- `queued`, or it would be retried for ever.
-- -----------------------------------------------------------------------------
create or replace function public.settle_notification(
  p_id         uuid,
  p_sent       boolean,
  p_message_id text default null,
  p_error      text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.notifications where id = p_id;
  if not found then
    return;
  end if;

  if p_sent then
    update public.notifications
      set status = 'sent', sent_at = now(), provider_message_id = p_message_id,
          error = null, claimed_at = null
      where id = p_id;
  elsif v_attempts >= 3 then
    update public.notifications
      set status = 'failed', error = left(coalesce(p_error, 'unknown'), 500), claimed_at = null
      where id = p_id;
  else
    -- Back to the queue, held off for a few minutes so a provider blip is not
    -- hammered. Three attempts five minutes apart, then it stops and stays
    -- visible as failed.
    update public.notifications
      set status = 'queued', error = left(coalesce(p_error, 'unknown'), 500),
          claimed_at = null, scheduled_for = now() + interval '5 minutes'
      where id = p_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- skip_notification(id, reason)
--
-- Not a failure: a decision not to send. Marketing to somebody who has not
-- consented is the main one. Recorded rather than deleted, because "why did this
-- member not get the win-back" is a question worth being able to answer.
-- -----------------------------------------------------------------------------
create or replace function public.skip_notification(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.notifications
    set status = 'skipped', error = left(p_reason, 500), claimed_at = null
    where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- release_stranded_notifications()
--
-- A dispatcher that is killed mid-run leaves rows in `sending` for ever. This
-- puts anything stuck there for over 15 minutes back on the queue.
--
-- 15 minutes is comfortably longer than any send could take, so this cannot
-- race a dispatcher that is merely slow and cause the double-send the `sending`
-- state exists to prevent.
-- -----------------------------------------------------------------------------
create or replace function public.release_stranded_notifications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  with released as (
    update public.notifications
      set status = 'queued', claimed_at = null,
          error = 'released after a dispatcher did not finish'
      where status = 'sending'
        and claimed_at < now() - interval '15 minutes'
      returning 1
  )
  select count(*) into v_count from released;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- enqueue_notification(...)
--
-- One way in, so dedupe and defaults are not re-implemented per caller. Returns
-- the row id, or null when the dedupe index refused it — which is a normal
-- outcome, not an error: it means this notification already exists.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_user_id      uuid,
  p_template     text,
  p_payload      jsonb default '{}',
  p_subject_type text default null,
  p_subject_id   uuid default null,
  p_scheduled_for timestamptz default now(),
  p_to_email     citext default null,
  p_channel      public.notification_channel default 'email'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  insert into public.notifications
    (user_id, to_email, template, payload, subject_type, subject_id, scheduled_for, channel)
  values
    (p_user_id,
     coalesce(p_to_email, (select email from public.profiles where id = p_user_id)),
     p_template, p_payload, p_subject_type, p_subject_id, p_scheduled_for, p_channel)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    -- The dedupe index did its job. Already queued or sent; nothing to do.
    return null;
end;
$$;

revoke all on function public.claim_notifications(integer, public.notification_channel)
  from public, anon, authenticated;
revoke all on function public.settle_notification(uuid, boolean, text, text)
  from public, anon, authenticated;
revoke all on function public.skip_notification(uuid, text) from public, anon, authenticated;
revoke all on function public.release_stranded_notifications() from public, anon, authenticated;
revoke all on function public.enqueue_notification(uuid, text, jsonb, text, uuid, timestamptz, citext, public.notification_channel)
  from public, anon, authenticated;
