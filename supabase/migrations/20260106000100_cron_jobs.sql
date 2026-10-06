-- =============================================================================
-- Scheduled jobs.
--
-- Six endpoints need a trigger. Until now they were only ever *documented* — the
-- README showed an example `cron.schedule(...)` and nothing ran it, so on a fresh
-- database none of them existed. The site looked complete and the whole
-- automation layer sat inert: no email left the queue, no reminders, no
-- vouchers, and the rolling timetable would simply run out.
--
-- They are scheduled here instead of by hand so that every environment gets them
-- from the same source, and a new one cannot be stood up without them.
--
-- The URL and the shared secret differ per environment, so they cannot live in
-- this file. They go in `private.cron_config`, written at deploy time by
-- `private.configure_cron(...)`, which the migration runner calls with the
-- values from the environment. Jobs read that row at run time, which means the
-- secret never appears in `cron.job.command` and the site can move to a real
-- domain without rescheduling anything.
-- =============================================================================

-- Guarded: a database without these should fail when something tries to *use*
-- them, not halt the entire migration chain on the way in.
do $$
begin
  execute 'create extension if not exists pg_cron';
exception when others then
  raise notice 'pg_cron not available here (%) — scheduling will raise if attempted.', sqlerrm;
end $$;

do $$
begin
  execute 'create extension if not exists pg_net';
exception when others then
  raise notice 'pg_net not available here (%) — scheduling will raise if attempted.', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- A schema PostgREST does not expose.
--
-- `public` is reachable over the API; this is not. The cron secret lives here
-- and must stay unreachable by `anon` and `authenticated` whatever happens to
-- the policies in `public`.
-- -----------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists private.cron_config (
  -- Single row, enforced by the primary key: there is one deployment per
  -- database, so two rows could only ever mean a half-applied change.
  id          boolean primary key default true check (id),
  base_url    text not null,
  cron_secret text not null,
  updated_at  timestamptz not null default now()
);

alter table private.cron_config enable row level security;
revoke all on private.cron_config from public;
revoke all on private.cron_config from anon, authenticated;

comment on table private.cron_config is
  'Deploy-time configuration for the scheduled jobs. Holds the cron shared secret, so it lives outside `public` and grants nothing to anon or authenticated. No RLS policy exists on purpose: nothing but the owner should ever read it.';

-- -----------------------------------------------------------------------------
-- One POST, authenticated the way the routes expect.
--
-- Every job is a call to this. Keeping the body here rather than in each job
-- definition means the secret is not stored in `cron.job`, and a change of
-- domain is an UPDATE rather than six reschedules.
-- -----------------------------------------------------------------------------
create or replace function private.cron_post(p_path text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_cfg private.cron_config;
  v_request_id bigint;
begin
  select * into v_cfg from private.cron_config limit 1;

  if v_cfg is null then
    raise warning 'cron_post(%): no configuration row — has configure_cron run?', p_path;
    return null;
  end if;

  -- The routes are POST-only and take the secret as a header. They accept
  -- `authorization: Bearer` too, but a bare header keeps it out of any proxy log
  -- that records auth attempts.
  select net.http_post(
    url                  := v_cfg.base_url || p_path,
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'content-type', 'application/json',
                              'x-cron-secret', v_cfg.cron_secret
                            ),
    -- pg_net is asynchronous: this is how long it waits for the reply, not a
    -- limit on the work. Draining a large email queue can outlast the 5s
    -- default, and a timed-out reply would be recorded as a failure for a run
    -- that actually succeeded.
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;

comment on function private.cron_post(text) is
  'POSTs to one of the /api/cron routes with the shared secret from private.cron_config. Every scheduled job is a call to this.';

-- -----------------------------------------------------------------------------
-- Schedule, or re-schedule, the lot.
--
-- Idempotent: pg_cron 1.4+ treats `cron.schedule` as an upsert on the job name,
-- so running this on every deploy converges rather than accumulating duplicates.
--
-- Times are UTC, which is what pg_cron uses. Through British Summer Time the
-- clock-face jobs land an hour later in local terms (09:00 here is 10:00 for
-- Kelly). That is deliberate: none of them is time-critical to the minute, and
-- chasing the offset would mean rescheduling twice a year, which is exactly the
-- sort of manual step this file exists to remove.
-- -----------------------------------------------------------------------------
create or replace function private.configure_cron(p_base_url text, p_cron_secret text)
returns table (job_name text, schedule text)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  -- to_regprocedure, not to_regproc: cron.schedule is overloaded (two- and
  -- three-argument forms) and to_regproc returns null for an ambiguous name,
  -- which would report pg_cron as missing on a database that has it.
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception
      'pg_cron is not installed, so the scheduled jobs cannot be created. '
      'Enable it on the database before deploying, or the site will send no '
      'email and generate no sessions.';
  end if;

  if coalesce(p_base_url, '') = '' or coalesce(p_cron_secret, '') = '' then
    raise exception 'configure_cron needs both a base URL and a cron secret.';
  end if;

  insert into private.cron_config (id, base_url, cron_secret)
  values (true, rtrim(p_base_url, '/'), p_cron_secret)
  on conflict (id) do update
    set base_url   = excluded.base_url,
        cron_secret = excluded.cron_secret,
        updated_at = now();

  -- The only time-sensitive one. A booking confirmation that arrives an hour
  -- late is worse than useless: the member has already emailed Kelly to ask
  -- whether it worked.
  perform cron.schedule('barre-send-email', '*/5 * * * *',
    $cmd$select private.cron_post('/api/cron/send-email')$cmd$);

  perform cron.schedule('barre-queue-reminders', '*/30 * * * *',
    $cmd$select private.cron_post('/api/cron/queue-reminders')$cmd$);

  perform cron.schedule('barre-send-vouchers', '0 * * * *',
    $cmd$select private.cron_post('/api/cron/send-vouchers')$cmd$);

  perform cron.schedule('barre-attendance', '0 2 * * *',
    $cmd$select private.cron_post('/api/cron/attendance')$cmd$);

  perform cron.schedule('barre-expire-credits', '30 2 * * *',
    $cmd$select private.cron_post('/api/cron/expire-credits')$cmd$);

  -- Deliberately unhurried, and deliberately in the morning: this one queues
  -- marketing-ish mail, and nothing should land at 3am.
  perform cron.schedule('barre-automations', '0 9 * * *',
    $cmd$select private.cron_post('/api/cron/automations')$cmd$);

  -- Keeps the rolling timetable topped up. Without it the site runs out of
  -- classes at the end of the generated window and quietly shows nothing.
  perform cron.schedule('barre-generate-sessions', '15 3 * * *',
    $cmd$select public.generate_class_sessions()$cmd$);

  return query
    select j.jobname::text, j.schedule::text
    from cron.job j
    where j.jobname like 'barre-%'
    order by j.jobname;
end;
$$;

comment on function private.configure_cron(text, text) is
  'Writes the deploy configuration and (re)schedules every job. Idempotent. Called by scripts/apply-migrations.mjs after the migrations, with the URL and secret from the environment.';
