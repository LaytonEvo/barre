-- =============================================================================
-- Minimal Supabase shim, for validating migrations against a plain Postgres.
--
-- Supabase provides auth.users, auth.uid(), the anon/authenticated roles and the
-- pgcrypto/citext extensions. A bare Postgres does not, so this recreates just
-- enough of them that the real migrations run unmodified.
--
-- Used by tests/db/run.sh. NOT part of the application migrations.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}',
  created_at         timestamptz not null default now()
);

-- Supabase derives this from the request JWT. Here it reads a session variable
-- so tests can impersonate a member: set local request.jwt.claim.sub = '<uuid>'.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
