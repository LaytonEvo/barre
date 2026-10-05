import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { csvResponse, toCsv } from '@/lib/csv';

export async function GET() {
  await requireRole('admin');
  const supabase = await createClient();
  const { data } = await supabase.rpc('report_attendance', { p_weeks: 52 });

  const csv = toCsv(
    (data ?? []).map((row) => ({ ...row })),
    [
      { key: 'week_starting', label: 'Week starting' },
      { key: 'sessions', label: 'Classes' },
      { key: 'capacity', label: 'Places' },
      { key: 'booked', label: 'Booked' },
      { key: 'attended', label: 'Attended' },
      { key: 'no_shows', label: 'No-shows' },
      { key: 'fill_rate', label: 'Fill rate %' },
    ],
  );

  return csvResponse(csv, `barre-attendance-${new Date().toISOString().slice(0, 10)}.csv`);
}
