-- =============================================================================
-- M7, part 1: who may watch, and the one definition of a live membership.
--
-- The brief's acceptance test 10 is the whole point of this file: "Non-member
-- cannot access /account/videos or obtain a playback URL; member can stream."
-- Note the two halves. Metadata stays readable to any signed-in member on
-- purpose — a library they can see is an upsell, and RLS already allows that.
-- What must be impossible is obtaining something playable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Direct-upload bookkeeping.
--
-- Kelly drags a file in and the browser uploads it straight to Mux, so the row
-- exists before the asset does. The upload id is the only handle we have in that
-- window — the webhook arrives later naming it, and that is how the asset gets
-- attached to the right row.
-- -----------------------------------------------------------------------------
alter table public.videos
  add column if not exists mux_upload_id text unique,
  add column if not exists mux_status text not null default 'pending',
  add column if not exists mux_error text;

comment on column public.videos.mux_status is
  'pending (awaiting upload) | processing (Mux transcoding) | ready | errored. Drives what the admin list shows; a video cannot be published unless ready.';

-- A video cannot be published until Mux can actually play it. Without this, a
-- scheduled publish could put a member in front of a dead player.
alter table public.videos
  drop constraint if exists videos_published_needs_playback;
alter table public.videos
  add constraint videos_published_needs_playback
  check (not published or (mux_playback_id is not null and mux_status = 'ready'));

-- -----------------------------------------------------------------------------
-- can_watch_videos(user)
--
-- Four ways in, in order of how clearly the person has paid for it.
-- -----------------------------------------------------------------------------
create or replace function public.can_watch_videos(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_m record;
begin
  if p_user_id is null then
    return false;
  end if;

  -- Kelly and her instructors need to see what members see, not least to check
  -- a video plays before she publishes it.
  if public.is_staff() then
    return true;
  end if;

  select * into v_m from public.live_membership(p_user_id);

  if found then
    -- A studio membership that bundles on-demand, or an on-demand-only
    -- subscription. The second test is not redundant: it means an on_demand
    -- product still grants access if somebody forgets to tick includes_on_demand
    -- when creating it, which is the sort of data-entry slip that generates a
    -- refund request.
    if v_m.includes_on_demand or v_m.product_kind = 'on_demand' then
      return true;
    end if;
  end if;

  -- Configurable per the brief: "pack holders get X". Off by default, because
  -- giving the library away with a £25 pack undercuts the on-demand product.
  if public.setting_text('pack_holders_get_video_access', 'false') = 'true'
     and public.credit_balance(p_user_id) > 0 then
    return true;
  end if;

  return false;
end;
$$;

comment on function public.can_watch_videos(uuid) is
  'Video entitlement. Metadata is readable without this (the library is an upsell); nothing playable is.';

grant execute on function public.can_watch_videos(uuid) to authenticated;

-- =============================================================================
-- The library
-- =============================================================================

-- -----------------------------------------------------------------------------
-- video_library(...)
--
-- One query for the whole library screen, filters included, because the
-- alternative is a page that fires a query per card for progress and another per
-- card for favourites.
--
-- Equipment filtering is a SUBSET test, not an overlap test, and the difference
-- matters. A member standing in their front room with a mat wants to know what
-- they can do *right now* — so passing {mat} returns videos needing a mat or
-- nothing, never a video that also wants light weights they do not own. The UI
-- asks "what have you got?" rather than "filter by equipment" so the semantic
-- is visible.
-- -----------------------------------------------------------------------------
create or replace function public.video_library(
  p_category   text    default null,
  p_length     text    default null,   -- '10' | '20' | '30' | '45plus'
  p_level      text    default null,
  p_equipment  text[]  default null,   -- what the member HAS
  p_favourites boolean default false,
  p_pregnancy  boolean default false
)
returns table (
  id              uuid,
  title           text,
  slug            text,
  description     text,
  thumbnail_path  text,
  duration_secs   integer,
  level           public.class_level,
  category_name   text,
  category_slug   text,
  equipment       text[],
  instructor_name text,
  safe_for_pregnancy boolean,
  safety_note     text,
  publish_at      timestamptz,
  is_new          boolean,
  position_secs   integer,
  completed_at    timestamptz,
  is_favourite    boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    v.id, v.title, v.slug, v.description, v.thumbnail_path, v.duration_secs,
    v.level, c.name, c.slug, v.equipment,
    i.display_name,
    v.safe_for_pregnancy, v.safety_note, v.publish_at,
    coalesce(v.publish_at, v.created_at) > now() - interval '7 days',
    coalesce(p.position_secs, 0),
    p.completed_at,
    f.user_id is not null
  from public.videos v
  left join public.video_categories c on c.id = v.category_id
  left join public.instructors i on i.id = v.instructor_id
  left join public.video_progress p on p.video_id = v.id and p.user_id = auth.uid()
  left join public.video_favourites f on f.video_id = v.id and f.user_id = auth.uid()
  where v.published
    and v.mux_status = 'ready'
    and (v.publish_at is null or v.publish_at <= now())
    and (p_category is null or c.slug = p_category)
    and (p_level is null or v.level::text = p_level)
    and (p_equipment is null or v.equipment <@ p_equipment)
    and (not p_favourites or f.user_id is not null)
    and (not p_pregnancy or v.safe_for_pregnancy)
    and (
      p_length is null
      or (p_length = '10'     and v.duration_secs <  15 * 60)
      or (p_length = '20'     and v.duration_secs >= 15 * 60 and v.duration_secs < 25 * 60)
      or (p_length = '30'     and v.duration_secs >= 25 * 60 and v.duration_secs < 40 * 60)
      or (p_length = '45plus' and v.duration_secs >= 40 * 60)
    )
  order by coalesce(v.publish_at, v.created_at) desc;
$$;

grant execute on function public.video_library(text, text, text, text[], boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- continue_watching(limit)
--
-- Started, not finished, most recent first. Deliberately excludes anything under
-- 30 seconds in: tapping a video and changing your mind should not litter the
-- shelf a member sees first.
-- -----------------------------------------------------------------------------
create or replace function public.continue_watching(p_limit integer default 4)
returns table (
  id             uuid,
  title          text,
  slug           text,
  thumbnail_path text,
  duration_secs  integer,
  position_secs  integer,
  percent        integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    v.id, v.title, v.slug, v.thumbnail_path, v.duration_secs, p.position_secs,
    case
      when v.duration_secs is null or v.duration_secs = 0 then 0
      else least(100, greatest(0, (p.position_secs * 100) / v.duration_secs))
    end
  from public.video_progress p
  join public.videos v on v.id = p.video_id
  where p.user_id = auth.uid()
    and p.completed_at is null
    and p.position_secs >= 30
    and v.published
    and v.mux_status = 'ready'
  order by p.updated_at desc
  limit greatest(1, least(p_limit, 24));
$$;

grant execute on function public.continue_watching(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- video_playback_grant(video)
--
-- THE GATE (acceptance test 10). The playback id leaves the database through
-- this function and nowhere else, and only for somebody entitled to it.
--
-- It is SECURITY DEFINER with an explicit entitlement check rather than a plain
-- select under RLS, because the RLS policy on `videos` deliberately lets any
-- member read metadata — so a policy alone would hand the playback id to
-- everyone who can see the library.
-- -----------------------------------------------------------------------------
create or replace function public.video_playback_grant(p_video_id uuid)
returns table (playback_id text, title text, duration_secs integer, position_secs integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  if not public.can_watch_videos(v_user) then
    raise exception 'not_entitled' using errcode = 'P0001';
  end if;

  return query
  select v.mux_playback_id, v.title, v.duration_secs,
         coalesce(pr.position_secs, 0)
  from public.videos v
  left join public.video_progress pr
         on pr.video_id = v.id and pr.user_id = v_user
  where v.id = p_video_id
    and v.mux_playback_id is not null
    and v.mux_status = 'ready'
    -- Staff may preview an unpublished video; a member may not, or a scheduled
    -- release leaks to anyone who guesses an id.
    and (public.is_staff() or (v.published and (v.publish_at is null or v.publish_at <= now())));

  if not found then
    raise exception 'video_not_available' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.video_playback_grant(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- save_video_progress / toggle_video_favourite
-- -----------------------------------------------------------------------------
create or replace function public.save_video_progress(
  p_video_id      uuid,
  p_position_secs integer,
  p_completed     boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_duration integer;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- Entitlement is re-checked on write. Progress is harmless data, but an
  -- endpoint that accepts writes from people with no access is still an endpoint
  -- that accepts writes from people with no access.
  if not public.can_watch_videos(v_user) then
    raise exception 'not_entitled' using errcode = 'P0001';
  end if;

  select duration_secs into v_duration from public.videos where id = p_video_id;
  if not found then
    raise exception 'video_not_available' using errcode = 'P0001';
  end if;

  insert into public.video_progress (user_id, video_id, position_secs, completed_at)
  values (
    v_user,
    p_video_id,
    -- Clamped: a seek past the end, or a negative from a confused player, should
    -- not be stored as the resume point.
    greatest(0, least(p_position_secs, coalesce(v_duration, p_position_secs))),
    case when p_completed then now() else null end
  )
  on conflict (user_id, video_id) do update
    set position_secs = excluded.position_secs,
        -- Completion is sticky. Re-watching a video should not un-complete it;
        -- that would quietly undo a programme's progress.
        completed_at  = coalesce(public.video_progress.completed_at, excluded.completed_at);
end;
$$;

grant execute on function public.save_video_progress(uuid, integer, boolean) to authenticated;

create or replace function public.toggle_video_favourite(p_video_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_had  boolean;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  delete from public.video_favourites
  where user_id = v_user and video_id = p_video_id
  returning true into v_had;

  if v_had then
    return false;
  end if;

  insert into public.video_favourites (user_id, video_id) values (v_user, p_video_id)
  on conflict do nothing;
  return true;
end;
$$;

grant execute on function public.toggle_video_favourite(uuid) to authenticated;

-- =============================================================================
-- Admin: upload, edit, publish
-- =============================================================================

-- -----------------------------------------------------------------------------
-- admin_create_video_draft(title, upload_id)
--
-- Called the moment Kelly picks a file, before a byte has uploaded. The row has
-- to exist first so the webhook has something to attach the asset to.
-- -----------------------------------------------------------------------------
create or replace function public.admin_create_video_draft(
  p_title     text,
  p_upload_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid;
  v_slug text;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title_required' using errcode = 'P0001';
  end if;

  -- Slug from the title, then de-duplicated with a short suffix. Two videos
  -- called "Express Arms" is a normal thing to want, not an error to report.
  v_slug := trim(both '-' from regexp_replace(lower(trim(p_title)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then
    v_slug := 'video';
  end if;
  if exists (select 1 from public.videos where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.videos (title, slug, mux_upload_id, mux_status, published)
  values (trim(p_title), v_slug, p_upload_id, 'pending', false)
  returning id into v_id;

  perform public.write_audit('create_video_draft', 'videos', v_id, null,
    jsonb_build_object('title', trim(p_title), 'upload_id', p_upload_id));

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- attach_mux_asset(upload_id, asset_id, playback_id, duration)
--
-- Driven by the Mux webhook, so it runs as the service role with no logged-in
-- user. It is idempotent by nature: Mux retries deliveries, and
-- `video.asset.ready` can arrive more than once.
-- -----------------------------------------------------------------------------
create or replace function public.attach_mux_asset(
  p_upload_id    text,
  p_asset_id     text,
  p_playback_id  text,
  p_duration_secs integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  update public.videos
    set mux_asset_id    = p_asset_id,
        mux_playback_id = p_playback_id,
        duration_secs   = coalesce(p_duration_secs, duration_secs),
        mux_status      = 'ready',
        mux_error       = null
    where mux_upload_id = p_upload_id
    returning id into v_id;

  if v_id is null then
    -- Not an error worth raising: an upload Kelly abandoned and deleted still
    -- produces a webhook, and failing it only makes Mux retry for days.
    return null;
  end if;

  perform public.write_audit('mux_asset_ready', 'videos', v_id, null,
    jsonb_build_object('asset_id', p_asset_id, 'duration_secs', p_duration_secs));

  return v_id;
end;
$$;

create or replace function public.mark_mux_errored(p_upload_id text, p_error text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.videos
    set mux_status = 'errored', mux_error = left(coalesce(p_error, 'unknown'), 500)
    where mux_upload_id = p_upload_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_update_video(...)
--
-- One function for the whole details form. NULL means "leave alone" for every
-- optional field, so a partial save cannot blank out the rest.
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_video(
  p_video_id      uuid,
  p_title         text    default null,
  p_description   text    default null,
  p_category_slug text    default null,
  p_level         text    default null,
  p_equipment     text[]  default null,
  p_instructor_id uuid    default null,
  p_safe_for_pregnancy boolean default null,
  p_safety_note   text    default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_cat    uuid;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select to_jsonb(v) - 'mux_playback_id' - 'mux_asset_id' into v_before
  from public.videos v where v.id = p_video_id;

  if v_before is null then
    raise exception 'video_not_found' using errcode = 'P0001';
  end if;

  if p_category_slug is not null then
    select id into v_cat from public.video_categories where slug = p_category_slug;
    if v_cat is null then
      raise exception 'unknown_category' using errcode = 'P0001';
    end if;
  end if;

  if p_level is not null and p_level not in ('beginner', 'improver', 'all_levels') then
    raise exception 'unknown_level' using errcode = 'P0001';
  end if;

  update public.videos set
    title              = coalesce(nullif(trim(p_title), ''), title),
    description        = coalesce(p_description, description),
    category_id        = coalesce(v_cat, category_id),
    level              = coalesce(p_level::public.class_level, level),
    equipment          = coalesce(p_equipment, equipment),
    instructor_id      = coalesce(p_instructor_id, instructor_id),
    safe_for_pregnancy = coalesce(p_safe_for_pregnancy, safe_for_pregnancy),
    -- A safety note is cleared by passing an empty string, not NULL: NULL has to
    -- keep meaning "leave alone" for every field or the form cannot save safely.
    safety_note        = case
                           when p_safety_note is null then safety_note
                           when trim(p_safety_note) = '' then null
                           else trim(p_safety_note)
                         end
  where id = p_video_id;

  perform public.write_audit('update_video', 'videos', p_video_id, v_before,
    (select to_jsonb(v) - 'mux_playback_id' - 'mux_asset_id'
     from public.videos v where v.id = p_video_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_set_video_published(video, published, publish_at)
--
-- Publish now, schedule, or unpublish. The CHECK on `videos` stops a video going
-- live before Mux can play it; this reports that as a sentence rather than a
-- constraint violation.
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_video_published(
  p_video_id   uuid,
  p_published  boolean,
  p_publish_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row record;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select * into v_row from public.videos where id = p_video_id;
  if not found then
    raise exception 'video_not_found' using errcode = 'P0001';
  end if;

  if p_published and (v_row.mux_playback_id is null or v_row.mux_status <> 'ready') then
    raise exception 'not_ready_to_publish' using errcode = 'P0001';
  end if;

  if p_published and v_row.category_id is null then
    raise exception 'category_required' using errcode = 'P0001';
  end if;

  update public.videos
    set published = p_published,
        publish_at = case when p_published then coalesce(p_publish_at, publish_at, now()) else publish_at end
    where id = p_video_id;

  perform public.write_audit(
    case when p_published then 'publish_video' else 'unpublish_video' end,
    'videos', p_video_id,
    jsonb_build_object('published', v_row.published, 'publish_at', v_row.publish_at),
    jsonb_build_object('published', p_published, 'publish_at', coalesce(p_publish_at, v_row.publish_at)));
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_videos() — the admin list, including the ones not ready yet.
-- -----------------------------------------------------------------------------
create or replace function public.admin_videos()
returns table (
  id            uuid,
  title         text,
  slug          text,
  category_name text,
  duration_secs integer,
  level         public.class_level,
  mux_status    text,
  mux_error     text,
  published     boolean,
  publish_at    timestamptz,
  watchers      integer,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select v.id, v.title, v.slug, c.name, v.duration_secs, v.level,
         v.mux_status, v.mux_error, v.published, v.publish_at,
         (select count(*) from public.video_progress p where p.video_id = v.id)::integer,
         v.created_at
  from public.videos v
  left join public.video_categories c on c.id = v.category_id
  order by v.created_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- report_popular_videos(months) — brief §10 asks for this on the reports page.
-- -----------------------------------------------------------------------------
create or replace function public.report_popular_videos(p_months integer default 3)
returns table (
  title       text,
  category    text,
  started     integer,
  completed   integer,
  completion_rate numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select
    v.title,
    coalesce(c.name, '—'),
    count(p.*)::integer,
    count(p.completed_at)::integer,
    case when count(p.*) = 0 then 0
         else round((count(p.completed_at)::numeric * 100) / count(p.*), 1)
    end
  from public.videos v
  left join public.video_categories c on c.id = v.category_id
  left join public.video_progress p
         on p.video_id = v.id
        and p.updated_at >= now() - make_interval(months => greatest(1, p_months))
  group by v.id, v.title, c.name
  having count(p.*) > 0
  order by count(p.*) desc, v.title;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'admin_create_video_draft(text, text)',
    'admin_update_video(uuid, text, text, text, text, text[], uuid, boolean, text)',
    'admin_set_video_published(uuid, boolean, timestamptz)',
    'admin_videos()',
    'report_popular_videos(integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- The webhook path runs as the service role only; no end user ever calls these.
revoke all on function public.attach_mux_asset(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.mark_mux_errored(text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Why the playback id stays a readable column.
--
-- It would be tidier if members could not select `mux_playback_id` at all. That
-- is not practical: a table-level GRANT SELECT covers every column, and Postgres
-- will not let a column-level REVOKE carve one out of it. Doing it properly means
-- revoking SELECT on the table and granting it column by column — which silently
-- becomes wrong the first time anyone adds a column and forgets to grant it.
--
-- (Worth stating plainly, because the obvious one-liner looks like it works:
-- `revoke select (mux_playback_id) on videos from authenticated` is accepted
-- without error and changes nothing.)
--
-- Leaving it readable is sound, because the id is not a secret and is not the
-- gate:
--
--   1. A signed playback id is useless without a token signed by Kelly's private
--      key, which never leaves the server. The gate is `video_playback_grant`.
--   2. The risk that would make the id dangerous — an asset created with a
--      *public* playback policy — is closed where it arises: the webhook stores
--      only a playback id whose policy is 'signed', and ignores the asset
--      entirely if there is not one.
--
-- So the exposure is an opaque identifier that cannot be played. Tests assert
-- both halves: the grant function refuses a non-member, and the webhook refuses
-- a public playback id.
-- -----------------------------------------------------------------------------
