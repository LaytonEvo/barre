import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Thank you', robots: { index: false } };

/**
 * Where Stripe sends the buyer back to.
 *
 * It deliberately reads nothing from the query string and asserts nothing about
 * the payment. The voucher is created by the webhook, which is the only thing that
 * knows the payment succeeded; a returning URL can be forged or arrive before the
 * webhook does. So this says what is true either way: it is in hand, and the
 * receipt is coming.
 */
export default function GiftThanksPage() {
  return (
    <div className="mx-auto max-w-lg px-5 py-16 md:px-8">
      <h1 className="text-[length:var(--text-2xl)]">Thank you — that is a lovely present</h1>
      <p className="text-secondary mt-3">
        Your receipt is on its way by email, and it confirms the date we will send the gift.
      </p>
      <p className="text-secondary mt-3">
        If you chose a date, nothing lands in their inbox until that morning. If you did not, they
        will have it within a few minutes.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/account/billing">
          <Button variant="secondary">Your receipts</Button>
        </Link>
        <Link href="/timetable">
          <Button variant="ghost">See the timetable</Button>
        </Link>
      </div>
    </div>
  );
}
