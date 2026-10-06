import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/auth';
import { internalPath } from '@/lib/routes';
import { AuthForm } from './auth-form';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  const { next } = await searchParams;
  if (user) redirect(internalPath(next, '/account'));

  return (
    <div className="mx-auto w-full max-w-md px-5 py-16">
      <h1 className="text-[length:var(--text-3xl)]">Welcome back</h1>
      <p className="text-secondary mt-2">Log in to book a class or manage your bookings.</p>

      <AuthForm mode="login" next={next} />

      <p className="text-secondary mt-8 text-sm">
        New here?{' '}
        <Link href="/signup" className="text-link font-medium underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
