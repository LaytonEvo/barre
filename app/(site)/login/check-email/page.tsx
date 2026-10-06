import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Check your email' };

/**
 * Shared by the magic link and the password reset, which want slightly
 * different words: one logs you in, the other hands you a form.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const isReset = (await searchParams).reset === '1';

  return (
    <div className="mx-auto w-full max-w-md px-5 py-16">
      <h1 className="text-[length:var(--text-3xl)]">Check your email</h1>
      <p className="text-secondary mt-3">
        {isReset
          ? 'We’ve sent you a link. Open it and you’ll be able to set a new password.'
          : 'We’ve sent you a link. Open it on this device and you’ll be logged straight in.'}
      </p>
      <p className="text-muted mt-6 text-sm">
        {isReset
          ? // Deliberately does not confirm whether an account exists: the action
            // behaves identically either way, so this wording must too.
            'Nothing arrived? Check your spam folder, and make sure you typed the same address you signed up with. The link can only be used once.'
          : 'Nothing arrived? Check your spam folder, and make sure you typed the same address you signed up with.'}
      </p>
    </div>
  );
}
