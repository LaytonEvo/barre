-- =============================================================================
-- DEVELOPMENT SEED — dev-only data, safe to re-run.
--
-- The real business configuration (venues, class type, timetable, products,
-- settings) now lives in migration 20260105000200_business_data.sql, because it
-- is production data rather than test fixtures. This file only adds the things
-- that must not exist in production.
--
-- `supabase db reset` runs this after the migrations.
--
-- Deliberately NOT seeded:
--   reviews  - fabricating a testimonial would be lying to customers. The
--              homepage renders an empty state until real Google reviews exist.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Concrete sessions for the booking window.
--
-- Uses the same function the pg_cron job will call, so a developer's timetable
-- is generated exactly the way production's is.
-- -----------------------------------------------------------------------------
select * from public.generate_class_sessions();

-- -----------------------------------------------------------------------------
-- Draft waiver.
--
-- DRAFT TEXT, NOT LEGAL ADVICE. Kelly's insurer very likely has required
-- wording. The signing flow and the full draft land at M3; this exists so the
-- onboarding gate has a current version to check against.
-- -----------------------------------------------------------------------------
insert into public.waiver_versions
  (version_label, body_markdown, body_sha256, is_current, published_at)
select
  'DRAFT-0.1',
  E'# Participation waiver (DRAFT)\n\n'
  '**DRAFT — to be reviewed against Kelly''s insurance policy and by a legal '
  'professional before anybody signs it.**\n\n'
  'Placeholder text. The waiver wording, the health declaration and the '
  'limitation of liability all need review. See docs/03-OPEN-QUESTIONS.md '
  'section E.\n',
  encode(digest('DRAFT-0.1-placeholder', 'sha256'), 'hex'),
  true,
  now()
where not exists (select 1 from public.waiver_versions);

-- -----------------------------------------------------------------------------
-- A couple of FAQ rows so /faq has something to render in development.
-- The booking and cancellation answers are generated from policy at runtime,
-- not stored, so they are not duplicated here.
-- -----------------------------------------------------------------------------
insert into public.faqs (question, answer, category, sort_order)
select * from (values
  ('Do I need any dance experience?',
   'None at all. Barre borrows the shapes of ballet, but there is no choreography to learn and nobody is watching you.',
   'new-here', 1),
  ('What should I wear?',
   'Leggings or shorts and a top you can move in. Grippy socks are ideal — bare feet are fine too.',
   'new-here', 2),
  ('Can I come if I am pregnant or recently postnatal?',
   'Often yes, with modifications, but please speak to Kelly before booking and check with your midwife or GP.',
   'health', 3)
) as v(question, answer, category, sort_order)
where not exists (select 1 from public.faqs);
