import { z } from 'zod';
import { CTA, Details, EmailLayout, P } from '@/lib/email/layout';
import { Link } from '@react-email/components';

/**
 * Lifecycle templates: things the system decides to send.
 *
 * The consent line matters and is not uniform. Under UK GDPR and PECR:
 *
 *  - Asking somebody how their first class went, or telling them credits are
 *    about to expire, is **service** email about a thing they bought. No
 *    marketing consent needed, and no unsubscribe link, because unsubscribing
 *    from your own receipt is not a thing.
 *  - A win-back to somebody who has stopped coming is **marketing**. It needs
 *    marketing consent and an unsubscribe link, and the dispatcher refuses to
 *    send it without the first.
 *
 * Each template declares which it is via `requiresMarketingConsent` in the
 * registry, so the decision is data rather than something each caller remembers.
 */

// --- After a first class -----------------------------------------------------

export const firstClassFollowUpSchema = z.object({
  firstName: z.string().optional(),
  className: z.string(),
  creditsLeft: z.number().int().nonnegative(),
  siteUrl: z.string().url(),
});

export function FirstClassFollowUp({
  firstName,
  className,
  creditsLeft,
  siteUrl,
}: z.infer<typeof firstClassFollowUpSchema>) {
  return (
    <EmailLayout
      preview="How did you get on?"
      heading={firstName ? `How did you get on, ${firstName}?` : 'How did you get on?'}
    >
      <P>
        You came to {className}. If your legs are complaining today, that is the barre working and
        it settles after the second or third class.
      </P>
      <P>
        The honest advice: the first one tells you very little. Come twice more and you will feel
        the difference in how you stand.
      </P>
      {creditsLeft > 0 ? (
        <P>
          You have <strong>{creditsLeft}</strong> {creditsLeft === 1 ? 'class' : 'classes'} left on
          your account.
        </P>
      ) : null}
      <CTA href={`${siteUrl}/timetable`} tone="accent">
        Book your next one
      </CTA>
      <P>
        Anything hurt that should not have? Reply and tell Kelly — she will adapt things for you
        next time.
      </P>
    </EmailLayout>
  );
}

// --- Win-back (MARKETING) ----------------------------------------------------

export const winBackSchema = z.object({
  firstName: z.string().optional(),
  weeksAway: z.number().int().positive(),
  creditsLeft: z.number().int().nonnegative(),
  siteUrl: z.string().url(),
  unsubscribeUrl: z.string().url(),
});

export function WinBack({
  firstName,
  weeksAway,
  creditsLeft,
  siteUrl,
  unsubscribeUrl,
}: z.infer<typeof winBackSchema>) {
  return (
    <EmailLayout
      preview="The barre is still here whenever you fancy it"
      heading={firstName ? `We’ve missed you, ${firstName}` : 'We’ve missed you'}
      unsubscribeUrl={unsubscribeUrl}
    >
      <P>
        It has been about {weeksAway} {weeksAway === 1 ? 'week' : 'weeks'}. No guilt intended — life
        gets busy, and barre is not going anywhere.
      </P>
      {creditsLeft > 0 ? (
        <P>
          You still have <strong>{creditsLeft}</strong> {creditsLeft === 1 ? 'class' : 'classes'} on
          your account, so your next one is already paid for.
        </P>
      ) : (
        <P>
          If getting out in the evening is the hard part, there is a library of classes you can do
          at home in twenty minutes.
        </P>
      )}
      <CTA href={`${siteUrl}/timetable`} tone="accent">
        Have a look at the timetable
      </CTA>
      <P>
        And if barre has run its course for you, that is genuinely fine —{' '}
        <Link href={unsubscribeUrl}>unsubscribe here</Link> and we will stop emailing.
      </P>
    </EmailLayout>
  );
}

// --- Review request ----------------------------------------------------------

export const reviewRequestSchema = z.object({
  firstName: z.string().optional(),
  classesAttended: z.number().int().positive(),
  reviewUrl: z.string().url(),
  unsubscribeUrl: z.string().url(),
});

export function ReviewRequest({
  firstName,
  classesAttended,
  reviewUrl,
  unsubscribeUrl,
}: z.infer<typeof reviewRequestSchema>) {
  return (
    <EmailLayout
      preview="Would you mind leaving a review?"
      heading="Would you mind a quick favour?"
      unsubscribeUrl={unsubscribeUrl}
    >
      <P>
        {firstName ? `${firstName}, you have` : 'You have'} been to {classesAttended} classes now,
        which means you actually know what they are like.
      </P>
      <P>
        Most people find a local class by reading what someone else said about it. If you have two
        minutes, a few honest words would genuinely help.
      </P>
      {/* Deliberately offers nothing in return. Google's policies prohibit
          incentivised review requests, and a review bought with a free class is
          worth nothing to the next person reading it. */}
      <CTA href={reviewUrl}>Leave a review</CTA>
      <P>
        And if it is not been your thing, saying so to Kelly directly is more useful than a star.
      </P>
    </EmailLayout>
  );
}

// --- Gift voucher, to the recipient ------------------------------------------

export const voucherGiftSchema = z.object({
  recipientName: z.string().optional(),
  purchaserName: z.string().optional(),
  code: z.string(),
  description: z.string(),
  message: z.string().optional(),
  expiresAt: z.string(),
  siteUrl: z.string().url(),
});

export function VoucherGift({
  recipientName,
  purchaserName,
  code,
  description,
  message,
  expiresAt,
  siteUrl,
}: z.infer<typeof voucherGiftSchema>) {
  return (
    <EmailLayout
      preview={`${purchaserName ? `${purchaserName} has` : 'Someone has'} bought you barre classes`}
      heading={
        recipientName ? `${recipientName}, you’ve been given barre` : 'You’ve been given barre'
      }
    >
      <P>
        {purchaserName ? <strong>{purchaserName}</strong> : 'Someone'} has bought you {description}{' '}
        at Barre By Kelly, a friendly local class near Ringwood.
      </P>

      {message ? <Details rows={[['Their message', message]]} /> : null}

      <Details
        rows={[
          ['Your code', code],
          ['Valid until', expiresAt],
        ]}
      />

      <P>
        Create an account, enter the code, and it becomes classes on your account. You can book any
        class on the timetable.
      </P>
      <CTA href={`${siteUrl}/redeem?code=${encodeURIComponent(code)}`} tone="accent">
        Redeem your voucher
      </CTA>
      <P>
        Never done barre? Neither had most people in the room. It blends ballet, Pilates and yoga,
        it is low impact, and nobody will mind that it is your first time.
      </P>
    </EmailLayout>
  );
}

// --- Gift voucher, confirmation to the buyer ---------------------------------

export const voucherPurchasedSchema = z.object({
  recipientEmail: z.string(),
  description: z.string(),
  sendAt: z.string(),
  alreadySent: z.boolean(),
  siteUrl: z.string().url(),
});

export function VoucherPurchased({
  recipientEmail,
  description,
  sendAt,
  alreadySent,
  siteUrl,
}: z.infer<typeof voucherPurchasedSchema>) {
  return (
    <EmailLayout preview="Your gift voucher is sorted" heading="Your gift is sorted">
      <P>Thank you — that is a nice present to give somebody.</P>
      <Details
        rows={[
          ['Gift', description],
          ['For', recipientEmail],
          [alreadySent ? 'Sent' : 'We will email them on', sendAt],
        ]}
      />
      <P>
        {alreadySent
          ? 'They have the code already.'
          : 'Nothing more for you to do — we will email them the code on that date so it arrives at the right time.'}
      </P>
      <CTA href={`${siteUrl}/account/billing`}>Your receipts</CTA>
    </EmailLayout>
  );
}

// --- Waiver re-sign needed ---------------------------------------------------

export const waiverResignSchema = z.object({
  siteUrl: z.string().url(),
});

export function WaiverResign({ siteUrl }: z.infer<typeof waiverResignSchema>) {
  return (
    <EmailLayout
      preview="A quick signature needed before your next class"
      heading="One quick thing before your next class"
    >
      <P>
        The waiver has been updated, so it needs signing again before you can book. It takes under a
        minute.
      </P>
      <P>
        Nothing is wrong and nothing has been cancelled — this is the same form with revised
        wording, and the law treats a changed form as a new one.
      </P>
      <CTA href={`${siteUrl}/account/waiver`}>Read and sign</CTA>
    </EmailLayout>
  );
}
