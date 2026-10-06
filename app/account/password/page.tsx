import type { Metadata } from 'next';
import { requireUser } from '@/lib/supabase/auth';
import { PasswordForm } from './password-form';

export const metadata: Metadata = {
  title: 'Set a password',
  robots: { index: false, follow: false },
};

/**
 * Both ends of the password story.
 *
 * A member arrives here from a reset link, having been signed in by the callback
 * on the way, or from their own account page to change one they remember. The
 * page is the same either way, which is why it asks for a new password and not
 * an old one.
 */
export default async function PasswordPage() {
  await requireUser('/account/password');

  return (
    <div className="mx-auto w-full max-w-md px-5 py-16">
      <h1 className="text-[length:var(--text-3xl)]">Set a password</h1>
      <p className="text-secondary mt-3">
        Choose something you&rsquo;ll remember. At least 8 characters.
      </p>

      <PasswordForm />
    </div>
  );
}
