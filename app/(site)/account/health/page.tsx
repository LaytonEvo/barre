import type { Metadata } from 'next';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { PARQ_QUESTIONS } from '@/lib/onboarding/parq';
import { ParqForm } from './parq-form';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Health questions', robots: { index: false } };

export default async function HealthPage() {
  const user = await requireUser('/account/health');
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('health_questionnaires')
    .select('completed_at, valid_until, flagged')
    .eq('user_id', user.id)
    .gt('valid_until', new Date().toISOString())
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:px-8">
      <p className="text-muted text-xs font-semibold tracking-[0.12em] uppercase">Step 2 of 2</p>
      <h1 className="mt-2 text-[length:var(--text-3xl)]">A few health questions</h1>

      <p className="text-secondary mt-4 max-w-[60ch]">
        These help Kelly keep you safe and adapt anything that needs it. Answering yes to something
        does not stop you booking — it just means she knows.
      </p>

      {existing ? (
        <div className="bg-calm-soft mt-6 rounded-lg p-4">
          <Badge tone="open">Already answered</Badge>
          <p className="text-primary mt-2 text-sm">
            You answered these recently. You can fill them in again if anything has changed — a new
            injury, a pregnancy, an operation. We will ask again in twelve months anyway.
          </p>
        </div>
      ) : null}

      <ParqForm questions={PARQ_QUESTIONS} />
    </div>
  );
}
