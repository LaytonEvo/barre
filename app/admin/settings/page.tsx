import type { Metadata } from 'next';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { SettingRow } from '@/components/admin/setting-row';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false } };

/** Grouped so the policy numbers Kelly actually cares about come first. */
const GROUPS: { title: string; blurb: string; keys: string[] }[] = [
  {
    title: 'Cancelling and attendance',
    blurb:
      'These drive both what the system does and what members read on the cancellation policy page — there is only one copy of each number, so the two can never disagree.',
    keys: [
      'cancellation_window_hours',
      'late_cancel_penalty',
      'late_cancel_fee_pence',
      'no_show_penalty',
      'no_show_auto_mark_mins',
      'no_show_auto_mark_requires_confirmation',
    ],
  },
  {
    title: 'Booking',
    blurb: 'How far ahead classes open, and how the waitlist behaves.',
    keys: ['booking_window_days', 'waitlist_cutoff_hours', 'session_generation_weeks_ahead'],
  },
  {
    title: 'Credits and memberships',
    blurb: 'Expiry warnings, rollover, and the grace period after a failed payment.',
    keys: [
      'credit_expiry_warning_days',
      'membership_credit_rollover',
      'membership_rollover_cap',
      'membership_grace_period_days',
      'pack_expiry_days_note',
    ],
  },
  {
    title: 'Money',
    blurb: 'VAT and what happens when a class is cancelled.',
    keys: ['vat_registered', 'currency', 'class_cancelled_default_remedy'],
  },
  {
    title: 'Contact and identity',
    blurb: 'Empty values are hidden on the site rather than shown as placeholders.',
    keys: [
      'business_name',
      'contact_email',
      'contact_phone',
      'instagram_handle',
      'facebook_url',
      'primary_town',
    ],
  },
  {
    title: 'Features',
    blurb: 'Switches for things that are built but not necessarily wanted yet.',
    keys: [
      'feature_sms_enabled',
      'feature_waitlist_enabled',
      'feature_vouchers_enabled',
      'intro_offer_block_on_card_fingerprint',
      'pack_holders_get_video_access',
      'reminder_offsets_hours',
    ],
  },
];

export default async function SettingsPage() {
  await requireRole('admin');
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from('settings')
    .select('key, value, description, confirmed, updated_at');

  const byKey = new Map((settings ?? []).map((row) => [row.key, row]));
  const unconfirmed = (settings ?? []).filter((row) => !row.confirmed);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8">
      <h1 className="text-[length:var(--text-2xl)]">Settings</h1>

      {unconfirmed.length > 0 ? (
        <div className="bg-status-nearly-bg mt-6 rounded-lg p-4">
          <Badge tone="nearly">{unconfirmed.length} not yet confirmed</Badge>
          <p className="text-primary mt-2 max-w-[60ch] text-sm">
            These are placeholder values nobody has signed off. Saving one marks it confirmed and
            removes it from this list.
          </p>
        </div>
      ) : (
        <p className="text-muted mt-4 text-sm">Everything is confirmed.</p>
      )}

      <div className="mt-8 grid gap-10">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="text-[length:var(--text-xl)]">{group.title}</h2>
            <p className="text-muted mt-1 max-w-[60ch] text-sm">{group.blurb}</p>

            <ul className="mt-4 grid gap-3">
              {group.keys.map((key) => {
                const setting = byKey.get(key);
                if (!setting) return null;
                return (
                  <li key={key}>
                    <SettingRow
                      settingKey={key}
                      value={JSON.stringify(setting.value)}
                      description={setting.description}
                      confirmed={setting.confirmed}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
