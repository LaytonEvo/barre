import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { formatUkDayLong, formatUkTime } from '@/lib/time';
import { RegisterRow } from '@/components/admin/register-row';
import { WalkInForm } from '@/components/admin/walk-in-form';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Register', robots: { index: false, follow: false } };

export default async function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('admin', 'instructor');
  const { id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from('class_sessions')
    .select('id, starts_at, ends_at, capacity, status, class_types(name), venues(name)')
    .eq('id', id)
    .maybeSingle();

  if (!session) notFound();

  // The function checks that this instructor teaches this class, so an error
  // here is an authorisation failure rather than a missing row.
  const { data: register, error } = await supabase.rpc('register_for_session', {
    p_session_id: id,
  });

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-12 md:px-8">
        <h1 className="text-[length:var(--text-2xl)]">Register</h1>
        <p className="text-secondary mt-4">
          You do not have access to this class&rsquo;s register.
        </p>
        <Link href="/admin" className="text-link mt-4 inline-block underline">
          Back to today
        </Link>
      </div>
    );
  }

  const classType = session.class_types as unknown as { name: string } | null;
  const venue = session.venues as unknown as { name: string } | null;
  const rows = register ?? [];
  const marked = rows.filter((row) => row.status !== 'booked' && row.status !== 'no_show_pending');

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 md:px-8">
      <Link href="/admin" className="text-muted text-sm hover:underline">
        &larr; Today
      </Link>

      <h1 className="mt-2 text-[length:var(--text-2xl)]">{classType?.name ?? 'Class'}</h1>
      <p className="text-muted mt-1 text-sm">
        {formatUkDayLong(session.starts_at)} ·{' '}
        <span className="tabular">{formatUkTime(session.starts_at)}</span>
        {venue ? ` · ${venue.name}` : ''}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={rows.length >= session.capacity ? 'full' : 'open'}>
          <span className="tabular">
            {rows.length} / {session.capacity}
          </span>
        </Badge>
        <Badge tone={marked.length === rows.length && rows.length > 0 ? 'open' : 'neutral'}>
          <span className="tabular">
            {marked.length} of {rows.length} marked
          </span>
        </Badge>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted mt-8">Nobody booked yet.</p>
      ) : (
        <ul className="mt-6 grid gap-2">
          {rows.map((row) => (
            <RegisterRow key={row.booking_id} row={row} />
          ))}
        </ul>
      )}

      {user.roles.includes('admin') ? (
        <section className="border-subtle mt-10 border-t pt-6">
          <h2 className="text-[length:var(--text-xl)]">Someone turned up</h2>
          <p className="text-muted mt-2 max-w-[56ch] text-sm">
            Add a walk-in by email. If they already have an account it uses their credits; otherwise
            take payment at the class and adjust their balance afterwards.
          </p>
          <WalkInForm sessionId={id} />
        </section>
      ) : null}
    </div>
  );
}
