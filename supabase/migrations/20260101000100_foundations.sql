-- =============================================================================
-- Foundations: extensions, enums, helper functions, shared triggers.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------------------
-- Enums. Every one of these is referenced in docs/01-DATA-MODEL.md.
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'instructor', 'member');

create type public.session_status as enum ('scheduled', 'cancelled');

create type public.booking_status as enum (
  'booked',
  'attended',
  'no_show_pending',  -- auto-marked, awaiting Kelly's confirmation (see docs/03 §F1)
  'no_show',
  'cancelled_in_window',
  'cancelled_late'
);

create type public.booking_source as enum ('member', 'admin', 'walk_in', 'waitlist');

create type public.waitlist_status as enum ('waiting', 'promoted', 'notified', 'left');

create type public.product_kind as enum (
  'drop_in',
  'intro_offer',
  'pack',
  'membership',
  'on_demand',
  'voucher'
);

create type public.purchase_status as enum ('pending', 'paid', 'refunded', 'partially_refunded', 'failed');

create type public.membership_status as enum (
  'trialing', 'active', 'past_due', 'paused', 'cancelled', 'incomplete_expired'
);

-- The full set of reasons a credit balance can move. Adding a kind here is a
-- deliberate act: every kind needs a unit test (docs/01 §Invariants).
create type public.ledger_kind as enum (
  'purchase',
  'booking_debit',
  'cancel_refund',
  'late_cancel_forfeit',
  'no_show_forfeit',
  'expiry',
  'admin_adjustment',
  'voucher_redeem',
  'membership_grant',
  'class_cancelled_refund'
);

create type public.voucher_kind as enum ('monetary', 'pack');

create type public.class_level as enum ('all_levels', 'beginner', 'improver', 'advanced');

create type public.parq_review_state as enum ('not_required', 'awaiting_review', 'reviewed');

create type public.enquiry_kind as enum ('contact', 'private_session', 'event', 'corporate');

create type public.enquiry_status as enum ('new', 'in_progress', 'closed');

create type public.notification_channel as enum ('email', 'sms');

create type public.notification_status as enum ('queued', 'sent', 'failed', 'cancelled', 'skipped');

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Append-only enforcement.
--
-- Used by credit_ledger and waiver_signatures. These two tables are the
-- financial and legal records respectively; nothing may rewrite history, not
-- even an admin, not even the service role. A correction is a new row.
-- -----------------------------------------------------------------------------
create or replace function public.tg_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    '% is append-only: % is not permitted. Record a compensating row instead.',
    tg_table_name, tg_op;
end;
$$;
