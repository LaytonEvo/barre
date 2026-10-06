import type { Metadata } from 'next';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { formatUkDate } from '@/lib/time';
import { formatPence } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * The CSV links are plain anchors, not <Link>.
 *
 * Next prefetches a <Link> as soon as it is rendered, and each of these routes
 * runs a full report — attendance over 52 weeks, revenue, at-risk, videos — so
 * every visit to this page silently ran four complete exports nobody had asked
 * for, and the prefetches never settled because the response is a CSV rather
 * than a navigation payload. They are downloads, not routes.
 */
export const metadata: Metadata = { title: 'Reports', robots: { index: false, follow: false } };

export default async function ReportsPage() {
  await requireRole('admin');
  const supabase = await createClient();

  const [{ data: attendance }, { data: revenue }, { data: atRisk }, { data: popular }] =
    await Promise.all([
      supabase.rpc('report_attendance', { p_weeks: 12 }),
      supabase.rpc('report_revenue', { p_months: 12 }),
      supabase.rpc('report_at_risk', { p_days: 21 }),
      supabase.rpc('report_popular_videos', { p_months: 3 }),
    ]);

  const revenueTotal = (revenue ?? []).reduce((sum, row) => sum + Number(row.net_pence), 0);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-8">
      <h1 className="text-[length:var(--text-2xl)]">Reports</h1>

      {/* --- Attendance --- */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[length:var(--text-xl)]">Attendance</h2>
          <a href="/api/admin/reports/attendance.csv" download>
            <Button variant="ghost" size="sm">
              Download CSV
            </Button>
          </a>
        </div>

        {!attendance || attendance.length === 0 ? (
          <p className="text-muted mt-3 text-sm">No classes in the last twelve weeks.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-muted text-xs tracking-[0.08em] uppercase">
                  <th className="border-subtle border-b py-2 text-left font-semibold">Week</th>
                  <th className="border-subtle border-b py-2 text-right font-semibold">Classes</th>
                  <th className="border-subtle border-b py-2 text-right font-semibold">Booked</th>
                  <th className="border-subtle border-b py-2 text-right font-semibold">Attended</th>
                  <th className="border-subtle border-b py-2 text-right font-semibold">No-shows</th>
                  <th className="border-subtle border-b py-2 text-right font-semibold">Fill</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((row) => (
                  <tr key={row.week_starting}>
                    <td className="border-subtle border-b py-2">
                      {formatUkDate(`${row.week_starting}T12:00:00Z`)}
                    </td>
                    <td className="border-subtle tabular border-b py-2 text-right">
                      {row.sessions}
                    </td>
                    <td className="border-subtle tabular border-b py-2 text-right">{row.booked}</td>
                    <td className="border-subtle tabular border-b py-2 text-right">
                      {row.attended}
                    </td>
                    <td className="border-subtle tabular border-b py-2 text-right">
                      {row.no_shows}
                    </td>
                    <td className="border-subtle tabular border-b py-2 text-right font-medium">
                      {row.fill_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Revenue --- */}
      <section className="border-subtle mt-10 border-t pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[length:var(--text-xl)]">Revenue</h2>
          <a href="/api/admin/reports/revenue.csv" download>
            <Button variant="ghost" size="sm">
              Download CSV
            </Button>
          </a>
        </div>

        {!revenue || revenue.length === 0 ? (
          <p className="text-muted mt-3 text-sm">
            No purchases yet. The free first class does not go through Stripe, so it does not appear
            here.
          </p>
        ) : (
          <>
            <p className="tabular text-heading font-display mt-3 text-[length:var(--text-2xl)]">
              {formatPence(revenueTotal)}
              <span className="text-muted font-sans text-sm"> net, last 12 months</span>
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-muted text-xs tracking-[0.08em] uppercase">
                    <th className="border-subtle border-b py-2 text-left font-semibold">Month</th>
                    <th className="border-subtle border-b py-2 text-left font-semibold">Product</th>
                    <th className="border-subtle border-b py-2 text-right font-semibold">Sold</th>
                    <th className="border-subtle border-b py-2 text-right font-semibold">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.map((row) => (
                    <tr key={`${row.month}-${row.product_name}`}>
                      <td className="border-subtle border-b py-2">
                        {formatUkDate(`${row.month}T12:00:00Z`).replace(/^\d+ /, '')}
                      </td>
                      <td className="border-subtle border-b py-2">{row.product_name}</td>
                      <td className="border-subtle tabular border-b py-2 text-right">
                        {row.purchases}
                      </td>
                      <td className="border-subtle tabular border-b py-2 text-right font-medium">
                        {formatPence(Number(row.net_pence))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* --- At risk --- */}
      <section className="border-subtle mt-10 border-t pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[length:var(--text-xl)]">Not been for a while</h2>
          <a href="/api/admin/reports/at-risk.csv" download>
            <Button variant="ghost" size="sm">
              Download CSV
            </Button>
          </a>
        </div>

        <p className="text-muted mt-2 max-w-[60ch] text-sm">
          Members who used to come and have not for three weeks. People who signed up and never
          booked are a different conversation, so they are not here.
        </p>

        {!atRisk || atRisk.length === 0 ? (
          <p className="text-muted mt-4 text-sm">Nobody — everyone who has been is still coming.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {atRisk.slice(0, 30).map((row) => (
              <li
                key={row.user_id}
                className="border-subtle bg-surface flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="text-primary font-medium">{row.full_name ?? row.email}</p>
                  <p className="text-muted">
                    Last class {formatUkDate(row.last_class)} ·{' '}
                    <span className="tabular">{row.attended_total}</span> total
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {row.credits > 0 ? (
                    <Badge tone="open">
                      <span className="tabular">{row.credits} credits left</span>
                    </Badge>
                  ) : null}
                  <Badge tone={row.marketing_ok ? 'neutral' : 'cancelled'}>
                    {row.marketing_ok ? 'Can email' : 'No marketing consent'}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Popular videos --- */}
      <section className="border-subtle mt-10 border-t pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[length:var(--text-xl)]">Most watched videos</h2>
          <a href="/api/admin/reports/videos.csv" download>
            <Button variant="ghost" size="sm">
              Download CSV
            </Button>
          </a>
        </div>

        <p className="text-muted mt-2 max-w-[60ch] text-sm">
          Last three months. The completion rate is the more useful column: a video lots of people
          start and few finish is usually too long or badly cued, not unpopular.
        </p>

        {!popular || popular.length === 0 ? (
          <p className="text-muted mt-4 text-sm">
            Nothing watched yet — this fills in once the library is published and members start
            using it.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="pb-2 font-medium">Video</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 text-right font-medium">Started</th>
                  <th className="pb-2 text-right font-medium">Finished</th>
                  <th className="pb-2 text-right font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {popular.slice(0, 25).map((row) => (
                  <tr key={row.title}>
                    <td className="border-subtle border-b py-2">{row.title}</td>
                    <td className="border-subtle text-muted border-b py-2">{row.category}</td>
                    <td className="border-subtle tabular border-b py-2 text-right">
                      {row.started}
                    </td>
                    <td className="border-subtle tabular border-b py-2 text-right">
                      {row.completed}
                    </td>
                    <td className="border-subtle tabular border-b py-2 text-right font-medium">
                      {Number(row.completion_rate)}%
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
