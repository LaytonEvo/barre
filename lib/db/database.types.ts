/**
 * Supabase database types.
 *
 * HAND-MAINTAINED SUBSET. Replace wholesale with generated output once a local
 * Supabase instance is running:
 *
 *   supabase start
 *   npm run db:types
 *
 * It covers only the tables M1 code actually queries. Generating the full set
 * requires a live database, which CI does not have yet; this keeps `tsc` honest
 * in the meantime rather than papering over the gap with `any`.
 */

import type { AppRole } from './roles';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type Timestamped = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Timestamped & {
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string;
          phone: string | null;
          date_of_birth: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          marketing_consent: boolean;
          marketing_consent_at: string | null;
          email_normalised: string;
          phone_normalised: string | null;
          stripe_customer_id: string | null;
          notify_email: boolean;
          notify_sms: boolean;
          anonymised_at: string | null;
        };
        Insert: {
          id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
        };
        // Mirrors what the DATABASE permits, not what a member may change.
        // Restricting members is RLS's job, backed by the Zod schema on the
        // profile action; the service-role client legitimately writes
        // stripe_customer_id and anonymised_at. Narrowing the type instead would
        // have put the rule in the one layer an attacker never reaches.
        Update: Partial<{
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          phone_normalised: string | null;
          date_of_birth: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          marketing_consent: boolean;
          marketing_consent_at: string | null;
          notify_email: boolean;
          notify_sms: boolean;
          stripe_customer_id: string | null;
          anonymised_at: string | null;
        }>;
        Relationships: [];
      };

      user_roles: {
        Row: {
          user_id: string;
          role: AppRole;
          granted_by: string | null;
          granted_at: string;
        };
        Insert: { user_id: string; role: AppRole; granted_by?: string | null };
        Update: never;
        Relationships: [];
      };

      settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          confirmed: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
          confirmed?: boolean;
        };
        Update: Partial<{ value: Json; confirmed: boolean; updated_by: string | null }>;
        Relationships: [];
      };

      venues: {
        Row: Timestamped & {
          id: string;
          name: string;
          slug: string;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          county: string | null;
          postcode: string | null;
          latitude: number | null;
          longitude: number | null;
          timezone: string;
          parking_notes: string | null;
          access_notes: string | null;
          photo_paths: string[];
          default_capacity: number | null;
          active: boolean;
          sort_order: number;
        };
        Insert: { name: string; slug: string } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      class_types: {
        Row: Timestamped & {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          long_description: string | null;
          level: 'all_levels' | 'beginner' | 'improver' | 'advanced';
          intensity: number | null;
          default_duration_mins: number;
          colour_token: string;
          hero_image_path: string | null;
          what_to_bring: string | null;
          active: boolean;
          sort_order: number;
        };
        Insert: { name: string; slug: string; default_duration_mins: number } & Partial<
          Record<string, unknown>
        >;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      instructors: {
        Row: Timestamped & {
          id: string;
          profile_id: string | null;
          display_name: string;
          slug: string;
          bio: string | null;
          photo_path: string | null;
          qualifications: string[];
          active: boolean;
          sort_order: number;
        };
        Insert: { display_name: string; slug: string } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      schedule_templates: {
        Row: Timestamped & {
          id: string;
          class_type_id: string;
          venue_id: string;
          instructor_id: string;
          weekday: number;
          start_time_local: string;
          duration_mins: number;
          capacity: number;
          effective_from: string;
          effective_to: string | null;
          active: boolean;
        };
        Insert: {
          class_type_id: string;
          venue_id: string;
          instructor_id: string;
          weekday: number;
          start_time_local: string;
          duration_mins: number;
          capacity: number;
          effective_from: string;
        } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      video_categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          active: boolean;
        };
        Insert: { name: string; slug: string } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      videos: {
        Row: Timestamped & {
          id: string;
          mux_asset_id: string | null;
          mux_playback_id: string | null;
          mux_upload_id: string | null;
          mux_status: string;
          mux_error: string | null;
          title: string;
          slug: string;
          description: string | null;
          thumbnail_path: string | null;
          duration_secs: number | null;
          level: string;
          category_id: string | null;
          equipment: string[];
          instructor_id: string | null;
          safe_for_pregnancy: boolean;
          safety_note: string | null;
          publish_at: string | null;
          published: boolean;
        };
        Insert: { title: string; slug: string } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      video_progress: {
        Row: {
          user_id: string;
          video_id: string;
          position_secs: number;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: { user_id: string; video_id: string } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      video_favourites: {
        Row: { user_id: string; video_id: string; created_at: string };
        Insert: { user_id: string; video_id: string } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          before: Json | null;
          after: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: { action: string; entity: string } & Partial<Record<string, unknown>>;
        Update: never;
        Relationships: [];
      };

      class_sessions: {
        Row: Timestamped & {
          id: string;
          template_id: string | null;
          class_type_id: string;
          venue_id: string;
          instructor_id: string;
          starts_at: string;
          ends_at: string;
          capacity: number;
          status: 'scheduled' | 'cancelled';
          note: string | null;
          is_one_off: boolean;
          price_override_pence: number | null;
          cancelled_at: string | null;
          cancelled_reason: string | null;
          cancelled_by: string | null;
        };
        Insert: {
          class_type_id: string;
          venue_id: string;
          instructor_id: string;
          starts_at: string;
          ends_at: string;
          capacity: number;
        } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      purchases: {
        Row: Timestamped & {
          id: string;
          user_id: string;
          product_id: string;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          stripe_invoice_id: string | null;
          amount_pence: number;
          discount_pence: number;
          promo_code: string | null;
          voucher_id: string | null;
          status: 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'failed';
          purchased_at: string | null;
          refunded_at: string | null;
          refunded_pence: number;
        };
        Insert: {
          user_id: string;
          product_id: string;
          amount_pence: number;
        } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      memberships: {
        Row: Timestamped & {
          id: string;
          user_id: string;
          product_id: string;
          stripe_subscription_id: string;
          status:
            'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'incomplete_expired';
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          grace_until: string | null;
          cancelled_at: string | null;
        };
        Insert: {
          user_id: string;
          product_id: string;
          stripe_subscription_id: string;
          status: string;
        } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      stripe_events: {
        Row: {
          id: string;
          type: string;
          payload: Json;
          received_at: string;
          processed_at: string | null;
          error: string | null;
        };
        Insert: { id: string; type: string; payload: Json };
        Update: Partial<{ processed_at: string | null; error: string | null }>;
        Relationships: [];
      };

      intro_offer_claims: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          email_normalised: string;
          phone_normalised: string | null;
          card_fingerprint: string | null;
          purchase_id: string | null;
          claimed_at: string;
        };
        Insert: {
          user_id: string;
          product_id: string;
          email_normalised: string;
          phone_normalised?: string | null;
          card_fingerprint?: string | null;
          purchase_id?: string | null;
        };
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      credit_ledger: {
        Row: {
          id: string;
          user_id: string;
          delta: number;
          kind: string;
          reason: string | null;
          expires_at: string | null;
          purchase_id: string | null;
          membership_id: string | null;
          session_id: string | null;
          booking_id: string | null;
          voucher_id: string | null;
          source_entry_id: string | null;
          admin_id: string | null;
          created_at: string;
        };
        Insert: { user_id: string; delta: number; kind: string } & Partial<Record<string, unknown>>;
        Update: never;
        Relationships: [];
      };

      products: {
        Row: Timestamped & {
          id: string;
          kind: 'drop_in' | 'intro_offer' | 'pack' | 'membership' | 'on_demand' | 'voucher';
          name: string;
          slug: string;
          description: string | null;
          price_pence: number;
          currency: string;
          credits: number | null;
          validity_days: number | null;
          billing_interval: 'month' | 'year' | null;
          credits_per_period: number | null;
          rollover_cap: number | null;
          is_unlimited: boolean;
          max_bookings_per_day: number | null;
          includes_on_demand: boolean;
          intro_days_unlimited: number | null;
          stripe_product_id: string | null;
          stripe_price_id: string | null;
          active: boolean;
          sort_order: number;
        };
        Insert: { kind: string; name: string; slug: string; price_pence: number } & Partial<
          Record<string, unknown>
        >;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      faqs: {
        Row: Timestamped & {
          id: string;
          question: string;
          answer: string;
          category: string | null;
          sort_order: number;
          published: boolean;
        };
        Insert: { question: string; answer: string } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      reviews: {
        Row: {
          id: string;
          author_name: string;
          rating: number;
          body: string | null;
          reviewed_at: string | null;
          source: string;
          source_review_id: string | null;
          published: boolean;
          created_at: string;
        };
        Insert: { author_name: string; rating: number } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      waiver_signatures: {
        Row: {
          id: string;
          user_id: string;
          waiver_version_id: string;
          typed_name: string;
          signature_image_path: string;
          pdf_path: string | null;
          signed_at: string;
          ip_address: string | null;
          user_agent: string | null;
        };
        Insert: {
          user_id: string;
          waiver_version_id: string;
          typed_name: string;
          signature_image_path: string;
        } & Partial<Record<string, unknown>>;
        Update: never;
        Relationships: [];
      };

      health_questionnaires: {
        Row: {
          id: string;
          user_id: string;
          questionnaire_version: string;
          answers: Json;
          flagged: boolean;
          flag_summary: string | null;
          injuries_text: string | null;
          conditions_text: string | null;
          pregnancy_status: string | null;
          pregnancy_weeks: number | null;
          recent_surgery: boolean;
          explicit_consent_at: string;
          review_state: 'not_required' | 'awaiting_review' | 'reviewed';
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_note: string | null;
          completed_at: string;
          valid_until: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          questionnaire_version: string;
          answers: Json;
          explicit_consent_at: string;
          valid_until: string;
        } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      waiver_versions: {
        Row: {
          id: string;
          version_label: string;
          body_markdown: string;
          body_sha256: string;
          is_current: boolean;
          published_at: string | null;
          published_by: string | null;
          created_at: string;
        };
        Insert: {
          version_label: string;
          body_markdown: string;
          body_sha256: string;
        } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      enquiries: {
        Row: Timestamped & {
          id: string;
          kind: 'contact' | 'private_session' | 'event' | 'corporate';
          name: string;
          email: string;
          phone: string | null;
          message: string;
          status: 'new' | 'in_progress' | 'closed';
          assigned_to: string | null;
          admin_note: string | null;
          source_ip: string | null;
        };
        Insert: {
          name: string;
          email: string;
          message: string;
          kind?: 'contact' | 'private_session' | 'event' | 'corporate';
          phone?: string | null;
          source_ip?: string | null;
        };
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      newsletter_subscribers: {
        Row: {
          id: string;
          email: string;
          user_id: string | null;
          consent_at: string;
          source: string | null;
          unsubscribed_at: string | null;
          provider_id: string | null;
          synced_at: string | null;
          created_at: string;
        };
        Insert: { email: string; source?: string | null };
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      bookings: {
        Row: Timestamped & {
          id: string;
          session_id: string;
          user_id: string;
          status:
            | 'booked'
            | 'attended'
            | 'no_show_pending'
            | 'no_show'
            | 'cancelled_in_window'
            | 'cancelled_late';
          source: 'member' | 'admin' | 'walk_in' | 'waitlist';
          entitlement_kind: 'credit' | 'membership' | 'payment';
          ledger_entry_id: string | null;
          purchase_id: string | null;
          booked_at: string;
          cancelled_at: string | null;
          checked_in_at: string | null;
          marked_by: string | null;
        };
        Insert: {
          session_id: string;
          user_id: string;
          entitlement_kind: string;
        } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      waitlist_entries: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          status: 'waiting' | 'promoted' | 'notified' | 'left';
          joined_at: string;
          promoted_at: string | null;
          notified_at: string | null;
          left_at: string | null;
          booking_id: string | null;
        };
        Insert: { session_id: string; user_id: string };
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      notifications: {
        Row: {
          id: string;
          user_id: string | null;
          to_email: string | null;
          to_phone: string | null;
          channel: 'email' | 'sms';
          template: string;
          payload: Json;
          subject_type: string | null;
          subject_id: string | null;
          scheduled_for: string;
          sent_at: string | null;
          status: 'queued' | 'sent' | 'failed' | 'cancelled' | 'skipped';
          provider_message_id: string | null;
          error: string | null;
          attempts: number;
          created_at: string;
        };
        Insert: { template: string } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };

      announcements: {
        Row: {
          id: string;
          body: string;
          link_href: string | null;
          link_label: string | null;
          starts_at: string;
          ends_at: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: { body: string } & Partial<Record<string, unknown>>;
        Update: Partial<Record<string, unknown>>;
        Relationships: [];
      };
    };

    Views: {
      session_availability: {
        Row: {
          session_id: string;
          capacity: number;
          booked_count: number;
          spaces_left: number;
          waitlist_count: number;
        };
        Relationships: [];
      };
      member_onboarding_status: {
        Row: {
          user_id: string;
          current_waiver_signed: boolean;
          parq_valid: boolean;
          parq_completed_at: string | null;
        };
        Relationships: [];
      };
    };

    Functions: {
      credit_balance: {
        Args: { p_user_id: string };
        Returns: number;
      };
      generate_class_sessions: {
        Args: { p_weeks_ahead?: number; p_from?: string };
        Returns: { created: number; skipped: number }[];
      };
      grant_credits: {
        Args: {
          p_user_id: string;
          p_quantity: number;
          p_kind: string;
          p_expires_at?: string | null;
          p_purchase_id?: string | null;
          p_membership_id?: string | null;
          p_voucher_id?: string | null;
          p_admin_id?: string | null;
          p_reason?: string | null;
        };
        Returns: string;
      };
      consume_credits: {
        Args: {
          p_user_id: string;
          p_quantity: number;
          p_kind?: string;
          p_booking_id?: string | null;
          p_session_id?: string | null;
          p_admin_id?: string | null;
          p_reason?: string | null;
        };
        Returns: string[];
      };
      refund_booking_credits: {
        Args: { p_booking_id: string; p_kind?: string; p_reason?: string | null };
        Returns: string[];
      };
      expire_credits: { Args: Record<string, never>; Returns: number };
      book_session: {
        Args: { p_session_id: string; p_user_id?: string; p_source?: string };
        Returns: string;
      };
      cancel_booking: {
        Args: { p_booking_id: string; p_user_id?: string };
        Returns: { outcome: 'cancelled_in_window' | 'cancelled_late'; credit_returned: boolean }[];
      };
      join_waitlist: {
        Args: { p_session_id: string; p_user_id?: string };
        Returns: number;
      };
      leave_waitlist: {
        Args: { p_session_id: string; p_user_id?: string };
        Returns: undefined;
      };
      cancel_session: { Args: { p_session_id: string; p_reason: string }; Returns: number };
      mark_attendance: { Args: { p_booking_id: string; p_status: string }; Returns: undefined };
      auto_mark_no_shows: { Args: Record<string, never>; Returns: number };
      confirm_pending_no_shows: { Args: Record<string, never>; Returns: number };
      publish_waiver_version: {
        Args: { p_version_label: string; p_body_markdown: string; p_body_sha256: string };
        Returns: string;
      };
      export_member_data: { Args: { p_user_id?: string }; Returns: Json };
      anonymise_member: { Args: { p_user_id: string; p_reason?: string }; Returns: undefined };
      register_for_session: {
        Args: { p_session_id: string };
        Returns: {
          booking_id: string;
          user_id: string;
          full_name: string | null;
          initials: string | null;
          status:
            | 'booked'
            | 'attended'
            | 'no_show_pending'
            | 'no_show'
            | 'cancelled_in_window'
            | 'cancelled_late';
          source: 'member' | 'admin' | 'walk_in' | 'waitlist';
          entitlement_kind: string;
          is_first_class: boolean;
          attended_count: number;
          health_flagged: boolean;
          health_summary: string | null;
          health_reviewed: boolean;
          waiver_signed: boolean;
          emergency_contact: string | null;
        }[];
      };
      admin_today: {
        Args: { p_date?: string | null };
        Returns: {
          session_id: string;
          starts_at: string;
          ends_at: string;
          class_name: string;
          venue_name: string;
          instructor: string;
          capacity: number;
          booked: number;
          waitlist: number;
          first_timers: number;
          flagged: number;
          status: 'scheduled' | 'cancelled';
          all_marked: boolean;
        }[];
      };
      admin_search_members: {
        Args: { p_query?: string | null };
        Returns: {
          user_id: string;
          full_name: string | null;
          email: string;
          phone: string | null;
          credits: number;
          attended: number;
          last_booking: string | null;
          health_flagged: boolean;
          waiver_signed: boolean;
          anonymised: boolean;
        }[];
      };
      admin_adjust_credits: {
        Args: { p_user_id: string; p_delta: number; p_reason: string };
        Returns: number;
      };
      admin_set_session_capacity: {
        Args: { p_session_id: string; p_capacity: number };
        Returns: undefined;
      };
      admin_set_setting: {
        Args: { p_key: string; p_value: Json; p_confirmed?: boolean };
        Returns: undefined;
      };
      report_attendance: {
        Args: { p_weeks?: number };
        Returns: {
          week_starting: string;
          sessions: number;
          capacity: number;
          booked: number;
          attended: number;
          no_shows: number;
          fill_rate: number;
        }[];
      };
      report_revenue: {
        Args: { p_months?: number };
        Returns: {
          month: string;
          product_name: string;
          purchases: number;
          gross_pence: number;
          refunded_pence: number;
          net_pence: number;
        }[];
      };
      report_at_risk: {
        Args: { p_days?: number };
        Returns: {
          user_id: string;
          full_name: string | null;
          email: string;
          last_class: string;
          days_since: number;
          attended_total: number;
          credits: number;
          marketing_ok: boolean;
        }[];
      };
      promote_from_waitlist: { Args: { p_session_id: string }; Returns: string | null };

      // --- Video library (M7) ---
      can_watch_videos: { Args: { p_user_id?: string }; Returns: boolean };
      live_membership: {
        Args: { p_user_id: string };
        Returns: {
          membership_id: string;
          product_id: string;
          product_kind: string;
          status: string;
          is_unlimited: boolean;
          max_bookings_per_day: number | null;
          includes_on_demand: boolean;
          current_period_end: string | null;
        }[];
      };
      video_library: {
        Args: {
          p_category?: string | null;
          p_length?: string | null;
          p_level?: string | null;
          p_equipment?: string[] | null;
          p_favourites?: boolean;
          p_pregnancy?: boolean;
        };
        Returns: {
          id: string;
          title: string;
          slug: string;
          description: string | null;
          thumbnail_path: string | null;
          duration_secs: number | null;
          level: string;
          category_name: string | null;
          category_slug: string | null;
          equipment: string[];
          instructor_name: string | null;
          safe_for_pregnancy: boolean;
          safety_note: string | null;
          publish_at: string | null;
          is_new: boolean;
          position_secs: number;
          completed_at: string | null;
          is_favourite: boolean;
        }[];
      };
      continue_watching: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          title: string;
          slug: string;
          thumbnail_path: string | null;
          duration_secs: number | null;
          position_secs: number;
          percent: number;
        }[];
      };
      video_playback_grant: {
        Args: { p_video_id: string };
        Returns: {
          playback_id: string;
          title: string;
          duration_secs: number | null;
          position_secs: number;
        }[];
      };
      save_video_progress: {
        Args: { p_video_id: string; p_position_secs: number; p_completed?: boolean };
        Returns: undefined;
      };
      toggle_video_favourite: { Args: { p_video_id: string }; Returns: boolean };
      admin_create_video_draft: { Args: { p_title: string; p_upload_id: string }; Returns: string };
      attach_mux_asset: {
        Args: {
          p_upload_id: string;
          p_asset_id: string;
          p_playback_id: string;
          p_duration_secs?: number | null;
        };
        Returns: string | null;
      };
      mark_mux_errored: { Args: { p_upload_id: string; p_error: string }; Returns: undefined };
      admin_update_video: {
        Args: {
          p_video_id: string;
          p_title?: string | null;
          p_description?: string | null;
          p_category_slug?: string | null;
          p_level?: string | null;
          p_equipment?: string[] | null;
          p_instructor_id?: string | null;
          p_safe_for_pregnancy?: boolean | null;
          p_safety_note?: string | null;
        };
        Returns: undefined;
      };
      admin_set_video_published: {
        Args: { p_video_id: string; p_published: boolean; p_publish_at?: string | null };
        Returns: undefined;
      };
      admin_videos: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          title: string;
          slug: string;
          category_name: string | null;
          duration_secs: number | null;
          level: string;
          mux_status: string;
          mux_error: string | null;
          published: boolean;
          publish_at: string | null;
          watchers: number;
          created_at: string;
        }[];
      };
      report_popular_videos: {
        Args: { p_months?: number };
        Returns: {
          title: string;
          category: string;
          started: number;
          completed: number;
          completion_rate: number;
        }[];
      };
    };

    Enums: {
      app_role: AppRole;
    };

    CompositeTypes: Record<never, never>;
  };
};
