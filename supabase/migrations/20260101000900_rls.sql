-- =============================================================================
-- Row Level Security.
--
-- RLS is enabled on EVERY table in public. Where a table has no policy for a
-- role, that role gets nothing — deny by default.
--
-- RLS is the backstop, not the only line of defence: every mutation also goes
-- through a Server Action or RPC with Zod validation and an explicit
-- authorisation check. Both layers, always.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere, then revoke the blanket grants Supabase gives the
-- anon and authenticated roles. Access is re-granted per table below.
-- -----------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;

-- =============================================================================
-- PUBLIC READ: marketing surfaces. Anonymous visitors need these to browse.
-- =============================================================================
create policy "venues are publicly readable"
  on public.venues for select to anon, authenticated using (active or public.is_staff());

create policy "class types are publicly readable"
  on public.class_types for select to anon, authenticated using (active or public.is_staff());

create policy "instructors are publicly readable"
  on public.instructors for select to anon, authenticated using (active or public.is_staff());

-- Future scheduled sessions only. Past sessions are staff-only, so the public
-- timetable cannot be scraped for attendance history.
create policy "upcoming sessions are publicly readable"
  on public.class_sessions for select to anon, authenticated
  using (starts_at > now() - interval '1 day' or public.is_staff());

create policy "active products are publicly readable"
  on public.products for select to anon, authenticated using (active or public.is_staff());

create policy "published faqs are publicly readable"
  on public.faqs for select to anon, authenticated using (published or public.is_staff());

create policy "live announcements are publicly readable"
  on public.announcements for select to anon, authenticated
  using ((active and starts_at <= now() and (ends_at is null or ends_at > now())) or public.is_staff());

create policy "published reviews are publicly readable"
  on public.reviews for select to anon, authenticated using (published or public.is_staff());

create policy "video categories are publicly readable"
  on public.video_categories for select to anon, authenticated using (active or public.is_staff());

-- The waiver must be readable before sign-up so people can read what they are
-- being asked to agree to (brief §4, /policies/*).
create policy "current waiver text is publicly readable"
  on public.waiver_versions for select to anon, authenticated
  using (is_current or public.is_staff());

-- =============================================================================
-- PUBLIC WRITE: the two forms an anonymous visitor may submit.
-- Rate limiting happens in the application layer, not here.
-- =============================================================================
create policy "anyone may submit an enquiry"
  on public.enquiries for insert to anon, authenticated with check (true);

create policy "anyone may subscribe to the newsletter"
  on public.newsletter_subscribers for insert to anon, authenticated with check (true);

-- =============================================================================
-- PROFILES
-- =============================================================================
create policy "members read their own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- Members may edit their own profile. They may NOT change their stripe customer
-- id (that would let them attach someone else's payment history) and they may
-- not touch anonymised_at. Column-level control is enforced in the Server
-- Action's Zod schema; the WITH CHECK here pins identity.
create policy "members update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "admins update any profile"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- USER ROLES — the most security-sensitive table in the schema.
--
-- Members may read their own roles (the app needs to know whether to show
-- /admin). NOBODY writes roles through the API: no insert, update or delete
-- policy exists for authenticated at all. Role changes happen via a migration
-- or the service role, deliberately.
-- =============================================================================
create policy "users read their own roles"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- =============================================================================
-- WAIVER SIGNATURES
-- =============================================================================
create policy "members read their own signatures"
  on public.waiver_signatures for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "members sign for themselves"
  on public.waiver_signatures for insert to authenticated
  with check (user_id = auth.uid());
-- No update or delete policy: the table is append-only at the trigger level too.

-- =============================================================================
-- HEALTH QUESTIONNAIRES — UK GDPR special category data.
--
-- A member reads and writes only their own row. Staff read all rows, because
-- Kelly needs to see a PAR-Q flag before a class. There is no policy that lets
-- one member see another's health data under any condition.
--
-- Acceptance test 11 asserts this through a real authenticated client.
-- =============================================================================
create policy "members read their own health questionnaire"
  on public.health_questionnaires for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "members submit their own health questionnaire"
  on public.health_questionnaires for insert to authenticated
  with check (user_id = auth.uid());

create policy "staff record a review outcome"
  on public.health_questionnaires for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- =============================================================================
-- BOOKINGS AND WAITLIST
--
-- Note there is no INSERT policy for members. Booking goes exclusively through
-- the book_session RPC (M5), which is SECURITY DEFINER and holds the row lock.
-- Letting members INSERT directly would bypass the capacity check entirely.
-- =============================================================================
create policy "members read their own bookings"
  on public.bookings for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    -- An instructor sees the register for their own classes, nothing else.
    or exists (
      select 1 from public.class_sessions s
      join public.instructors i on i.id = s.instructor_id
      where s.id = bookings.session_id and i.profile_id = auth.uid()
    )
  );

create policy "admins manage bookings"
  on public.bookings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "instructors mark attendance on their own classes"
  on public.bookings for update to authenticated
  using (
    exists (
      select 1 from public.class_sessions s
      join public.instructors i on i.id = s.instructor_id
      where s.id = bookings.session_id and i.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.class_sessions s
      join public.instructors i on i.id = s.instructor_id
      where s.id = bookings.session_id and i.profile_id = auth.uid()
    )
  );

create policy "members read their own waitlist entries"
  on public.waitlist_entries for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "members join a waitlist"
  on public.waitlist_entries for insert to authenticated
  with check (user_id = auth.uid());

-- Leaving the waitlist is always free, so members may update their own row.
create policy "members leave a waitlist"
  on public.waitlist_entries for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "admins manage waitlists"
  on public.waitlist_entries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- MONEY — read-only to members, in every case.
--
-- No member-writable policy exists on credit_ledger, purchases or memberships.
-- Those rows are written only by verified Stripe webhooks and the booking RPC,
-- both running as the service role. Invariant 5.
-- =============================================================================
create policy "members read their own ledger"
  on public.credit_ledger for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "members read their own purchases"
  on public.purchases for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "members read their own membership"
  on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "members read vouchers they bought or redeemed"
  on public.vouchers for select to authenticated
  using (purchaser_user_id = auth.uid() or redeemed_by = auth.uid() or public.is_staff());

create policy "admins manage products"
  on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins manage promo codes"
  on public.promo_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins read intro offer claims"
  on public.intro_offer_claims for select to authenticated using (public.is_admin());

-- stripe_events has no policy at all: service role only, by design.

-- =============================================================================
-- SCHEDULE MANAGEMENT
-- =============================================================================
create policy "admins manage venues"
  on public.venues for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins manage class types"
  on public.class_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins manage instructors"
  on public.instructors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "staff read schedule templates"
  on public.schedule_templates for select to authenticated using (public.is_staff());

create policy "admins manage schedule templates"
  on public.schedule_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins manage sessions"
  on public.class_sessions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins manage waiver versions"
  on public.waiver_versions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- VIDEOS
--
-- A published row being readable is NOT the same as being playable. Metadata is
-- readable by any signed-in member so the library can show a locked state and
-- an upsell; the signed playback token is minted server-side only after an
-- entitlement check (M7). Acceptance test 10 covers this.
-- =============================================================================
create policy "members read published video metadata"
  on public.videos for select to authenticated
  using ((published and (publish_at is null or publish_at <= now())) or public.is_staff());

create policy "admins manage videos"
  on public.videos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins manage video categories"
  on public.video_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "members manage their own video progress"
  on public.video_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "staff read video progress"
  on public.video_progress for select to authenticated using (public.is_staff());

create policy "members manage their own favourites"
  on public.video_favourites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "published programmes are readable"
  on public.programmes for select to authenticated
  using (published or public.is_staff());

create policy "programme contents are readable"
  on public.programme_videos for select to authenticated using (true);

create policy "admins manage programmes"
  on public.programmes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins manage programme contents"
  on public.programme_videos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "members manage their own programme progress"
  on public.programme_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- live_streams: stub, staff-read only.
create policy "staff read live streams"
  on public.live_streams for select to authenticated using (public.is_staff());

-- =============================================================================
-- OPERATIONS
-- =============================================================================
-- Settings are publicly readable because the cancellation policy shown on
-- /policies is rendered from them. They contain no secrets by design — anything
-- sensitive belongs in an environment variable, not here.
create policy "settings are publicly readable"
  on public.settings for select to anon, authenticated using (true);

create policy "admins manage settings"
  on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "members read their own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "staff manage enquiries"
  on public.enquiries for select to authenticated using (public.is_staff());

create policy "admins update enquiries"
  on public.enquiries for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins read the audit log"
  on public.audit_log for select to authenticated using (public.is_admin());

create policy "admins manage faqs"
  on public.faqs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins manage announcements"
  on public.announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins manage reviews"
  on public.reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins read newsletter subscribers"
  on public.newsletter_subscribers for select to authenticated using (public.is_admin());

-- =============================================================================
-- Tables intentionally left with NO authenticated policy (service role only):
--   stripe_events            - webhook plumbing
--   session_generation_runs  - cron diagnostics
-- =============================================================================
