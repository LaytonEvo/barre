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
  'DRAFT-0.2',
  $waiver$# Participation agreement

**DRAFT — not yet reviewed. Do not publish.**

## What barre involves

Barre is a physical exercise class. It combines ballet-inspired movement, Pilates,
yoga and resistance work, usually holding a barre or a sturdy chair for balance.
It is low impact, but it is still exercise, and like any exercise it carries a
risk of injury.

## Your health

You confirm that:

- You are not aware of any medical reason why you should not take part in
  physical exercise.
- You have told us about any injury, illness, surgery, pregnancy or condition
  that might affect your participation, by completing the health questions.
- You will tell Kelly if any of that changes.
- You have spoken to your GP first if you had any doubt.

If you are pregnant or recently postnatal, please speak to Kelly before your
first class and check with your midwife or GP.

## During class

You agree to:

- Work at a level that is right for you, and stop if something hurts.
- Follow Kelly's instructions, including when she suggests an easier option.
- Tell Kelly straight away if you feel unwell or are in pain.

You take part voluntarily and at your own pace. Nobody will push you to continue
if you want to stop.

## Our responsibility

Kelly holds public liability insurance and a current first aid qualification.
We take reasonable care to run classes safely and to keep the venue in a safe
condition.

Nothing in this agreement limits our liability for death or personal injury
caused by our negligence, or for anything else that cannot be limited by law.

## Your belongings

Please do not bring valuables. We cannot accept responsibility for personal
property brought to a class.

## Photographs

We sometimes take photographs or video in class for social media. You can say no,
at any time, and it will make no difference to anything. Tell Kelly and she will
make sure you are not in them.

## Your information

How we handle your personal information, including the health questions, is set
out in our privacy policy. The health answers are only visible to Kelly.

## Agreement

By signing you confirm that you have read and understood this agreement, that
the information you have given is accurate, and that you take part voluntarily.
$waiver$,
  encode(digest($waiver$# Participation agreement

**DRAFT — not yet reviewed. Do not publish.**

## What barre involves

Barre is a physical exercise class. It combines ballet-inspired movement, Pilates,
yoga and resistance work, usually holding a barre or a sturdy chair for balance.
It is low impact, but it is still exercise, and like any exercise it carries a
risk of injury.

## Your health

You confirm that:

- You are not aware of any medical reason why you should not take part in
  physical exercise.
- You have told us about any injury, illness, surgery, pregnancy or condition
  that might affect your participation, by completing the health questions.
- You will tell Kelly if any of that changes.
- You have spoken to your GP first if you had any doubt.

If you are pregnant or recently postnatal, please speak to Kelly before your
first class and check with your midwife or GP.

## During class

You agree to:

- Work at a level that is right for you, and stop if something hurts.
- Follow Kelly's instructions, including when she suggests an easier option.
- Tell Kelly straight away if you feel unwell or are in pain.

You take part voluntarily and at your own pace. Nobody will push you to continue
if you want to stop.

## Our responsibility

Kelly holds public liability insurance and a current first aid qualification.
We take reasonable care to run classes safely and to keep the venue in a safe
condition.

Nothing in this agreement limits our liability for death or personal injury
caused by our negligence, or for anything else that cannot be limited by law.

## Your belongings

Please do not bring valuables. We cannot accept responsibility for personal
property brought to a class.

## Photographs

We sometimes take photographs or video in class for social media. You can say no,
at any time, and it will make no difference to anything. Tell Kelly and she will
make sure you are not in them.

## Your information

How we handle your personal information, including the health questions, is set
out in our privacy policy. The health answers are only visible to Kelly.

## Agreement

By signing you confirm that you have read and understood this agreement, that
the information you have given is accurate, and that you take part voluntarily.
$waiver$, 'sha256'), 'hex'),
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
