import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/auth';
import { internalPath } from '@/lib/routes';
import { AuthForm } from '@/app/login/auth-form';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  const { next } = await searchParams;
  if (user) redirect(internalPath(next, '/account'));

  return (
    <div className="mx-auto w-full max-w-md px-5 py-16">
      <h1 className="text-[length:var(--text-3xl)]">Create your account</h1>
      <p className="text-secondary mt-2">
        Takes a minute. Before your first class we&rsquo;ll ask you to sign a waiver and answer a
        few health questions.
      </p>

      <AuthForm mode="signup" next={next} />

      <p className="text-muted mt-6 text-xs">
        By creating an account you agree to our{' '}
        <Link href="/policies/terms" className="underline">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/policies/privacy" className="underline">
          privacy policy
        </Link>
        .
      </p>

      <p className="text-secondary mt-8 text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-link font-medium underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
