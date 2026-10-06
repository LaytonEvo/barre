import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetRequestForm } from './reset-form';

export const metadata: Metadata = {
  title: 'Reset your password',
  // Nothing here should be indexed: it is a form that sends mail.
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-5 py-16">
      <h1 className="text-[length:var(--text-3xl)]">Reset your password</h1>
      <p className="text-secondary mt-3">
        Tell us the address you signed up with and we&rsquo;ll send you a link to set a new
        password.
      </p>

      <ResetRequestForm />

      <p className="text-muted mt-6 text-sm">
        Remembered it?{' '}
        <Link href="/login" className="text-link underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
