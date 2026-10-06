import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { formatUkDate } from '@/lib/time';
import { path } from '@/lib/routes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const metadata: Metadata = { title: 'Members', robots: { index: false, follow: false } };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole('admin');
  const { q } = await searchParams;
  const supabase = await createClient();

  const { data: members } = await supabase.rpc('admin_search_members', { p_query: q ?? null });

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <h1 className="text-[length:var(--text-2xl)]">Members</h1>

      {/* A GET form, so a search is a shareable URL and the back button works. */}
      <form method="get" className="mt-6 flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Name, email or phone"
          aria-label="Search members"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <p className="text-muted mt-4 text-sm">
        {members?.length ?? 0} {members?.length === 1 ? 'member' : 'members'}
        {q ? ` matching “${q}”` : ''}
      </p>

      {/* minmax(0,1fr), not the default auto column: an auto grid track sizes to
          max-content and will not shrink, so one long email made the whole list
          wider than the screen however hard the row inside it tried to
          truncate. */}
      <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2">
        {(members ?? []).map((member) => (
          <li key={member.user_id} className="min-w-0">
            <Link
              href={path(`/admin/members/${member.user_id}`)}
              className="border-subtle bg-surface hover:border-strong focus-visible:outline-focus block rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {/* Not flex-wrap: with it, a long name or email pushed the badges
                  onto their own line, so some rows showed credits top-right and
                  others underneath. The name block shrinks and truncates
                  instead, which keeps the badges in one readable column. */}
              <div className="flex items-start justify-between gap-3">
                {/* flex-1 as well as min-w-0: without a basis the block sizes to
                    its content, so a long email pushed the row past the screen
                    instead of truncating inside it. */}
                <div className="min-w-0 flex-1">
                  <p className="text-primary truncate font-medium">
                    {member.full_name ?? member.email}
                    {member.anonymised ? ' (deleted)' : ''}
                  </p>
                  <p className="text-muted truncate text-sm">{member.email}</p>
                  {member.last_booking ? (
                    <p className="text-muted text-sm">
                      Last class {formatUkDate(member.last_booking)}
                    </p>
                  ) : (
                    <p className="text-muted text-sm">Never booked</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {member.health_flagged ? <Badge tone="nearly">Health note</Badge> : null}
                  {!member.waiver_signed ? <Badge tone="full">No waiver</Badge> : null}
                  <Badge tone={member.credits > 0 ? 'open' : 'neutral'}>
                    <span className="tabular">{member.credits} credits</span>
                  </Badge>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
