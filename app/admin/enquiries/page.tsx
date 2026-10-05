import type { Metadata } from 'next';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { formatUkDate } from '@/lib/time';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Enquiries', robots: { index: false, follow: false } };

const KIND_LABELS: Record<string, string> = {
  contact: 'General',
  private_session: 'One to one',
  event: 'Event',
  corporate: 'Corporate',
};

export default async function EnquiriesPage() {
  await requireRole('admin');
  const supabase = await createClient();

  const { data: enquiries } = await supabase
    .from('enquiries')
    .select('id, kind, name, email, phone, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8">
      <h1 className="text-[length:var(--text-2xl)]">Enquiries</h1>

      {!enquiries || enquiries.length === 0 ? (
        <p className="text-muted mt-6">Nothing yet.</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {enquiries.map((enquiry) => (
            <li
              key={enquiry.id}
              className="border-subtle bg-surface grid gap-2 rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-primary font-medium">{enquiry.name}</p>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{KIND_LABELS[enquiry.kind] ?? enquiry.kind}</Badge>
                  <Badge tone={enquiry.status === 'new' ? 'nearly' : 'open'}>
                    {enquiry.status}
                  </Badge>
                </div>
              </div>

              <p className="text-muted text-sm">
                {formatUkDate(enquiry.created_at)} ·{' '}
                {/* Selectable text rather than a mailto link, which is
                    unreliable on a phone and silently does nothing. */}
                <span className="select-all">{enquiry.email}</span>
                {enquiry.phone ? (
                  <>
                    {' · '}
                    <span className="select-all">{enquiry.phone}</span>
                  </>
                ) : null}
              </p>

              <p className="text-secondary text-sm whitespace-pre-line">{enquiry.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
