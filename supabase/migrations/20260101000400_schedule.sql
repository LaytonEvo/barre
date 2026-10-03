-- =============================================================================
-- Schedule: venues, class types, recurring templates, concrete sessions.
--
-- Nothing here is hard-coded to one venue, one instructor or the current
-- timetable. Adding a fourth weekly class is a row; adding a second venue is
-- a row plus photos.
-- =============================================================================

create table public.venues (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text not null unique,
  address_line1    text,
  address_line2    text,
  city             text,
  county           text,
  postcode         text,
  latitude         numeric(9, 6),
  longitude        numeric(9, 6),

  -- Per-venue timezone so a future venue outside the UK does not break
  -- session generation. Defaults to Europe/London.
  timezone         text not null default 'Europe/London',

  parking_notes    text,
  access_notes     text,
  photo_paths      text[] not null default '{}',
  default_capacity integer check (default_capacity is null or default_capacity > 0),
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger venues_set_updated_at
  before update on public.venues
  for each row execute function public.tg_set_updated_at();

create table public.class_types (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null unique,
  description           text,
  long_description      text,
  level                 public.class_level not null default 'all_levels',
  intensity             integer check (intensity between 1 and 5),
  default_duration_mins integer not null check (default_duration_mins > 0),

  -- Names a semantic design token, never a hex value, so a re-skin cannot
  -- leave stale colours in the database.
  colour_token          text not null default 'plum',

  hero_image_path       text,
  what_to_bring         text,
  active                boolean not null default true,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger class_types_set_updated_at
  before update on public.class_types
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Recurring rule.
--
-- start_time_local is a wall-clock time, not an instant. "Monday 09:30" must
-- still mean 09:30 after the clocks change, so generation applies this time in
-- the venue's timezone rather than adding 168 hours to the last session.
-- -----------------------------------------------------------------------------
create table public.schedule_templates (
  id               uuid primary key default gen_random_uuid(),
  class_type_id    uuid not null references public.class_types (id) on delete restrict,
  venue_id         uuid not null references public.venues (id) on delete restrict,
  instructor_id    uuid not null references public.instructors (id) on delete restrict,
  weekday          integer not null check (weekday between 0 and 6),  -- 0 = Sunday
  start_time_local time not null,
  duration_mins    integer not null check (duration_mins > 0),
  capacity         integer not null check (capacity > 0),
  effective_from   date not null,
  effective_to     date,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint schedule_templates_dates_ordered
    check (effective_to is null or effective_to >= effective_from)
);

create index schedule_templates_active_idx
  on public.schedule_templates (active, weekday) where active;

create trigger schedule_templates_set_updated_at
  before update on public.schedule_templates
  for each row execute function public.tg_set_updated_at();

comment on column public.schedule_templates.effective_to is
  'Retires a slot without deleting it, so past sessions keep their template link.';

-- -----------------------------------------------------------------------------
-- Concrete sessions.
--
-- Generated on a rolling window by cron, individually editable afterwards.
-- No booked_count column: that would be a second source of truth that can
-- drift from bookings. Capacity is counted inside the locked transaction.
-- -----------------------------------------------------------------------------
create table public.class_sessions (
  id                  uuid primary key default gen_random_uuid(),
  template_id         uuid references public.schedule_templates (id) on delete set null,
  class_type_id       uuid not null references public.class_types (id) on delete restrict,
  venue_id            uuid not null references public.venues (id) on delete restrict,
  instructor_id       uuid not null references public.instructors (id) on delete restrict,

  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  capacity            integer not null check (capacity > 0),

  status              public.session_status not null default 'scheduled',
  note                text,

  -- One-off workshops and pop-ups: no template, and optionally their own price.
  is_one_off          boolean not null default false,
  price_override_pence integer check (price_override_pence is null or price_override_pence >= 0),

  cancelled_at        timestamptz,
  cancelled_reason    text,
  cancelled_by        uuid references public.profiles (id),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint class_sessions_times_ordered check (ends_at > starts_at),
  constraint class_sessions_one_off_has_no_template
    check (not is_one_off or template_id is null),
  constraint class_sessions_cancelled_has_timestamp
    check ((status <> 'cancelled') or cancelled_at is not null)
);

-- Makes session generation idempotent: re-running the cron cannot duplicate a
-- class. Invariant 10 in docs/01-DATA-MODEL.md.
create unique index class_sessions_template_instance_idx
  on public.class_sessions (template_id, starts_at)
  where template_id is not null;

create index class_sessions_starts_at_idx on public.class_sessions (starts_at);
create index class_sessions_upcoming_idx
  on public.class_sessions (starts_at)
  where status = 'scheduled';
create index class_sessions_venue_idx on public.class_sessions (venue_id, starts_at);
create index class_sessions_instructor_idx on public.class_sessions (instructor_id, starts_at);

create trigger class_sessions_set_updated_at
  before update on public.class_sessions
  for each row execute function public.tg_set_updated_at();

-- Audit trail for the generation cron, so a missing week is diagnosable.
create table public.session_generation_runs (
  id                uuid primary key default gen_random_uuid(),
  ran_at            timestamptz not null default now(),
  window_start      date not null,
  window_end        date not null,
  sessions_created  integer not null default 0,
  sessions_skipped  integer not null default 0,
  error             text
);
