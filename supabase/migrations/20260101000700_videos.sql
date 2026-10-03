-- =============================================================================
-- At-home video library. Mux-hosted, entitlement-gated, signed playback only.
--
-- No playback URL is ever stored or served publicly: the app mints a
-- short-lived signed token per request (M7).
-- =============================================================================

create table public.video_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  sort_order integer not null default 0,
  active     boolean not null default true
);

create table public.videos (
  id                 uuid primary key default gen_random_uuid(),
  mux_asset_id       text unique,
  mux_playback_id    text unique,

  title              text not null,
  slug               text not null unique,
  description        text,
  thumbnail_path     text,
  duration_secs      integer check (duration_secs is null or duration_secs > 0),
  level              public.class_level not null default 'all_levels',
  category_id        uuid references public.video_categories (id) on delete set null,
  equipment          text[] not null default '{}',
  instructor_id      uuid references public.instructors (id) on delete set null,

  safe_for_pregnancy boolean not null default false,
  safety_note        text,

  publish_at         timestamptz,
  published          boolean not null default false,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index videos_published_idx on public.videos (published, publish_at desc) where published;
create index videos_category_idx on public.videos (category_id) where published;

create trigger videos_set_updated_at
  before update on public.videos
  for each row execute function public.tg_set_updated_at();

comment on column public.videos.mux_playback_id is
  'Signed playback id. Never rendered to the client directly — the server exchanges it for a short-lived token.';

create table public.video_progress (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  video_id      uuid not null references public.videos (id) on delete cascade,
  position_secs integer not null default 0 check (position_secs >= 0),
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, video_id)
);

create trigger video_progress_set_updated_at
  before update on public.video_progress
  for each row execute function public.tg_set_updated_at();

create table public.video_favourites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  video_id   uuid not null references public.videos (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

-- Ordered series, e.g. "4-Week Barre Foundations".
create table public.programmes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  slug        text not null unique,
  description text,
  cover_path  text,
  published   boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.programme_videos (
  programme_id uuid not null references public.programmes (id) on delete cascade,
  video_id     uuid not null references public.videos (id) on delete cascade,
  position     integer not null,
  primary key (programme_id, video_id),
  unique (programme_id, position)
);

create table public.programme_progress (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  programme_id uuid not null references public.programmes (id) on delete cascade,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, programme_id)
);

-- -----------------------------------------------------------------------------
-- Live streaming: stub only (brief §9).
--
-- Exists so Mux Live can be added later without a migration that touches
-- videos or its RLS policies. Nothing reads this yet.
-- -----------------------------------------------------------------------------
create table public.live_streams (
  id                 uuid primary key default gen_random_uuid(),
  class_session_id   uuid references public.class_sessions (id) on delete set null,
  mux_live_stream_id text unique,
  mux_playback_id    text unique,
  scheduled_start    timestamptz,
  status             text not null default 'idle',
  created_at         timestamptz not null default now()
);

comment on table public.live_streams is
  'Stub for Mux Live (brief §9). Data model only — not built, not read by any code path.';
