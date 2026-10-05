-- =============================================================================
-- REAL business data, supplied by Layton on 2026-10-05.
--
-- This is production configuration, so it lives in a migration rather than
-- seed.sql (which is dev-only). Everything here was given directly or verified
-- against the venue's own public record.
--
-- Still unknown, and therefore still a visible placeholder:
--   - class capacity per venue  (set to 16 and marked unconfirmed — see below)
--   - the single-class price, which pack prices derive from
--   - Kelly's surname and qualifications
--   - contact email, phone, Instagram, domain
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Venues
--
-- Postcodes verified against the Charity Commission register (village hall) and
-- the school's published details. Coordinates are deliberately left NULL rather
-- than guessed: the map links resolve by full address, and an approximate pin on
-- a venue page is worse than no pin.
--
-- NOTE ON COUNTY: the civil parish of St Leonards and St Ives is in Dorset, but
-- the postal address uses Ringwood (Hampshire) as its post town. Both venues
-- share BH24. county is set to Dorset because that is where they are; the postal
-- form is preserved in the address lines. Worth confirming how Kelly describes
-- the area to locals, since it affects the SEO wording.
-- -----------------------------------------------------------------------------
insert into public.venues
  (id, name, slug, address_line1, address_line2, city, county, postcode,
   timezone, default_capacity, active, sort_order,
   parking_notes, access_notes)
values
  ('a1000000-0000-4000-8000-000000000001',
   'St Leonards & St Ives Village Hall', 'st-leonards-village-hall',
   'Braeside Road', 'St Leonards', 'Ringwood', 'Dorset', 'BH24 2PH',
   'Europe/London', 16, true, 1,
   null,   -- TODO: Kelly to describe parking
   null),  -- TODO: entrance, toilets, changing, step-free access

  ('a1000000-0000-4000-8000-000000000002',
   'St Ives Primary School', 'st-ives-primary-school',
   'Sandy Lane', null, 'Ringwood', 'Hampshire', 'BH24 2LE',
   'Europe/London', 16, true, 2,
   null,   -- TODO
   null)   -- TODO
on conflict (slug) do nothing;

comment on column public.venues.default_capacity is
  'PLACEHOLDER of 16 for both venues — Kelly has not confirmed how many people fit. This is the one number where guessing has physical consequences, so it must be confirmed before booking opens at M5.';

-- -----------------------------------------------------------------------------
-- Instructor
-- -----------------------------------------------------------------------------
insert into public.instructors
  (id, display_name, slug, bio, qualifications, active, sort_order)
values
  ('a2000000-0000-4000-8000-000000000001',
   'Kelly', 'kelly',
   null,   -- TODO: Kelly's story, in her own words
   '{}',   -- TODO: exact wording. Never inferred.
   true, 1)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Class type
--
-- All three weekly sessions are the same 55-minute class, so there is one class
-- type. It is named simply "Barre" because that is the only label the business
-- itself supports — if Kelly uses distinct names (a shorter express class, a
-- beginners' class), they become additional rows and additional /classes pages.
-- -----------------------------------------------------------------------------
insert into public.class_types
  (id, name, slug, description, long_description, level, intensity,
   default_duration_mins, colour_token, what_to_bring, active, sort_order)
values
  ('a3000000-0000-4000-8000-000000000001',
   'Barre', 'barre',
   'Ballet-inspired movement with Pilates and strength work. Small movements, high repetitions, all levels welcome.',
   null,   -- TODO: Kelly's own description of what a class is like
   'all_levels', 3, 55, 'plum',
   null,   -- TODO: confirm whether mats are provided at each venue
   true, 1)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Timetable
--
--   Monday    18:30 - 19:25   St Leonards & St Ives Village Hall
--   Monday    19:30 - 20:25   St Leonards & St Ives Village Hall
--   Thursday  19:15 - 20:10   St Ives Primary School
--
-- weekday is 0 = Sunday, so Monday = 1 and Thursday = 4.
-- Times are local wall-clock; generate_class_sessions() converts them in the
-- venue's timezone so they hold across the clock changes.
-- -----------------------------------------------------------------------------
insert into public.schedule_templates
  (class_type_id, venue_id, instructor_id, weekday, start_time_local,
   duration_mins, capacity, effective_from, active)
values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'a2000000-0000-4000-8000-000000000001', 1, '18:30', 55, 16, current_date, true),

  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'a2000000-0000-4000-8000-000000000001', 1, '19:30', 55, 16, current_date, true),

  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
   'a2000000-0000-4000-8000-000000000001', 4, '19:15', 55, 16, current_date, true);

-- -----------------------------------------------------------------------------
-- Products
--
-- The intro offer is a FREE first class, which has a consequence worth stating
-- in the schema: with nothing to pay there is no Stripe payment, so there is no
-- card fingerprint to deduplicate against. Intro-offer enforcement therefore
-- rests on account + email + phone only, all of which are cheap to fake.
-- See docs/03-OPEN-QUESTIONS.md question B4a.
--
-- Pack structure is confirmed ("buy 5 get 1 free", "buy 10 get 2 free") but the
-- single-class price it derives from is not, so the packs are created INACTIVE.
-- An unpriced product must never be purchasable, and £0 is not a placeholder
-- anyone should be able to check out with.
--
--   buy 5 get 1 free  ->  6 credits, priced at 5 x single-class
--   buy 10 get 2 free -> 12 credits, priced at 10 x single-class
-- -----------------------------------------------------------------------------
insert into public.products
  (kind, name, slug, description, price_pence, credits, validity_days,
   active, sort_order)
values
  ('intro_offer', 'Your first class is free', 'first-class-free',
   'One free class for anyone new to Barre By Kelly. One per person.',
   0, 1, 30, true, 1),

  ('drop_in', 'Single class', 'single-class',
   'One class. PRICE NOT YET SET — inactive until confirmed.',
   0, 1, 30, false, 2),

  ('pack', 'Buy 5, get 1 free', 'pack-5-plus-1',
   'Six classes for the price of five. PRICE NOT YET SET — derives from the single-class price. Inactive until confirmed.',
   0, 6, 180, false, 3),

  ('pack', 'Buy 10, get 2 free', 'pack-10-plus-2',
   'Twelve classes for the price of ten. PRICE NOT YET SET — derives from the single-class price. Inactive until confirmed.',
   0, 12, 365, false, 4)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Video categories (brief §9). Structure only; no videos exist yet.
-- -----------------------------------------------------------------------------
insert into public.video_categories (name, slug, sort_order) values
  ('Full class', 'full-class', 1),
  ('Express', 'express', 2),
  ('Arms', 'arms', 3),
  ('Legs & Glutes', 'legs-and-glutes', 4),
  ('Core', 'core', 5),
  ('Stretch', 'stretch', 6),
  ('Pre/Postnatal', 'pre-postnatal', 7),
  ('Beginner', 'beginner', 8)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Settings: apply the confirmed decisions.
--
-- Layton confirmed the 24-hour cancellation window and the free first class
-- directly, and accepted the recommended defaults for the rest "for now".
-- Those are marked confirmed = true because a decision was taken; the values
-- nobody has supplied stay false and keep showing in /admin.
-- -----------------------------------------------------------------------------

-- Confirmed outright
update public.settings set value = '24',  confirmed = true,
  description = 'Hours before a class that a cancellation still returns the credit. Confirmed by Layton 2026-10-05.'
  where key = 'cancellation_window_hours';

update public.settings set value = '"Ringwood"', confirmed = true,
  description = 'Primary town for local SEO. Both venues are in the St Leonards / St Ives area, which locals search for as Ringwood.'
  where key = 'primary_town';

-- Accepted recommendations ("happy to go with your suggestions for now")
update public.settings set value = '"forfeit_credit"', confirmed = true
  where key = 'late_cancel_penalty';
update public.settings set value = '"forfeit_credit"', confirmed = true
  where key = 'no_show_penalty';
update public.settings set value = 'true', confirmed = true,
  description = 'Auto-marking creates a pending no-show for Kelly to confirm, so a forgotten check-in cannot silently penalise someone who attended. Recommended and accepted 2026-10-05.'
  where key = 'no_show_auto_mark_requires_confirmation';
update public.settings set value = '14', confirmed = true
  where key = 'booking_window_days';
update public.settings set value = '2',  confirmed = true
  where key = 'waitlist_cutoff_hours';
update public.settings set value = '"expire"', confirmed = true
  where key = 'membership_credit_rollover';
update public.settings set value = '"refund"', confirmed = true
  where key = 'class_cancelled_default_remedy';
update public.settings set value = 'false', confirmed = true,
  description = 'No video library exists yet, so pack holders get no on-demand access. Revisit at M7.'
  where key = 'pack_holders_get_video_access';

-- A free intro offer takes no payment, so no card fingerprint is ever captured.
-- Leaving this true would imply a protection that does not exist.
update public.settings set value = 'false', confirmed = true,
  description = 'Disabled because the intro offer is free: with no payment there is no card fingerprint to match on. Enforcement is account + email + phone only. See docs/03 question B4a.'
  where key = 'intro_offer_block_on_card_fingerprint';

-- Still genuinely unknown — these keep showing as unconfirmed in /admin.
update public.settings set
  description = 'TODO: single-class price is needed before packs can be priced or sold. Blocks M4.'
  where key = 'vat_registered';
