import { z } from 'zod';

/**
 * Shape of every row in the `settings` table.
 *
 * Working rule: business rules live in one place, driven by the database. No
 * component may read a policy number directly, and no policy number is a
 * literal in application code.
 */
export const policySchema = z.object({
  // Cancellation and attendance
  cancellation_window_hours: z.number().int().nonnegative(),
  late_cancel_penalty: z.enum(['forfeit_credit', 'fee', 'none']),
  late_cancel_fee_pence: z.number().int().nonnegative(),
  no_show_penalty: z.enum(['forfeit_credit', 'fee', 'none']),
  no_show_auto_mark_mins: z.number().int().nonnegative(),
  no_show_auto_mark_requires_confirmation: z.boolean(),

  // Booking
  booking_window_days: z.number().int().positive(),
  waitlist_cutoff_hours: z.number().int().nonnegative(),
  session_generation_weeks_ahead: z.number().int().positive(),

  // Credits
  credit_expiry_warning_days: z.array(z.number().int().positive()),
  membership_credit_rollover: z.enum(['expire', 'rollover']),
  membership_rollover_cap: z.number().int().nonnegative(),
  membership_grace_period_days: z.number().int().nonnegative(),

  // Reminders
  reminder_offsets_hours: z.array(z.number().int().nonnegative()),

  // Eligibility
  intro_offer_block_on_card_fingerprint: z.boolean(),
  pack_holders_get_video_access: z.boolean(),

  // Money
  vat_registered: z.boolean(),
  currency: z.string(),
  class_cancelled_default_remedy: z.enum(['refund', 'credit']),

  // Identity. Empty string means "not supplied" — the UI hides rather than
  // rendering a placeholder as though it were real.
  business_name: z.string(),
  contact_email: z.string(),
  contact_phone: z.string(),
  instagram_handle: z.string(),
  facebook_url: z.string(),
  primary_town: z.string(),

  // Features
  feature_sms_enabled: z.boolean(),
  feature_waitlist_enabled: z.boolean(),
  feature_vouchers_enabled: z.boolean(),
});

export type Policy = z.infer<typeof policySchema>;
export type PolicyKey = keyof Policy;
