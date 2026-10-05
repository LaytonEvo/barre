-- =============================================================================
-- Rate limiting for the two public write paths.
--
-- `enquiries` and `newsletter_subscribers` accept inserts from anonymous
-- visitors — they have to, they are the contact form and the sign-up box. Until
-- now the only protection was a honeypot, and the comment in the enquiry action
-- said proper limiting would "land with the other public forms at M8". M8 came
-- and went. This is that.
--
-- Done in the database rather than in memory because the app is serverless: an
-- in-process counter is per-instance, resets on every cold start, and protects
-- nothing. The database is the only thing all instances share.
-- =============================================================================

create table if not exists public.rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (bucket, window_start)
);

comment on table public.rate_limits is
  'Fixed-window counters for public write paths. Rows are disposable; the nightly cleanup drops old windows.';

alter table public.rate_limits enable row level security;
-- No policy, deliberately: nothing but the service role and SECURITY DEFINER
-- functions should ever touch this, and a table with RLS on and no policy denies
-- everyone else by default.

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- -----------------------------------------------------------------------------
-- consume_rate_limit(key, max, window_seconds)
--
-- Returns true if the action is allowed, false if the caller has had enough.
--
-- A fixed window, not a sliding one. A sliding window is fairer but needs either
-- a row per event or a background sweep; for a contact form on a village hall
-- barre class, a fixed window is the right amount of machinery. The worst case is
-- that somebody gets 2x the limit across a window boundary, which does not matter
-- here.
--
-- The insert-then-increment is done as one upsert so two simultaneous requests
-- cannot both read "count = 4" and both proceed.
-- -----------------------------------------------------------------------------
create or replace function public.consume_rate_limit(
  p_key            text,
  p_max            integer,
  p_window_seconds integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  if coalesce(trim(p_key), '') = '' then
    -- No key means we cannot attribute the request. Allowing it unconditionally
    -- would make the limit trivially bypassable by stripping a header, so it
    -- counts against a shared bucket instead.
    p_key := 'anonymous';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (bucket, window_start, count)
  values (p_key, v_window, 1)
  on conflict (bucket, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= greatest(1, p_max);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Housekeeping. Called by the nightly cron alongside the other jobs.
-- -----------------------------------------------------------------------------
create or replace function public.prune_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  with gone as (
    delete from public.rate_limits where window_start < now() - interval '2 days' returning 1
  )
  select count(*) into v_count from gone;
  return v_count;
end;
$$;

revoke all on function public.prune_rate_limits() from public, anon, authenticated;

insert into public.settings (key, value, description, confirmed) values
  ('rate_limit_enquiries_per_hour', '5',
   'Enquiries accepted from one IP per hour. Low because a real person sends one; a bot sends hundreds.',
   true),
  ('rate_limit_newsletter_per_hour', '3',
   'Newsletter sign-ups accepted from one IP per hour.',
   true),
  ('rate_limit_public_writes_per_hour', '200',
   'Backstop across ALL IPs per hour, since x-forwarded-for can be spoofed. High enough never to touch a real day at this size; low enough to cap a flood.',
   true)
on conflict (key) do nothing;
