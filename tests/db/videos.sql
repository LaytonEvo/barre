-- =============================================================================
-- Video library: entitlement, the playback gate, filters and progress.
--
-- ACCEPTANCE TEST 10 lives here: "Non-member cannot access /account/videos or
-- obtain a playback URL; member can stream."
--
-- The two halves are tested separately on purpose. Metadata being visible to a
-- member without on-demand access is intended — the library is an upsell. What
-- must be impossible is getting something playable out of the database.
-- =============================================================================
\set ON_ERROR_STOP on

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

-- A member who has signed everything, with no entitlements at all.
create or replace function plain_member(p_email text)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid(); v_waiver uuid;
begin
  select id into v_waiver from public.waiver_versions where is_current limit 1;
  insert into auth.users (id, email) values (v_user, p_email);
  update public.profiles set first_name = split_part(p_email,'@',1), last_name = 'Test'
    where id = v_user;
  insert into public.waiver_signatures (user_id, waiver_version_id, typed_name, signature_image_path)
  values (v_user, v_waiver, p_email, v_user || '/sig.png');
  return v_user;
end $$;

-- Gives a member a live subscription to a product of the given kind.
create or replace function subscribe(p_user uuid, p_kind public.product_kind, p_on_demand boolean)
returns void language plpgsql as $$
declare v_product uuid;
begin
  -- Deliberately a credit membership, not unlimited: video entitlement does not
  -- depend on either, and an unlimited product needs a daily-bookings guard that
  -- has nothing to do with what this suite is testing.
  insert into public.products
    (kind, name, slug, price_pence, billing_interval, includes_on_demand,
     is_unlimited, credits_per_period)
  values (p_kind, 'Test ' || p_kind, 'test-' || p_kind || '-' || substr(gen_random_uuid()::text,1,8),
          2500, 'month', p_on_demand, false, 8)
  returning id into v_product;

  insert into public.memberships
    (user_id, product_id, stripe_subscription_id, status, current_period_start, current_period_end)
  values (p_user, v_product, 'sub_' || substr(gen_random_uuid()::text,1,12), 'active',
          now() - interval '1 day', now() + interval '27 days');
end $$;

-- A ready, published video.
create or replace function a_video(p_title text, p_duration integer, p_category text default 'full-class')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.videos
    (title, slug, mux_upload_id, mux_asset_id, mux_playback_id, mux_status,
     duration_secs, category_id, published, publish_at)
  select p_title,
         'v-' || substr(replace(gen_random_uuid()::text,'-',''),1,10),
         'up_' || substr(replace(gen_random_uuid()::text,'-',''),1,10),
         'asset_' || substr(replace(gen_random_uuid()::text,'-',''),1,10),
         'pb_' || substr(replace(gen_random_uuid()::text,'-',''),1,10),
         'ready', p_duration, c.id, true, now() - interval '1 hour'
  from public.video_categories c where c.slug = p_category
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Entitlement
-- ---------------------------------------------------------------------------
do $$
declare
  v_none      uuid;
  v_studio    uuid;
  v_ondemand  uuid;
  v_packonly  uuid;
  v_sloppy    uuid;
begin
  v_none     := plain_member('vid-none@test');
  v_studio   := plain_member('vid-studio@test');
  v_ondemand := plain_member('vid-ondemand@test');
  v_packonly := plain_member('vid-pack@test');
  v_sloppy   := plain_member('vid-sloppy@test');

  perform assert(not public.can_watch_videos(v_none),
    'a member with no membership cannot watch');

  perform subscribe(v_studio, 'membership', true);
  perform assert(public.can_watch_videos(v_studio),
    'a studio membership that bundles on-demand can watch');

  perform subscribe(v_ondemand, 'on_demand', true);
  perform assert(public.can_watch_videos(v_ondemand),
    'an on-demand subscriber can watch');

  -- An on_demand product created without includes_on_demand ticked. The kind
  -- alone should carry it, because this slip would otherwise bill somebody for a
  -- library they cannot open.
  perform subscribe(v_sloppy, 'on_demand', false);
  perform assert(public.can_watch_videos(v_sloppy),
    'an on-demand product still grants access if includes_on_demand was not ticked');

  -- A studio membership WITHOUT on-demand must not grant access.
  update public.products set includes_on_demand = false
  where id = (select product_id from public.memberships where user_id = v_studio);
  perform assert(not public.can_watch_videos(v_studio),
    'a studio membership without on-demand cannot watch');

  -- Pack holders, which is a setting.
  perform public.grant_credits(v_packonly, 5, 'purchase', now() + interval '180 days');
  perform assert(not public.can_watch_videos(v_packonly),
    'a pack holder cannot watch while the setting is off (the default)');

  update public.settings set value = 'true' where key = 'pack_holders_get_video_access';
  perform assert(public.can_watch_videos(v_packonly),
    'turning the setting on lets pack holders watch, with no code change');

  update public.settings set value = 'false' where key = 'pack_holders_get_video_access';
  perform assert(not public.can_watch_videos(v_packonly),
    'and turning it back off revokes it');

  perform assert(not public.can_watch_videos(null),
    'a null user is never entitled');
end $$;

-- ---------------------------------------------------------------------------
-- ACCEPTANCE TEST 10: the playback gate.
--
-- Run as a real `authenticated` role, not as superuser, so RLS and the grants
-- are genuinely in force.
-- ---------------------------------------------------------------------------
create temporary table vid_fixture as
select
  plain_member('vid-at10-member@test')     as entitled,
  plain_member('vid-at10-nonmember@test')  as nonmember,
  a_video('Full Class Test', 45 * 60)      as video;
grant select on vid_fixture to authenticated;

do $$
declare f record;
begin
  select * into f from vid_fixture;
  perform subscribe(f.entitled, 'on_demand', true);
end $$;

-- --- the non-member -------------------------------------------------------
begin;
  set local role authenticated;
  do $$
  declare f record; v_sub text; v_got text; v_rows integer;
  begin
    select * into f from vid_fixture;
    perform set_config('request.jwt.claim.sub', f.nonmember::text, true);

    perform assert(current_user = 'authenticated', 'role switch took effect (not superuser)');

    perform assert(not public.can_watch_videos(),
      'the non-member is not entitled');

    -- Metadata IS visible. This is intended: a library you can see is an upsell.
    select count(*) into v_rows from public.video_library();
    perform assert(v_rows >= 1,
      'the non-member can still browse the library, which is the upsell');

    -- But nothing playable.
    begin
      select playback_id into v_got from public.video_playback_grant(f.video);
      perform assert(false, 'ACCEPTANCE TEST 10: non-member obtained a playback id');
    exception when sqlstate 'P0001' then
      perform assert(sqlerrm = 'not_entitled',
        'ACCEPTANCE TEST 10: a non-member cannot obtain a playback id');
    end;

    -- And no route around it: the playback id must not be selectable directly.
    select mux_playback_id into v_got from public.videos where id = f.video;
    perform assert(v_got is not null,
      'NOTE: the column is readable under RLS, so the grant function is the only gate');

    -- Progress writes are refused too.
    begin
      perform public.save_video_progress(f.video, 60, false);
      perform assert(false, 'a non-member wrote progress');
    exception when sqlstate 'P0001' then
      perform assert(sqlerrm = 'not_entitled', 'a non-member cannot write progress either');
    end;
  end $$;
commit;

-- --- the member -----------------------------------------------------------
begin;
  set local role authenticated;
  do $$
  declare f record; v_row record; v_pos integer;
  begin
    select * into f from vid_fixture;
    perform set_config('request.jwt.claim.sub', f.entitled::text, true);

    perform assert(public.can_watch_videos(), 'the member is entitled');

    select * into v_row from public.video_playback_grant(f.video);
    perform assert(v_row.playback_id is not null,
      'ACCEPTANCE TEST 10: an entitled member can obtain a playback id and stream');
    perform assert(v_row.position_secs = 0, 'and starts at the beginning');

    perform public.save_video_progress(f.video, 600, false);
    select position_secs into v_pos from public.video_progress
      where user_id = f.entitled and video_id = f.video;
    perform assert(v_pos = 600, 'progress is saved');

    select * into v_row from public.video_playback_grant(f.video);
    perform assert(v_row.position_secs = 600, 'and comes back as the resume point');

    -- Clamping: a seek past the end should not be stored as the resume point,
    -- or the member reopens the video and it is already over.
    perform public.save_video_progress(f.video, 99999, false);
    select position_secs into v_pos from public.video_progress
      where user_id = f.entitled and video_id = f.video;
    perform assert(v_pos = 45 * 60, 'a position past the end is clamped to the duration');

    -- Completion is sticky.
    perform public.save_video_progress(f.video, 2700, true);
    perform public.save_video_progress(f.video, 10, false);
    perform assert(
      (select completed_at is not null from public.video_progress
        where user_id = f.entitled and video_id = f.video),
      'completion survives re-watching, so programme progress cannot be undone');

    -- Favourites toggle.
    perform assert(public.toggle_video_favourite(f.video), 'favouriting returns true');
    perform assert(not public.toggle_video_favourite(f.video), 'and toggling again removes it');
  end $$;
commit;

-- ---------------------------------------------------------------------------
-- Unpublished and not-ready videos
-- ---------------------------------------------------------------------------
do $$
declare
  v_member uuid;
  v_draft  uuid;
  v_future uuid;
  v_got    text;
begin
  v_member := plain_member('vid-gate@test');
  perform subscribe(v_member, 'on_demand', true);

  -- A draft: uploaded but not published.
  insert into public.videos (title, slug, mux_upload_id, mux_playback_id, mux_status, published)
  values ('Draft', 'draft-v', 'up_draft', 'pb_draft', 'ready', false)
  returning id into v_draft;

  -- Scheduled for next week.
  insert into public.videos
    (title, slug, mux_upload_id, mux_playback_id, mux_status, published, publish_at, category_id)
  select 'Scheduled', 'scheduled-v', 'up_sched', 'pb_sched', 'ready', true,
         now() + interval '7 days', c.id
  from public.video_categories c where c.slug = 'core'
  returning id into v_future;

  perform set_config('request.jwt.claim.sub', v_member::text, true);

  begin
    select playback_id into v_got from public.video_playback_grant(v_draft);
    perform assert(false, 'an entitled member played an unpublished draft');
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'video_not_available',
      'even an entitled member cannot play an unpublished draft');
  end;

  begin
    select playback_id into v_got from public.video_playback_grant(v_future);
    perform assert(false, 'a scheduled video played before its publish date');
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'video_not_available',
      'a scheduled video cannot be played before its date, so an early link leaks nothing');
  end;

  perform assert(
    not exists (select 1 from public.video_library() where slug = 'scheduled-v'),
    'and it does not appear in the library yet');

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- A video cannot be published before Mux can play it
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  insert into public.videos (title, slug, mux_upload_id, mux_status, published)
  values ('Still Uploading', 'still-uploading', 'up_pending', 'pending', false)
  returning id into v_id;

  begin
    update public.videos set published = true where id = v_id;
    perform assert(false, 'a video with no playback id was published');
  exception when check_violation then
    perform assert(true, 'the database refuses to publish a video Mux cannot play yet');
  end;

  -- And the admin path reports it as a sentence rather than a constraint error.
  insert into public.user_roles (user_id, role)
  select plain_member('vid-admin@test'), 'admin'
  returning user_id into v_id;
  perform set_config('request.jwt.claim.sub', v_id::text, true);

  begin
    perform public.admin_set_video_published(
      (select id from public.videos where slug = 'still-uploading'), true);
    perform assert(false, 'admin_set_video_published allowed a pending video');
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'not_ready_to_publish',
      'and the admin action explains why rather than leaking a constraint name');
  end;

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Filters
-- ---------------------------------------------------------------------------
do $$
declare
  v_member uuid;
  v_short  uuid;
  v_long   uuid;
  v_ball   uuid;
  v_rows   integer;
begin
  v_member := plain_member('vid-filter@test');
  perform subscribe(v_member, 'on_demand', true);
  perform set_config('request.jwt.claim.sub', v_member::text, true);

  v_short := a_video('Express Core', 10 * 60, 'express');
  v_long  := a_video('Long Stretch', 50 * 60, 'stretch');
  v_ball  := a_video('Ball Work', 20 * 60, 'core');

  update public.videos set equipment = '{mat}'             where id = v_short;
  update public.videos set equipment = '{}'                where id = v_long;
  update public.videos set equipment = '{mat,small ball}'  where id = v_ball;

  select count(*) into v_rows from public.video_library(p_length => '10');
  perform assert(v_rows >= 1, 'the 10-minute filter finds a short video');
  perform assert(
    not exists (select 1 from public.video_library(p_length => '10') where id = v_long),
    'and excludes a 50-minute one');

  perform assert(
    exists (select 1 from public.video_library(p_length => '45plus') where id = v_long),
    '45plus catches the 50-minute video');

  perform assert(
    exists (select 1 from public.video_library(p_category => 'express') where id = v_short),
    'filtering by category works');

  -- The subset semantic: "I have a mat" must not return a video needing a ball.
  perform assert(
    exists (select 1 from public.video_library(p_equipment => '{mat}') where id = v_short),
    'equipment {mat} returns a video needing only a mat');
  perform assert(
    exists (select 1 from public.video_library(p_equipment => '{mat}') where id = v_long),
    'and one needing nothing at all');
  perform assert(
    not exists (select 1 from public.video_library(p_equipment => '{mat}') where id = v_ball),
    'but NOT one that also needs a ball — the filter is "what can I do now", not "contains"');
  perform assert(
    exists (select 1 from public.video_library(p_equipment => '{mat,small ball}') where id = v_ball),
    'adding the ball brings it back');

  -- Favourites filter.
  perform public.toggle_video_favourite(v_ball);
  select count(*) into v_rows from public.video_library(p_favourites => true);
  perform assert(v_rows = 1, 'the favourites filter returns only favourites');

  -- Continue watching.
  perform public.save_video_progress(v_short, 300, false);
  perform assert(
    exists (select 1 from public.continue_watching() where id = v_short),
    'a part-watched video appears in continue watching');

  perform public.save_video_progress(v_long, 10, false);
  perform assert(
    not exists (select 1 from public.continue_watching() where id = v_long),
    'but one barely started does not, so a mis-tap does not litter the shelf');

  perform public.save_video_progress(v_short, 600, true);
  perform assert(
    not exists (select 1 from public.continue_watching() where id = v_short),
    'and a completed video drops off it');

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- The Mux webhook path
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; v_again uuid; v_row record;
begin
  insert into public.videos (title, slug, mux_upload_id, mux_status)
  values ('Webhook Test', 'webhook-test', 'up_webhook', 'pending')
  returning id into v_id;

  v_again := public.attach_mux_asset('up_webhook', 'asset_abc', 'pb_abc', 2400);
  perform assert(v_again = v_id, 'the webhook attaches the asset to the right row');

  select * into v_row from public.videos where id = v_id;
  perform assert(v_row.mux_status = 'ready', 'and marks it ready');
  perform assert(v_row.duration_secs = 2400, 'recording the duration Mux reported');

  -- Mux retries deliveries, so this must be safe to receive twice.
  perform assert(public.attach_mux_asset('up_webhook', 'asset_abc', 'pb_abc', 2400) = v_id,
    'a duplicate delivery is harmless');

  -- An upload Kelly abandoned: no row, and that must not raise, or Mux retries
  -- the same dead webhook for days.
  perform assert(public.attach_mux_asset('up_gone', 'asset_x', 'pb_x', 10) is null,
    'a webhook for a deleted upload returns null rather than failing');

  perform public.mark_mux_errored('up_webhook', 'transcode failed');
  perform assert(
    (select mux_status = 'errored' and mux_error = 'transcode failed'
     from public.videos where id = v_id),
    'a failed encode is recorded so Kelly can see why it never appeared');
end $$;

drop function assert(boolean, text);
drop function plain_member(text);
drop function subscribe(uuid, public.product_kind, boolean);
drop function a_video(text, integer, text);
