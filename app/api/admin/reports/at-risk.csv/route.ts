import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { csvResponse, toCsv } from '@/lib/csv';

export async function GET() {
  await requireRole('admin');
  const supabase = await createClient();
  const { data } = await supabase.rpc('report_at_risk', { p_days: 21 });

  const csv = toCsv(
    (data ?? []).map((row) => ({ ...row })),
    [
      { key: 'full_name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'last_class', label: 'Last class' },
      { key: 'days_since', label: 'Days since' },
      { key: 'attended_total', label: 'Classes attended' },
      { key: 'credits', label: 'Credits left' },
      { key: 'marketing_ok', label: 'Marketing consent' },
    ],
  );

  return csvResponse(csv, `barre-at-risk-${new Date().toISOString().slice(0, 10)}.csv`);
}
