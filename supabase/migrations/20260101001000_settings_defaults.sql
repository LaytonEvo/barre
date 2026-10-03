-- =============================================================================
-- Default settings.
--
-- IMPORTANT: every row below is inserted with confirmed = false.
--
-- Section 0 of the build brief was unfilled, so these are NOT Kelly's policies.
-- The numeric values are the "e.g." figures from the brief itself, used so the
-- system is functional in development. Each one must be confirmed before launch;
-- the admin settings screen lists unconfirmed rows, and docs/03-OPEN-QUESTIONS.md
-- tracks them as questions C1-C7.
-- =============================================================================

insert into public.settings (key, value, description, confirmed) values

  -- Cancellation and attendance ------------------------------------------------
  ('cancellation_window_hours', '12',
   'Hours before a class that a cancellation still returns the credit. PLACEHOLDER - see question C1.', false),

  ('late_cancel_penalty', '"forfeit_credit"',
   'One of: forfeit_credit, fee, none. PLACEHOLDER - see question C2.', false),

  ('late_cancel_fee_pence', '0',
   'Charged to a membership holder''s saved card on a late cancel, if late_cancel_penalty is "fee". PLACEHOLDER - C2.', false),

  ('no_show_penalty', '"forfeit_credit"',
   'One of: forfeit_credit, fee, none. PLACEHOLDER - see question C3.', false),

  ('no_show_auto_mark_mins', '30',
   'Minutes after class start to auto-mark an unchecked-in booking. PLACEHOLDER - C3.', false),

  ('no_show_auto_mark_requires_confirmation', 'true',
   'When true the auto-mark creates no_show_pending for Kelly to confirm, so a forgotten check-in does not silently penalise a member who attended. See docs/03 §F1 — awaiting Layton''s decision.', false),

  -- Booking --------------------------------------------------------------------
  ('booking_window_days', '14',
   'How far ahead classes open for booking. PLACEHOLDER - see question C4.', false),

  ('waitlist_cutoff_hours', '2',
   'Stop auto-promoting from the waitlist this many hours before a class. PLACEHOLDER - C5.', false),

  ('session_generation_weeks_ahead', '8',
   'Rolling window the cron generates sessions for. Must exceed booking_window_days.', true),

  -- Credits --------------------------------------------------------------------
  ('credit_expiry_warning_days', '[7, 1]',
   'Send expiry warnings this many days before credits expire.', true),

  ('membership_credit_rollover', '"expire"',
   'One of: expire, rollover. PLACEHOLDER - see question C7.', false),

  ('membership_rollover_cap', '0',
   'Maximum credits carried into the next period when rollover is enabled. PLACEHOLDER - C7.', false),

  ('membership_grace_period_days', '7',
   'Days after a failed payment before bookings are blocked. Dunning emails go out during this window.', false),

  -- Reminders ------------------------------------------------------------------
  ('reminder_offsets_hours', '[24, 2]',
   'Send class reminders this many hours before start.', true),

  -- Intro offer ----------------------------------------------------------------
  ('intro_offer_block_on_card_fingerprint', 'true',
   'Block a repeat intro offer on a matching card fingerprint. False flags for review instead. PLACEHOLDER - see question B4.', false),

  -- Entitlements ---------------------------------------------------------------
  ('pack_holders_get_video_access', 'false',
   'Whether an active pack grants on-demand video access. PLACEHOLDER - see question B5.', false),

  -- Money ---------------------------------------------------------------------
  ('vat_registered', 'false',
   'When true, prices display inclusive of VAT. PLACEHOLDER - see question B2.', false),

  ('currency', '"GBP"', 'Trading currency.', true),

  ('class_cancelled_default_remedy', '"refund"',
   'What a drop-in payer gets by default when Kelly cancels a class: refund or credit. They can choose the other. PLACEHOLDER - see question C8.', false),

  -- Business identity ---------------------------------------------------------
  -- Deliberately empty rather than guessed. Nothing in the UI may render a
  -- placeholder here as if it were real: the components treat empty as "hide".
  ('business_name', '"Barre By Kelly"', 'Trading name.', true),
  ('contact_email', '""', 'TODO - question A6.', false),
  ('contact_phone', '""', 'TODO - question A6.', false),
  ('instagram_handle', '""', 'TODO - question A6.', false),
  ('facebook_url', '"https://www.facebook.com/barrebykelly"', 'From the brief.', true),
  ('primary_town', '""',
   'TODO - question A1. Blocks local SEO: page titles, JSON-LD and "barre classes [town]" targeting all depend on it.', false),

  -- Features ------------------------------------------------------------------
  ('feature_sms_enabled', 'false', 'Twilio reminders. Off until Kelly asks for it.', true),
  ('feature_waitlist_enabled', 'true', 'Waitlists on full classes.', true),
  ('feature_vouchers_enabled', 'true', 'Gift voucher sales.', true);

comment on column public.settings.confirmed is
  'False = placeholder nobody has signed off. Surfaced in the admin UI and checked by the launch readiness script at M9.';
