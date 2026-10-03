-- =============================================================================
-- People: profiles, roles, instructors.
-- =============================================================================

create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  first_name              text,
  last_name               text,
  email                   citext not null,
  phone                   text,
  date_of_birth           date,
  emergency_contact_name  text,
  emergency_contact_phone text,

  -- Marketing consent is separate from account creation and unticked by
  -- default (UK GDPR / PECR). Storing the timestamp is the evidence.
  marketing_consent       boolean not null default false,
  marketing_consent_at    timestamptz,

  -- Normalised copies used only for intro-offer dedupe. Kept alongside the
  -- display values because a member may legitimately reformat their number.
  email_normalised        citext generated always as (lower(trim(email::text))::citext) stored,
  phone_normalised        text,

  stripe_customer_id      text unique,

  notify_email            boolean not null default true,
  notify_sms              boolean not null default false,

  -- Account deletion anonymises rather than deletes, so bookings and purchases
  -- stay intact for accounting. See docs/01 and the privacy policy.
  anonymised_at           timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index profiles_email_normalised_idx on public.profiles (email_normalised);
create index profiles_phone_normalised_idx on public.profiles (phone_normalised)
  where phone_normalised is not null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

comment on column public.profiles.anonymised_at is
  'Set by the erasure flow. Identifying columns are blanked; bookings and purchases survive for accounting, waiver signatures for the legal retention period.';

-- -----------------------------------------------------------------------------
-- Roles live in their own table, deliberately.
--
-- If role were a column on profiles, any member with UPDATE on their own
-- profile row could promote themselves to admin. There is no member-writable
-- policy on this table at all.
-- -----------------------------------------------------------------------------
create table public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.app_role not null,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index user_roles_user_id_idx on public.user_roles (user_id);

-- -----------------------------------------------------------------------------
-- Role checks for RLS.
--
-- SECURITY DEFINER with a pinned search_path, reading user_roles directly.
-- This is what stops infinite RLS recursion: a policy on table X asking
-- "is this user an admin?" would otherwise trigger the policy on user_roles,
-- which would ask the same question again.
-- -----------------------------------------------------------------------------
create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = p_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_role('admin'::public.app_role);
$$;

-- Admins are implicitly staff; instructors are staff for their own classes.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('admin'::public.app_role, 'instructor'::public.app_role)
  );
$$;

comment on function public.has_role is
  'RLS helper. SECURITY DEFINER so policies can ask about roles without recursing through user_roles RLS.';


-- -----------------------------------------------------------------------------
-- Instructors.
--
-- profile_id is nullable so Kelly can put a cover teacher on the timetable
-- before they have a login. Nothing in the schema assumes a single instructor.
-- -----------------------------------------------------------------------------
create table public.instructors (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid unique references public.profiles (id) on delete set null,
  display_name   text not null,
  slug           text not null unique,
  bio            text,
  photo_path     text,
  qualifications text[] not null default '{}',
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger instructors_set_updated_at
  before update on public.instructors
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- New auth user -> profile row, with the member role.
--
-- Runs as SECURITY DEFINER because auth.users inserts happen outside any
-- session that could satisfy RLS on profiles.
-- -----------------------------------------------------------------------------
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'member'::public.app_role)
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();
