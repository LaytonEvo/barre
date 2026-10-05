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

-- -----------------------------------------------------------------------------
-- Storage.
--
-- Supabase provides storage.buckets, storage.objects and the helper functions
-- its policies use. Recreating the shape here means the real migration — bucket
-- definitions and all — runs unmodified against a bare Postgres, so a mistake in
-- a storage policy is caught by the same suite as everything else.
-- -----------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null unique,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text not null references storage.buckets (id),
  name        text not null,
  owner       uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

-- Splits an object path into its segments. Supabase's own definition; the
-- policies rely on the first segment being the owning user's id.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1 : array_length(parts, 1) - 1];
end;
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert on storage.objects to authenticated;
grant select on storage.buckets to anon, authenticated;
