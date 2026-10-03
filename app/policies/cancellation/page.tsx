import type { Metadata } from 'next';
import { bookingWindowText, cancellationPolicyText, loadPolicy } from '@/lib/policy';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Cancellation policy',
  description:
    'How cancelling a class works, how the waitlist works, and what happens if we ever have to cancel.',
};

/**
 * Rendered from the settings table, not written by hand.
 *
 * This is invariant 9 in practice: the numbers in this copy are the same rows
 * the booking engine reads when it decides whether to return a credit. Changing
 * the cancellation window in admin changes this page in the same breath, so the
 * policy a member reads can never describe behaviour the system does not have.
 */
export default async function CancellationPolicyPage() {
  const policy = await loadPolicy().catch(() => null);

  if (!policy) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-8">
        <h1 className="text-[length:var(--text-4xl)]">Cancellation policy</h1>
        <p className="text-secondary mt-5">
          We cannot load the policy settings at the moment. Please check back shortly.
        </p>
      </div>
    );
  }

  const paragraphs = cancellationPolicyText(policy);

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 md:px-8">
      <h1 className="text-[length:var(--text-4xl)]">Cancellation policy</h1>

      <p className="text-muted mt-4 text-sm">{bookingWindowText(policy)}</p>

      <div className="mt-8 grid gap-5">
        {paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-secondary max-w-[64ch] text-lg">
            {paragraph}
          </p>
        ))}
      </div>

      <aside className="bg-calm-soft mt-12 rounded-lg p-5">
        <Badge tone="nearly">Placeholder values</Badge>
        <p className="text-primary mt-3 max-w-[60ch] text-sm">
          The hours and penalties above are the example figures from the build brief, not
          Kelly&rsquo;s confirmed policy. They are marked unconfirmed in the admin settings and are
          tracked as questions C1 to C8.
        </p>
        <p className="text-secondary mt-3 max-w-[60ch] text-sm">
          This page is generated from the same settings the booking engine enforces, so once the
          real values are entered, this text updates with them. There is no second copy of these
          numbers to forget.
        </p>
      </aside>
    </div>
  );
}
