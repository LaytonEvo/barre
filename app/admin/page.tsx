import type { Metadata } from 'next';
import { requireRole } from '@/lib/supabase/auth';
import { unconfirmedSettings } from '@/lib/policy';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

export default async function AdminPage() {
  // Role gate. Members are redirected to their own dashboard, and RLS would
  // refuse the queries below even if this check were somehow bypassed.
  const user = await requireRole('admin', 'instructor');
  const unconfirmed = await unconfirmedSettings();

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-3xl)]">Admin</h1>
      <p className="text-secondary mt-2">
        Signed in as {user.email} · {user.roles.join(', ')}
      </p>

      <Card className="mt-10">
        <CardTitle>Settings awaiting confirmation</CardTitle>
        <CardDescription>
          Every business rule below is a placeholder nobody has signed off. The values came from the
          brief&rsquo;s own &ldquo;e.g.&rdquo; examples so the system is usable in development.
        </CardDescription>
        <CardContent className="mt-3">
          {unconfirmed.length === 0 ? (
            <p className="text-muted text-sm">Everything is confirmed.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {unconfirmed.map((key) => (
                <li key={key}>
                  <Badge tone="nearly">
                    <span className="font-mono">{key}</span>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="border-subtle mt-12 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Coming at M6</h2>
        <p className="text-muted mt-2 max-w-[64ch] text-sm">
          Today view, register and check-in, schedule management, members, products and the
          enquiries inbox. This page exists at M1 to prove the role gate works.
        </p>
      </section>
    </div>
  );
}
