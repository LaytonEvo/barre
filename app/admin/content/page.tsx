import type { Metadata } from 'next';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { formatUkDate } from '@/lib/time';
import { WaiverPublisher } from '@/components/admin/waiver-publisher';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Content', robots: { index: false, follow: false } };

export default async function ContentPage() {
  await requireRole('admin');
  const supabase = await createClient();

  const [{ data: versions }, { data: faqs }, { data: announcements }] = await Promise.all([
    supabase
      .from('waiver_versions')
      .select('id, version_label, is_current, published_at, body_markdown')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('faqs').select('id, question, category, published').order('sort_order'),
    supabase
      .from('announcements')
      .select('id, body, active, starts_at, ends_at')
      .order('starts_at', { ascending: false })
      .limit(5),
  ]);

  const current = versions?.find((version) => version.is_current);

  // Count who would have to re-sign, so publishing is an informed decision.
  const { count: signedCount } = current
    ? await supabase
        .from('waiver_signatures')
        .select('id', { count: 'exact', head: true })
        .eq('waiver_version_id', current.id)
    : { count: 0 };

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8">
      <h1 className="text-[length:var(--text-2xl)]">Content</h1>

      <section className="mt-8">
        <h2 className="text-[length:var(--text-xl)]">Waiver</h2>

        <div className="bg-status-nearly-bg mt-4 rounded-lg p-4">
          <Badge tone="nearly">Read this first</Badge>
          <p className="text-primary mt-2 max-w-[62ch] text-sm">
            The current text is a <strong>draft that has not been reviewed</strong>. Before anyone
            signs it for real, it needs checking against your insurance policy and by a legal
            professional — most fitness insurers specify wording they require, and some will not pay
            out on a claim where a different form was used.
          </p>
        </div>

        {current ? (
          <div className="border-subtle bg-surface mt-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-primary font-medium">{current.version_label}</p>
              <Badge tone="open">Current</Badge>
            </div>
            <p className="text-muted mt-1 text-sm">
              {current.published_at
                ? `Published ${formatUkDate(current.published_at)}`
                : 'Not published'}
              {' · '}
              {signedCount ?? 0} {signedCount === 1 ? 'member has' : 'members have'} signed it
            </p>
          </div>
        ) : (
          <p className="text-muted mt-4 text-sm">No waiver published yet.</p>
        )}

        <WaiverPublisher
          currentLabel={current?.version_label ?? null}
          currentBody={current?.body_markdown ?? ''}
          signedCount={signedCount ?? 0}
        />

        {versions && versions.length > 1 ? (
          <div className="mt-6">
            <h3 className="text-base font-semibold">Earlier versions</h3>
            <ul className="mt-2 grid gap-1">
              {versions
                .filter((version) => !version.is_current)
                .map((version) => (
                  <li key={version.id} className="text-muted text-sm">
                    {version.version_label}
                    {version.published_at ? ` · ${formatUkDate(version.published_at)}` : ''}
                  </li>
                ))}
            </ul>
            <p className="text-muted mt-2 text-xs">
              Kept permanently. Each signature records which version it was made against.
            </p>
          </div>
        ) : null}
      </section>

      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">FAQs</h2>
        <p className="text-muted mt-2 max-w-[60ch] text-sm">
          The booking and cancellation answers on the public page are generated from your settings
          rather than stored here, so they cannot fall out of step with what the system does.
        </p>
        <ul className="mt-4 grid gap-2">
          {(faqs ?? []).map((faq) => (
            <li
              key={faq.id}
              className="border-subtle bg-surface flex flex-wrap items-baseline justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <span className="text-primary">{faq.question}</span>
              <Badge tone={faq.published ? 'open' : 'neutral'}>
                {faq.published ? 'Live' : 'Hidden'}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Announcement banner</h2>
        <p className="text-muted mt-2 max-w-[60ch] text-sm">
          Shown across the top of every page between its start and end dates. Set an end date — a
          banner about a cancelled class is actively unhelpful the day after.
        </p>
        {!announcements || announcements.length === 0 ? (
          <p className="text-muted mt-4 text-sm">None set.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {announcements.map((announcement) => (
              <li
                key={announcement.id}
                className="border-subtle bg-surface flex flex-wrap items-baseline justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <span className="text-primary">{announcement.body}</span>
                <Badge tone={announcement.active ? 'open' : 'neutral'}>
                  {announcement.active ? 'Active' : 'Off'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
