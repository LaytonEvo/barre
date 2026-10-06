-- =============================================================================
-- Scheduled jobs.
--
-- The point of these assertions is that the jobs exist at all. They were
-- documented for several milestones and never actually scheduled, which is
-- invisible from the application: the site renders perfectly while no email
-- leaves the queue and the timetable silently runs out. A test is the only
-- thing that notices.
--
-- Also pins the thing that makes the design safe — the cron shared secret is
-- reachable by nobody but the owner, and never lands in cron.job.command where
-- anyone able to read the job list would see it.
--
--   psql ... -f tests/db/cron.sql   (after tests/db/run.sh)
-- =============================================================================
\set ON_ERROR_STOP on

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

-- --- Reachability, which holds with or without pg_cron ------------------------
-- A bare Postgres has no pg_cron, but it does have roles and schemas, so the
-- containment of the secret is checked everywhere the suite runs.

select assert(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use the private schema'
);

select assert(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use the private schema'
);

select assert(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'private' and grantee in ('anon', 'authenticated', 'PUBLIC')) = 0,
  'no table in private is granted to anon, authenticated or PUBLIC'
);

-- --- Scheduling, where pg_cron is available ----------------------------------
-- CI runs against a plain Postgres with the shim, which has no pg_cron. Skipping
-- there is correct: the migration deliberately degrades rather than halting, and
-- this proves the degradation is the quiet kind rather than a broken schema.

do $$
declare
  v_jobs    text[];
  v_leaked  integer;
  v_secret  constant text := 'cron-secret-for-the-test-only';
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'SKIP  pg_cron not installed — scheduling assertions skipped';
    return;
  end if;

  perform private.configure_cron('https://barre.test', v_secret);

  select array_agg(jobname order by jobname) into v_jobs
  from cron.job where jobname like 'barre-%';

  perform assert(
    v_jobs @> array[
      'barre-attendance', 'barre-automations', 'barre-expire-credits',
      'barre-generate-sessions', 'barre-queue-reminders', 'barre-send-email',
      'barre-send-vouchers'
    ],
    'every scheduled job is present'
  );

  perform assert(
    (select schedule from cron.job where jobname = 'barre-send-email') = '*/5 * * * *',
    'send-email runs every five minutes — the one job that is time-critical'
  );

  -- Running it again must converge, not accumulate. It runs on every deploy.
  perform private.configure_cron('https://barre.test', v_secret);

  perform assert(
    (select count(*) from cron.job where jobname like 'barre-%') = array_length(v_jobs, 1),
    'rescheduling is idempotent'
  );

  select count(*) into v_leaked
  from cron.job where command like '%' || v_secret || '%';

  perform assert(v_leaked = 0, 'the cron secret never appears in a job definition');

  perform assert(
    (select count(*) from private.cron_config) = 1,
    'exactly one configuration row survives repeated deploys'
  );
end $$;
