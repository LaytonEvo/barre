import Link from 'next/link';
import { requireRole } from '@/lib/supabase/auth';
import { AdminNav } from '@/components/admin/admin-nav';

/**
 * Admin shell.
 *
 * Gated here as well as on every page: a layout is not an authorisation
 * boundary on its own, since a page can be reached without its layout
 * re-running, but doing it here means a missed check on a new page still lands
 * somewhere sensible.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('admin', 'instructor');
  const isAdmin = user.roles.includes('admin');

  return (
    <div className="bg-page min-h-dvh">
      <div className="border-subtle bg-surface border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 md:px-8">
          <Link href="/admin" className="font-display text-heading font-semibold">
            Admin
          </Link>
          <p className="text-muted truncate text-sm">
            {user.firstName ?? user.email}
            {isAdmin ? '' : ' · instructor'}
          </p>
        </div>
        <AdminNav isAdmin={isAdmin} />
      </div>

      {children}
    </div>
  );
}
