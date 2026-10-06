import type { Metadata } from 'next';
import Link from 'next/link';
import { getSessionUser } from '@/lib/supabase/auth';
import { Button } from '@/components/ui/button';
import { RedeemForm } from '@/components/gift/redeem-form';

export const metadata: Metadata = {
  title: 'Redeem a voucher',
  robots: { index: false },
};

export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const user = await getSessionUser();

  return (
    <div className="mx-auto max-w-lg px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-2xl)]">Redeem your voucher</h1>

      {user ? (
        <>
          <p className="text-secondary mt-3">
            Enter the code and the classes go straight onto your account.
          </p>
          <RedeemForm initialCode={code ?? ''} />
        </>
      ) : (
        <>
          <p className="text-secondary mt-3">
            You will need an account first — it is where the classes live, and it takes a minute.
            Your code will still be here afterwards.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {/* The code is carried through the login round trip so nobody has to
                go back to the email and find it again. */}
            <Link href={`/signup?next=${encodeURIComponent(`/redeem?code=${code ?? ''}`)}`}>
              <Button variant="accent">Create an account</Button>
            </Link>
            <Link href={`/login?next=${encodeURIComponent(`/redeem?code=${code ?? ''}`)}`}>
              <Button variant="secondary">Log in</Button>
            </Link>
          </div>
          {code ? (
            <p className="text-muted mt-6 text-sm">
              Your code: <strong className="text-primary">{code}</strong>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
