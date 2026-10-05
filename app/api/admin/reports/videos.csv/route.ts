import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { csvResponse, toCsv } from '@/lib/csv';

export async function GET() {
  await requireRole('admin');
  const supabase = await createClient();
  const { data } = await supabase.rpc('report_popular_videos', { p_months: 12 });

  const csv = toCsv(
    (data ?? []).map((row) => ({ ...row })),
    [
      { key: 'title', label: 'Video' },
      { key: 'category', label: 'Category' },
      { key: 'started', label: 'Started' },
      { key: 'completed', label: 'Finished' },
      { key: 'completion_rate', label: 'Completion rate %' },
    ],
  );

  return csvResponse(csv, `barre-videos-${new Date().toISOString().slice(0, 10)}.csv`);
}
