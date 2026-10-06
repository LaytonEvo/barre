import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { formatPence } from '@/lib/utils';
import { formatUkDate } from '@/lib/time';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { BillingPortalButton } from './portal-button';

export const metadata: Metadata = { title: 'Billing', robots: { index: false } };

const LEDGER_LABELS: Record<string, string> = {
  purchase: 'Bought',
  booking_debit: 'Class booked',
  cancel_refund: 'Class cancelled',
  late_cancel_forfeit: 'Late cancellation',
  no_show_forfeit: 'Did not attend',
  expiry: 'Expired',
  admin_adjustment: 'Adjustment',
  voucher_redeem: 'Voucher',
  membership_grant: 'Membership credits',
  class_cancelled_refund: 'Class cancelled by us',
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const user = await requireUser('/account/billing');
  const { purchase } = await searchParams;
  const supabase = await createClient();

  // All three read only this member's rows — RLS enforces it in the database,
  // not just the .eq() below.
  const [{ data: balance }, { data: purchases }, { data: ledger }] = await Promise.all([
    supabase.rpc('credit_balance', { p_user_id: user.id }),
    supabase
      .from('purchases')
      .select('id, product_id, amount_pence, status, purchased_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('credit_ledger')
      .select('id, delta, kind, reason, expires_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Product names are fetched separately rather than joined. The generated
  // types do not describe the purchases -> products relationship, and a cast to
  // paper over that would be a lie the compiler could not check.
  const productIds = [...new Set((purchases ?? []).map((row) => row.product_id))];
  const { data: products } = productIds.length
    ? await supabase.from('products').select('id, name').in('id', productIds)
    : { data: [] };
  const productName = new Map((products ?? []).map((row) => [row.id, row.name]));

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-3xl)]">Billing</h1>

      {purchase === 'success' ? (
        <p
          role="status"
          className="bg-status-open-bg text-status-open-fg mt-5 rounded-lg px-4 py-3 text-sm"
        >
          Thanks — that&rsquo;s gone through. Your credits appear below as soon as the payment
          confirms, usually within a few seconds.
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Credits</CardTitle>
          <CardDescription>What you can book with right now.</CardDescription>
          <CardContent className="mt-2">
            <p className="tabular text-heading font-display text-[length:var(--text-3xl)]">
              {balance ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardTitle>Payment details</CardTitle>
          <CardDescription>Cards, invoices and receipts are held by Stripe.</CardDescription>
          <CardContent className="mt-2">
            <BillingPortalButton />
          </CardContent>
        </Card>
      </div>

      <section className="border-subtle mt-12 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Credit history</h2>
        <p className="text-muted mt-2 max-w-[62ch] text-sm">
          Every movement, including why. Nothing here is ever edited or removed — a correction is a
          new line, so the history always adds up.
        </p>

        {!ledger || ledger.length === 0 ? (
          <p className="text-muted mt-6 text-sm">Nothing yet.</p>
        ) : (
          <ul className="mt-6 grid gap-2">
            {ledger.map((entry) => (
              <li
                key={entry.id}
                className="border-subtle flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{LEDGER_LABELS[entry.kind] ?? entry.kind}</p>
                  {entry.reason ? <p className="text-muted text-xs">{entry.reason}</p> : null}
                  <p className="text-muted text-xs">
                    {formatUkDate(entry.created_at)}
                    {entry.delta > 0 && entry.expires_at
                      ? ` · expires ${formatUkDate(entry.expires_at)}`
                      : ''}
                  </p>
                </div>
                <span
                  className={`tabular text-sm font-semibold ${
                    entry.delta > 0 ? 'text-status-open-fg' : 'text-secondary'
                  }`}
                >
                  {entry.delta > 0 ? '+' : ''}
                  {entry.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-subtle mt-12 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Purchases</h2>

        {!purchases || purchases.length === 0 ? (
          <p className="text-muted mt-6 text-sm">
            Nothing yet.{' '}
            <Link href="/pricing" className="text-link underline">
              See what&rsquo;s available
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-6 grid gap-2">
            {purchases.map((row) => (
              <li
                key={row.id}
                className="border-subtle flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {productName.get(row.product_id) ?? 'Purchase'}
                  </p>
                  <p className="text-muted text-xs">
                    {row.purchased_at ? formatUkDate(row.purchased_at) : 'Pending'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {row.status === 'refunded' || row.status === 'partially_refunded' ? (
                    <Badge tone="cancelled">Refunded</Badge>
                  ) : null}
                  <span className="tabular text-sm font-semibold">
                    {formatPence(row.amount_pence)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
