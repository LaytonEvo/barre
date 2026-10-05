import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { formatUkDate, formatUkDayLong, formatUkTime } from '@/lib/time';
import { AdjustCreditsForm } from '@/components/admin/adjust-credits-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Member', robots: { index: false, follow: false } };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('admin');
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'id, first_name, last_name, email, phone, date_of_birth, emergency_contact_name, emergency_contact_phone, marketing_consent, anonymised_at, created_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (!profile) notFound();

  const [
    { data: balance },
    { data: health },
    { data: signatures },
    { data: ledger },
    { data: bookings },
  ] = await Promise.all([
    supabase.rpc('credit_balance', { p_user_id: id }),
    supabase
      .from('health_questionnaires')
      .select(
        'id, answers, flagged, flag_summary, injuries_text, conditions_text, pregnancy_status, pregnancy_weeks, completed_at, valid_until, review_state',
      )
      .eq('user_id', id)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('waiver_signatures')
      .select('id, signed_at, typed_name')
      .eq('user_id', id)
      .order('signed_at', { ascending: false }),
    supabase
      .from('credit_ledger')
      .select('id, delta, kind, reason, expires_at, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('bookings')
      .select('id, status, booked_at, class_sessions(starts_at, class_types(name))')
      .eq('user_id', id)
      .order('booked_at', { ascending: false })
      .limit(15),
  ]);

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8">
      <Link href="/admin/members" className="text-muted text-sm hover:underline">
        &larr; Members
      </Link>

      <h1 className="mt-2 text-[length:var(--text-2xl)]">{name}</h1>
      <p className="text-muted mt-1 text-sm">
        {profile.email}
        {profile.phone ? ` · ${profile.phone}` : ''}
      </p>
      {profile.anonymised_at ? (
        <Badge tone="cancelled">Deleted {formatUkDate(profile.anonymised_at)}</Badge>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Credits</CardTitle>
          <CardDescription>Adjustments need a reason, and are audited.</CardDescription>
          <CardContent className="mt-2">
            <p className="tabular text-heading font-display text-[length:var(--text-3xl)]">
              {balance ?? 0}
            </p>
            <AdjustCreditsForm userId={profile.id} />
          </CardContent>
        </Card>

        <Card>
          <CardTitle>Emergency contact</CardTitle>
          <CardContent className="mt-2">
            {profile.emergency_contact_name || profile.emergency_contact_phone ? (
              <p className="text-secondary text-sm">
                {profile.emergency_contact_name}
                {profile.emergency_contact_phone ? ` · ${profile.emergency_contact_phone}` : ''}
              </p>
            ) : (
              <p className="text-muted text-sm">Not given.</p>
            )}
            {profile.date_of_birth ? (
              <p className="text-muted mt-2 text-sm">Born {formatUkDate(profile.date_of_birth)}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Health answers are special category data. They are shown here because
          Kelly needs them to teach safely, and RLS allows exactly this — but
          nothing else in the product renders them. */}
      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Health answers</h2>
        {!health ? (
          <p className="text-muted mt-3 text-sm">Not answered yet.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={health.flagged ? 'nearly' : 'open'}>
                {health.flagged ? 'Flagged' : 'Nothing flagged'}
              </Badge>
              <span className="text-muted text-sm">
                Answered {formatUkDate(health.completed_at)}, valid to{' '}
                {formatUkDate(health.valid_until)}
              </span>
            </div>

            {health.flag_summary ? (
              <p className="text-primary text-sm">{health.flag_summary}</p>
            ) : null}
            {health.injuries_text ? (
              <p className="text-secondary text-sm">
                <span className="text-muted">Injuries:</span> {health.injuries_text}
              </p>
            ) : null}
            {health.conditions_text ? (
              <p className="text-secondary text-sm">
                <span className="text-muted">Other:</span> {health.conditions_text}
              </p>
            ) : null}
            {health.pregnancy_status && health.pregnancy_status !== 'none' ? (
              <p className="text-secondary text-sm">
                <span className="text-muted">Pregnancy:</span> {health.pregnancy_status}
                {health.pregnancy_weeks ? `, ${health.pregnancy_weeks} weeks` : ''}
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Waiver</h2>
        {!signatures || signatures.length === 0 ? (
          <p className="text-status-full-fg mt-3 text-sm">Not signed.</p>
        ) : (
          <ul className="mt-3 grid gap-1">
            {signatures.map((signature) => (
              <li key={signature.id} className="text-secondary text-sm">
                Signed {formatUkDate(signature.signed_at)} as &ldquo;{signature.typed_name}&rdquo;
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Recent bookings</h2>
        {!bookings || bookings.length === 0 ? (
          <p className="text-muted mt-3 text-sm">None yet.</p>
        ) : (
          <ul className="mt-3 grid gap-1">
            {bookings.map((booking) => {
              const session = booking.class_sessions as unknown as {
                starts_at: string;
                class_types: { name: string } | null;
              } | null;
              return (
                <li
                  key={booking.id}
                  className="border-subtle flex flex-wrap justify-between gap-x-4 border-b pb-1 text-sm"
                >
                  <span className="text-secondary">
                    {session ? formatUkDayLong(session.starts_at) : '—'}
                    {session ? ` · ${formatUkTime(session.starts_at)}` : ''}
                  </span>
                  <span className="text-muted">{booking.status.replace(/_/g, ' ')}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="border-subtle mt-10 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Credit history</h2>
        <ul className="mt-3 grid gap-1">
          {(ledger ?? []).map((entry) => (
            <li
              key={entry.id}
              className="border-subtle flex flex-wrap justify-between gap-x-4 border-b pb-1 text-sm"
            >
              <span className="text-secondary">
                {formatUkDate(entry.created_at)} · {entry.kind.replace(/_/g, ' ')}
                {entry.reason ? ` — ${entry.reason}` : ''}
              </span>
              <span className="tabular font-medium">
                {entry.delta > 0 ? '+' : ''}
                {entry.delta}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted mt-3 text-xs">
          Nothing here is ever edited or removed — a correction is a new line, so the history always
          adds up.
        </p>
      </section>
    </div>
  );
}
