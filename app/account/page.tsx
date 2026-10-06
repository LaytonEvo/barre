import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'My account', robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser('/account');
  const supabase = await createClient();

  // Proves the onboarding gate view and RLS are both working: this reads only
  // the signed-in member's row, enforced in the database.
  const { data: onboarding } = await supabase
    .from('member_onboarding_status')
    .select('current_waiver_signed, parq_valid')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: balance } = await supabase.rpc('credit_balance', { p_user_id: user.id });

  const waiverSigned = onboarding?.current_waiver_signed ?? false;
  const parqValid = onboarding?.parq_valid ?? false;
  const readyToBook = waiverSigned && parqValid;

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-3xl)]">
        Hello{user.firstName ? `, ${user.firstName}` : ''}
      </h1>
      <p className="text-secondary mt-2">{user.email}</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Credits</CardTitle>
          <CardDescription>Your balance, derived from the credit ledger.</CardDescription>
          <CardContent className="mt-2">
            <p className="tabular text-heading font-display text-[length:var(--text-3xl)]">
              {balance ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardTitle>Before your first class</CardTitle>
          <CardDescription>Both of these are needed before you can book.</CardDescription>
          <CardContent className="mt-2 gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Waiver signed</span>
              <Badge tone={waiverSigned ? 'open' : 'nearly'}>
                {waiverSigned ? 'Done' : 'Needed'}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Health questions</span>
              <Badge tone={parqValid ? 'open' : 'nearly'}>{parqValid ? 'Done' : 'Needed'}</Badge>
            </div>

            {readyToBook ? (
              <p className="text-muted mt-2 text-xs">
                All set — you can book any class on the timetable.
              </p>
            ) : (
              <div className="mt-3">
                <Link href={waiverSigned ? '/account/health' : '/account/waiver'}>
                  <Button variant="accent" block>
                    {waiverSigned ? 'Answer the health questions' : 'Read and sign the waiver'}
                  </Button>
                </Link>
                <p className="text-muted mt-2 text-xs">
                  Takes a couple of minutes, and only needs doing once.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="border-subtle mt-12 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Your account</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/account/bookings">
            <Button variant="secondary">My bookings</Button>
          </Link>
          <Link href="/account/billing">
            <Button variant="secondary">Billing</Button>
          </Link>
          <Link href="/account/videos">
            <Button variant="secondary">At-home videos</Button>
          </Link>
          <Link href="/timetable">
            <Button variant={readyToBook ? 'accent' : 'ghost'}>Book a class</Button>
          </Link>
          <Link href="/account/password">
            <Button variant="ghost">Password</Button>
          </Link>
          <Link href="/account/privacy">
            <Button variant="ghost">Your data</Button>
          </Link>
        </div>

        <form action="/auth/signout" method="post" className="mt-6">
          <Button type="submit" variant="secondary">
            Log out
          </Button>
        </form>
      </section>
    </div>
  );
}
