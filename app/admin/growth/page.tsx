import type { Metadata } from 'next';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { PromoForm, RetirePromoButton } from '@/components/admin/promo-form';
import { formatUkDate } from '@/lib/time';
import { formatPence } from '@/lib/utils';
import { isEmailConfigured } from '@/lib/email/client';
import { isEmailLinkSigningConfigured } from '@/lib/email/links';
import { isSmsConfigured } from '@/lib/sms/send';

export const metadata: Metadata = { title: 'Growth', robots: { index: false } };

export default async function GrowthPage() {
  await requireRole('admin');
  const supabase = await createClient();

  const [{ data: vouchers }, { data: promos }, { data: queue }, { data: smsFlag }] =
    await Promise.all([
      supabase.rpc('admin_vouchers'),
      supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
      // A count per status, so "nothing is sending" is visible at a glance rather
      // than something Kelly has to ask about.
      supabase.from('notifications').select('status').limit(2000),
      supabase.from('settings').select('value').eq('key', 'feature_sms_enabled').maybeSingle(),
    ]);

  const counts = (queue ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  const smsOn = smsFlag?.value === true || smsFlag?.value === 'true';

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <h1 className="text-[length:var(--text-2xl)]">Growth</h1>

      {/* --- Email status ----------------------------------------------------- */}
      <section className="mt-8">
        <h2 className="text-[length:var(--text-xl)]">Email</h2>

        {!isEmailConfigured() ? (
          <Notice tone="warn">
            Email is not configured, so nothing is being sent — confirmations and reminders are
            queueing up. Add <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code>.
          </Notice>
        ) : !isEmailLinkSigningConfigured() ? (
          <Notice tone="warn">
            Transactional email works, but marketing email (win-backs, review requests) is being
            skipped: there is no <code>EMAIL_LINK_SECRET</code>, so no valid unsubscribe link can be
            made. That is deliberate — a marketing email legally needs a working opt-out.
          </Notice>
        ) : (
          <Notice tone="ok">Email is configured and sending.</Notice>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(['queued', 'sending', 'sent', 'failed', 'skipped'] as const).map((status) => (
            <div key={status} className="border-subtle bg-surface rounded-lg border p-3">
              <dt className="text-muted text-xs capitalize">{status}</dt>
              <dd className="text-primary tabular text-[length:var(--text-xl)] font-semibold">
                {counts[status] ?? 0}
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-muted mt-2 text-xs">
          <strong>Skipped</strong> is not a problem: it is mostly marketing email to people who have
          not opted in. <strong>Failed</strong> means three attempts did not get through.
        </p>
      </section>

      {/* --- SMS -------------------------------------------------------------- */}
      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Text messages</h2>
        <p className="text-muted mt-2 max-w-[60ch] text-sm">
          Off unless both switches are on: the <code>feature_sms_enabled</code> setting, and Twilio
          credentials. Texts cost money per message, so this stays off until you want it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={smsOn ? 'open' : 'neutral'}>Setting: {smsOn ? 'on' : 'off'}</Badge>
          <Badge tone={isSmsConfigured() ? 'open' : 'neutral'}>
            Twilio: {isSmsConfigured() ? 'configured' : 'not configured'}
          </Badge>
        </div>
      </section>

      {/* --- Promo codes ------------------------------------------------------ */}
      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Promo codes</h2>
        <p className="text-muted mt-2 max-w-[60ch] text-sm">
          Created in Stripe and applied at checkout, so the discount is worked out by the same
          system that takes the money.
        </p>

        <PromoForm />

        {(promos ?? []).length > 0 ? (
          <ul className="mt-5 grid gap-2">
            {(promos ?? []).map((promo) => (
              <li
                key={promo.id}
                className="border-subtle bg-surface flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="text-primary font-mono font-medium">{promo.code}</p>
                  <p className="text-muted">
                    {promo.percent_off
                      ? `${promo.percent_off}% off`
                      : `${formatPence(promo.amount_off_pence ?? 0)} off`}
                    {promo.max_redemptions
                      ? ` · ${promo.times_redeemed}/${promo.max_redemptions} used`
                      : ` · ${promo.times_redeemed} used`}
                    {promo.expires_at ? ` · until ${formatUkDate(promo.expires_at)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={promo.active ? 'open' : 'cancelled'}>
                    {promo.active ? 'Live' : 'Retired'}
                  </Badge>
                  {promo.active ? <RetirePromoButton id={promo.id} code={promo.code} /> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* --- Gift vouchers ---------------------------------------------------- */}
      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Gift vouchers</h2>
        <p className="text-muted mt-2 max-w-[60ch] text-sm">
          Mostly here so you can answer &ldquo;did my friend get it?&rdquo; without guessing.
        </p>

        {(vouchers ?? []).length === 0 ? (
          <p className="text-muted mt-4 text-sm">None bought yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="pb-2 font-medium">Code</th>
                  <th className="pb-2 font-medium">For</th>
                  <th className="pb-2 text-right font-medium">Classes</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(vouchers ?? []).map((voucher) => (
                  <tr key={voucher.id}>
                    <td className="border-subtle border-b py-2 font-mono text-xs">
                      {voucher.code}
                    </td>
                    <td className="border-subtle border-b py-2">{voucher.recipient_email}</td>
                    <td className="border-subtle tabular border-b py-2 text-right">
                      {voucher.credits ?? '—'}
                    </td>
                    <td className="border-subtle border-b py-2">
                      {voucher.redeemed_at ? (
                        <Badge tone="open">Used {formatUkDate(voucher.redeemed_at)}</Badge>
                      ) : voucher.sent_at ? (
                        <Badge tone="waitlist">Sent {formatUkDate(voucher.sent_at)}</Badge>
                      ) : (
                        <Badge tone="nearly">Sends {formatUkDate(voucher.send_at)}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'warn' }) {
  return (
    <div
      className={`mt-4 rounded-lg p-4 ${tone === 'ok' ? 'bg-status-open-bg' : 'bg-status-nearly-bg'}`}
    >
      <p className="text-primary text-sm">{children}</p>
    </div>
  );
}
