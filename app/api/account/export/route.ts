import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Data export (UK GDPR right of access).
 *
 * The database function checks that the caller is the subject, so a member
 * cannot export somebody else's record by changing a URL. It is also run as the
 * member, so RLS applies on top.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new NextResponse('Not found', { status: 404 });

  const { data, error } = await supabase.rpc('export_member_data', {});

  if (error) {
    console.error('Data export failed', error);
    return new NextResponse('Could not produce the export', { status: 500 });
  }

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="barre-by-kelly-data-${stamp}.json"`,
      // Never cached: this is somebody's whole record.
      'Cache-Control': 'no-store, private',
    },
  });
}
