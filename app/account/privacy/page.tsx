import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { formatUkDate } from '@/lib/time';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DeleteAccountForm } from './delete-form';

export const metadata: Metadata = { title: 'Your data', robots: { index: false } };

export default async function PrivacyPage() {
  const user = await requireUser('/account/privacy');
  const supabase = await createClient();

  const [{ data: signatures }, { data: health }] = await Promise.all([
    supabase
      .from('waiver_signatures')
      .select('id, signed_at, waiver_version_id')
      .eq('user_id', user.id)
      .order('signed_at', { ascending: false }),
    supabase
      .from('health_questionnaires')
      .select('id, completed_at, valid_until')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-3xl)]">Your data</h1>
      <p className="text-secondary mt-4 max-w-[60ch]">
        What we hold, and what you can do about it. Our{' '}
        <Link href="/policies/privacy" className="text-link underline">
          privacy policy
        </Link>{' '}
        has the detail.
      </p>

      <div className="mt-10 grid gap-4">
        <Card>
          <CardTitle>Download everything</CardTitle>
          <CardDescription>
            Your profile, bookings, credits, purchases, waiver records and health answers, as a JSON
            file.
          </CardDescription>
          <CardContent className="mt-3">
            <a href="/api/account/export" download>
              <Button variant="secondary">Download my data</Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardTitle>Your signed waiver</CardTitle>
          <CardDescription>
            {signatures && signatures.length > 0
              ? 'A copy of each agreement you have signed.'
              : 'You have not signed a waiver yet.'}
          </CardDescription>
          <CardContent className="mt-3">
            {signatures && signatures.length > 0 ? (
              <ul className="grid gap-2">
                {signatures.map((signature) => (
                  <li
                    key={signature.id}
                    className="border-subtle flex items-center justify-between gap-3 border-b pb-2 text-sm"
                  >
                    <span className="text-secondary">
                      Signed {formatUkDate(signature.signed_at)}
                    </span>
                    <a href={`/api/account/waiver/${signature.id}`} download>
                      <Button variant="ghost" size="sm">
                        Download PDF
                      </Button>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <Link href="/account/waiver">
                <Button variant="secondary">Sign the waiver</Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardTitle>Health answers</CardTitle>
          <CardDescription>
            Special category data under UK GDPR. Visible only to Kelly, and never used for anything
            but keeping you safe in class.
          </CardDescription>
          <CardContent className="mt-3">
            {health ? (
              <p className="text-secondary text-sm">
                Last answered {formatUkDate(health.completed_at)}. We will ask again by{' '}
                {formatUkDate(health.valid_until)}, or sooner if anything changes.
              </p>
            ) : (
              <p className="text-muted text-sm">Not answered yet.</p>
            )}
            <Link href="/account/health" className="mt-3 inline-block">
              <Button variant="ghost" size="sm">
                {health ? 'Update my answers' : 'Answer the questions'}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <section className="border-subtle mt-12 border-t pt-6">
        <h2 className="text-[length:var(--text-xl)]">Delete my account</h2>
        <div className="text-secondary mt-3 grid max-w-[62ch] gap-3 text-sm">
          <p>
            We will remove your name, contact details and emergency contact, and{' '}
            <strong>delete your health answers outright</strong>.
          </p>
          <p>
            Two things stay. Your bookings and purchases remain as records without your name on
            them, because they are accounting records. And your signed waiver is kept for its
            retention period, because it is the legal record of what you agreed to and an insurer
            may need it.
          </p>
          <p>This cannot be undone.</p>
        </div>

        <DeleteAccountForm />
      </section>
    </div>
  );
}
