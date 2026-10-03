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
        Update: Partial<{
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          date_of_birth: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          marketing_consent: boolean;
          marketing_consent_at: string | null;
          notify_email: boolean;
          notify_sms: boolean;
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
    };

    Enums: {
      app_role: AppRole;
    };

    CompositeTypes: Record<never, never>;
  };
};
