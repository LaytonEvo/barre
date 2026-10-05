import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { csvResponse, poundsFromPence, toCsv } from '@/lib/csv';

export async function GET() {
  await requireRole('admin');
  const supabase = await createClient();
  const { data } = await supabase.rpc('report_revenue', { p_months: 24 });

  const csv = toCsv(
    (data ?? []).map((row) => ({
      month: row.month,
      product_name: row.product_name,
      purchases: row.purchases,
      // Pounds as a plain decimal, so a spreadsheet can sum the column.
      gross: poundsFromPence(Number(row.gross_pence)),
      refunded: poundsFromPence(Number(row.refunded_pence)),
      net: poundsFromPence(Number(row.net_pence)),
    })),
    [
      { key: 'month', label: 'Month' },
      { key: 'product_name', label: 'Product' },
      { key: 'purchases', label: 'Sold' },
      { key: 'gross', label: 'Gross (£)' },
      { key: 'refunded', label: 'Refunded (£)' },
      { key: 'net', label: 'Net (£)' },
    ],
  );

  return csvResponse(csv, `barre-revenue-${new Date().toISOString().slice(0, 10)}.csv`);
}
