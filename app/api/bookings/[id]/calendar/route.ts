import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildIcs } from '@/lib/booking/ics';
import { formatAddress } from '@/lib/queries/catalogue';

/**
 * The .ics for one booking.
 *
 * Read through the member's own client, so RLS decides who may download it —
 * a booking id in the URL is not an authorisation. Someone else's id returns
 * 404, which also avoids confirming that the booking exists.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, session_id, status')
    .eq('id', id)
    .maybeSingle();

  if (!booking) return new NextResponse('Not found', { status: 404 });

  const { data: session } = await supabase
    .from('class_sessions')
    .select('id, starts_at, ends_at, status, class_types(name), venues(*)')
    .eq('id', booking.session_id)
    .maybeSingle();

  if (!session) return new NextResponse('Not found', { status: 404 });

  const classType = session.class_types as unknown as { name: string } | null;
  const venue = session.venues as unknown as Parameters<typeof formatAddress>[0] | null;

  const cancelled =
    session.status === 'cancelled' ||
    ['cancelled_in_window', 'cancelled_late'].includes(booking.status);

  const ics = buildIcs({
    // Stable per booking, so an updated file replaces the original in the
    // member's calendar instead of adding a second entry.
    uid: `booking-${booking.id}@barrebykelly`,
    title: `${classType?.name ?? 'Barre'} with Kelly`,
    description: cancelled
      ? 'This class has been cancelled.'
      : 'Barre By Kelly. Grippy socks and water — see you there.',
    location: venue ? `${(venue as { name: string }).name}, ${formatAddress(venue)}` : undefined,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    organiser: { name: 'Barre By Kelly' },
    cancelled,
    sequence: cancelled ? 1 : 0,
  });

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="barre-${booking.id.slice(0, 8)}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
