import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { WaiverForm } from './waiver-form';

export const metadata: Metadata = { title: 'Waiver', robots: { index: false } };

export default async function WaiverPage() {
  const user = await requireUser('/account/waiver');
  const supabase = await createClient();

  const { data: version } = await supabase
    .from('waiver_versions')
    .select('id, version_label, body_markdown')
    .eq('is_current', true)
    .maybeSingle();

  if (!version) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-8">
        <h1 className="text-[length:var(--text-3xl)]">Waiver</h1>
        <p className="text-secondary mt-4">
          There is no waiver published yet. Please check back shortly, or let Kelly know.
        </p>
      </div>
    );
  }

  const { data: existing } = await supabase
    .from('waiver_signatures')
    .select('id')
    .eq('user_id', user.id)
    .eq('waiver_version_id', version.id)
    .maybeSingle();

  // Already signed this version: nothing to do here.
  if (existing) redirect('/account/health');

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:px-8">
      <p className="text-muted text-xs font-semibold tracking-[0.12em] uppercase">Step 1 of 2</p>
      <h1 className="mt-2 text-[length:var(--text-3xl)]">Before your first class</h1>
      <p className="text-secondary mt-4 max-w-[60ch]">
        Please read this through and sign at the bottom. It is the standard agreement every
        participant signs, and it takes a minute.
      </p>

      <WaiverForm
        versionId={version.id}
        versionLabel={version.version_label}
        bodyMarkdown={version.body_markdown}
      />
    </div>
  );
}
