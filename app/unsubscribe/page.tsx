import type { Metadata } from 'next';
import Link from 'next/link';
import { verifyUnsubscribe } from '@/lib/email/links';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * One-click unsubscribe.
 *
 * It acts on GET, which is normally wrong — but here it is the requirement:
 * PECR expects a working opt-out from the email itself, and Gmail's one-click
 * unsubscribe button will not round-trip a form. The signed token is what makes
 * it safe: a link cannot be forged, so a crawler following URLs cannot
 * unsubscribe anyone.
 *
 * It uses the admin client deliberately. The person clicking is, by definition,
 * not logged in — they are in their inbox — so there is no session to act under.
 * The signature is the authority.
 *
 * Marketing consent only. Reminders about classes somebody has booked are not
 * marketing and keep working, which is what they would want.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string }>;
}) {
  const { u: userId, t: token } = await searchParams;

  const valid = Boolean(userId && token && verifyUnsubscribe(userId, token));
  let done = false;

  if (valid && userId) {
    const { error } = await createAdminClient()
      .from('profiles')
      .update({ marketing_consent: false })
      .eq('id', userId);
    done = !error;
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-16 md:px-8">
      {done ? (
        <>
          <h1 className="text-[length:var(--text-2xl)]">Done — you’re unsubscribed</h1>
          <p className="text-secondary mt-3">
            You will not get any more marketing emails from Barre By Kelly.
          </p>
          <p className="text-secondary mt-3">
            You will still get emails about classes you have booked — confirmations, reminders and
            anything about a cancellation. Those are not marketing, and switching them off would
            mean you turned up to a class that was not happening.
          </p>
          <p className="text-secondary mt-3">
            Changed your mind? Turn it back on any time in{' '}
            <Link href="/account" className="text-link underline">
              your account
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <h1 className="text-[length:var(--text-2xl)]">That link didn’t work</h1>
          <p className="text-secondary mt-3">
            It may have been cut in half by your email app, which happens with long links.
          </p>
          <p className="text-secondary mt-3">
            You can turn marketing emails off directly in{' '}
            <Link href="/account" className="text-link underline">
              your account
            </Link>
            , or reply to any email from Kelly and she will do it for you.
          </p>
        </>
      )}
    </div>
  );
}
