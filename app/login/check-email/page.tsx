import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Check your email' };

export default function CheckEmailPage() {
  return (
    <div className="mx-auto w-full max-w-md px-5 py-16">
      <h1 className="text-[length:var(--text-3xl)]">Check your email</h1>
      <p className="text-secondary mt-3">
        We&rsquo;ve sent you a link. Open it on this device and you&rsquo;ll be logged straight in.
      </p>
      <p className="text-muted mt-6 text-sm">
        Nothing arrived? Check your spam folder, and make sure you typed the same address you signed
        up with.
      </p>
    </div>
  );
}
