-- =============================================================================
-- DEVELOPMENT SEED DATA — NOT REAL BUSINESS INFORMATION.
--
-- Every venue, class, price and person below is fabricated for local
-- development and is prefixed or suffixed to make that obvious. Section 0 of
-- the build brief was unfilled, so none of Kelly's actual venues, times,
-- prices or qualifications are known.
--
-- DO NOT run this against production. `supabase db reset` runs it locally.
--
-- Deliberately NOT seeded:
--   reviews  - fabricating a testimonial would be lying to customers. The
--              homepage renders an empty state until real Google reviews exist.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Venues
-- -----------------------------------------------------------------------------
insert into public.venues
  (id, name, slug, address_line1, city, postcode, timezone, parking_notes, access_notes, default_capacity, sort_order)
values
  ('11111111-1111-4111-8111-111111111111',
   'DEMO Village Hall', 'demo-village-hall',
   '1 Example Street', 'DEMO TOWN', 'AA1 1AA', 'Europe/London',
   'Placeholder parking notes.', 'Placeholder access notes: entrance, changing, toilets.',
   14, 1),
  ('22222222-2222-4222-8222-222222222222',
   'DEMO Community Centre', 'demo-community-centre',
   '2 Example Road', 'DEMO TOWN', 'AA1 2BB', 'Europe/London',
   'Placeholder parking notes.', 'Placeholder access notes.',
   20, 2);

-- -----------------------------------------------------------------------------
-- Class types
-- -----------------------------------------------------------------------------
insert into public.class_types
  (id, name, slug, description, level, intensity, default_duration_mins, colour_token, what_to_bring, sort_order)
values
  ('33333333-3333-4333-8333-333333333331',
   'Barre Fusion', 'barre-fusion',
   'Ballet-inspired movement combined with Pilates and strength work. Small movements, high repetitions.',
   'all_levels', 3, 45, 'plum',
   'Grippy socks, a water bottle, and a mat if you have one.', 1),
  ('33333333-3333-4333-8333-333333333332',
   'Barre Express', 'barre-express',
   'A shorter, faster session for a lunch break.',
   'all_levels', 3, 30, 'blush',
   'Grippy socks and water.', 2),
  ('33333333-3333-4333-8333-333333333333',
   'Barre Foundations', 'barre-foundations',
   'A slower class that breaks down the basics. Built for a first barre class.',
   'beginner', 2, 45, 'sage',
   'Just yourself. We have spare mats.', 3);

-- -----------------------------------------------------------------------------
-- Instructor
--
-- profile_id is null: a demo instructor needs no login, and this exercises the
-- nullable FK that lets Kelly add a cover teacher before they have an account.
-- -----------------------------------------------------------------------------
insert into public.instructors
  (id, display_name, slug, bio, qualifications, sort_order)
values
  ('44444444-4444-4444-8444-444444444444',
   'Kelly (DEMO)', 'kelly-demo',
   'Placeholder bio. Kelly''s real story and qualifications are TODO — see docs/03-OPEN-QUESTIONS.md question A7.',
   '{}',  -- deliberately empty: never guess a qualification
   1);

-- -----------------------------------------------------------------------------
-- Schedule templates — three weekly classes, matching the brief's "3 classes a
-- week now". Days and times are invented for development.
-- -----------------------------------------------------------------------------
insert into public.schedule_templates
  (class_type_id, venue_id, instructor_id, weekday, start_time_local, duration_mins, capacity, effective_from)
values
  ('33333333-3333-4333-8333-333333333331', '11111111-1111-4111-8111-111111111111',
   '44444444-4444-4444-8444-444444444444', 1, '09:30', 45, 14, current_date - 30),
  ('33333333-3333-4333-8333-333333333332', '11111111-1111-4111-8111-111111111111',
   '44444444-4444-4444-8444-444444444444', 1, '18:15', 30, 14, current_date - 30),
  ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222',
   '44444444-4444-4444-8444-444444444444', 4, '19:00', 45, 20, current_date - 30);

-- -----------------------------------------------------------------------------
-- Sessions for the next four weeks.
--
-- Generated here in SQL so local development has a populated timetable before
-- the generation cron exists (M5). Note the timezone handling: the local
-- wall-clock time is applied in the venue's timezone, so a session keeps its
-- 09:30 start across the October clock change rather than drifting to 08:30.
-- -----------------------------------------------------------------------------
insert into public.class_sessions
  (template_id, class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity)
select
  t.id,
  t.class_type_id,
  t.venue_id,
  t.instructor_id,
  ((d::date + t.start_time_local) at time zone v.timezone) as starts_at,
  ((d::date + t.start_time_local) at time zone v.timezone)
    + make_interval(mins => t.duration_mins) as ends_at,
  t.capacity
from public.schedule_templates t
join public.venues v on v.id = t.venue_id
cross join generate_series(current_date, current_date + interval '28 days', interval '1 day') as d
where extract(dow from d) = t.weekday
  and t.active
on conflict (template_id, starts_at) where template_id is not null do nothing;

-- -----------------------------------------------------------------------------
-- Products.
--
-- PRICES ARE INVENTED. Question B1 asks for the real ones. These exist so
-- Checkout can be built and tested at M4.
-- -----------------------------------------------------------------------------
insert into public.products
  (kind, name, slug, description, price_pence, credits, validity_days,
   billing_interval, credits_per_period, is_unlimited, max_bookings_per_day,
   includes_on_demand, intro_days_unlimited, sort_order)
values
  ('intro_offer', 'DEMO Intro Offer — first class', 'demo-intro-offer',
   'PLACEHOLDER PRICE. One per person.', 500, 1, 30, null, null, false, null, false, null, 1),

  ('drop_in', 'DEMO Drop-in', 'demo-drop-in',
   'PLACEHOLDER PRICE. A single class.', 1200, 1, 7, null, null, false, null, false, null, 2),

  ('pack', 'DEMO 5-class pack', 'demo-pack-5',
   'PLACEHOLDER PRICE. Five classes, expires 90 days after purchase.',
   5500, 5, 90, null, null, false, null, false, null, 3),

  ('pack', 'DEMO 10-class pack', 'demo-pack-10',
   'PLACEHOLDER PRICE. Ten classes, expires 120 days after purchase.',
   10000, 10, 120, null, null, false, null, false, null, 4),

  ('membership', 'DEMO Membership — 4 classes a month', 'demo-membership-4',
   'PLACEHOLDER PRICE. Four credits each month, plus the video library.',
   4000, null, null, 'month', 4, false, null, true, null, 5),

  ('membership', 'DEMO Membership — unlimited', 'demo-membership-unlimited',
   'PLACEHOLDER PRICE. As many classes as you like, plus the video library.',
   6500, null, null, 'month', null, true, 2, true, null, 6),

  ('on_demand', 'DEMO On-demand only', 'demo-on-demand',
   'PLACEHOLDER PRICE. The video library, no studio classes.',
   1000, null, null, 'month', null, false, null, true, null, 7);

-- -----------------------------------------------------------------------------
-- Video categories (brief §9)
-- -----------------------------------------------------------------------------
insert into public.video_categories (name, slug, sort_order) values
  ('Full class', 'full-class', 1),
  ('Express', 'express', 2),
  ('Arms', 'arms', 3),
  ('Legs & Glutes', 'legs-and-glutes', 4),
  ('Core', 'core', 5),
  ('Stretch', 'stretch', 6),
  ('Pre/Postnatal', 'pre-postnatal', 7),
  ('Beginner', 'beginner', 8);

-- -----------------------------------------------------------------------------
-- Waiver version.
--
-- DRAFT TEXT, NOT LEGAL ADVICE. Kelly's insurer very likely has required
-- wording; this must be reviewed before anybody signs it for real.
-- The full draft lands with the signing flow at M3.
-- -----------------------------------------------------------------------------
insert into public.waiver_versions (version_label, body_markdown, body_sha256, is_current, published_at)
values (
  'DRAFT-0.1',
  E'# Participation waiver (DRAFT)\n\n'
  '**DRAFT — to be reviewed against Kelly''s insurance policy and by a legal professional '
  'before it is used.**\n\n'
  'Placeholder text. The waiver wording, the health declaration and the limitation of '
  'liability all need review. See docs/03-OPEN-QUESTIONS.md section E.\n',
  encode(digest('DRAFT-0.1-placeholder', 'sha256'), 'hex'),
  true,
  now()
);

-- -----------------------------------------------------------------------------
-- FAQs — structure only. Answers that depend on Kelly's policies say so.
-- -----------------------------------------------------------------------------
insert into public.faqs (question, answer, category, sort_order) values
  ('Do I need any dance experience?',
   'None at all. Barre borrows the shapes of ballet but there is no choreography to learn and nobody is watching you.',
   'new', 1),
  ('What should I wear and bring?',
   'Leggings or shorts, a top you can move in, and grippy socks. Bring water. TODO: confirm whether mats are provided at each venue.',
   'new', 2),
  ('How far ahead can I book?',
   'TODO: generated from the booking_window_days setting once M2 renders this page from policy.',
   'booking', 3),
  ('What happens if I need to cancel?',
   'TODO: generated from the cancellation policy settings, so the answer can never drift from what the system actually does.',
   'booking', 4);
