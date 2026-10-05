import { Link } from '@react-email/components';
import { z } from 'zod';
import { CTA, Details, EmailLayout, P } from '@/lib/email/layout';

/**
 * Transactional templates: things that happen because the member did something.
 *
 * Each one exports a Zod schema alongside the component. A notification row can
 * be written days before it is sent, by code that has since changed, so the
 * payload is parsed at send time rather than trusted. A template that cannot
 * render is a failed row with a reason, not a crash in the dispatcher.
 */

const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;

// --- Welcome -----------------------------------------------------------------

export const welcomeSchema = z.object({
  firstName: z.string().optional(),
  siteUrl: z.string().url(),
});

export function Welcome({ firstName, siteUrl }: z.infer<typeof welcomeSchema>) {
  return (
    <EmailLayout
      preview="Your first class is free — here is how to book it"
      heading={firstName ? `Welcome, ${firstName}` : 'Welcome'}
    >
      <P>
        Lovely to have you. Barre blends the grace of ballet with the control of Pilates, the
        flexibility of yoga and a bit of resistance work. It is low impact and kind on the joints,
        but you will feel it for days.
      </P>
      <P>
        <strong>Your first class is free.</strong> Two things before you can book: sign the waiver
        and answer a few health questions. Both take a couple of minutes and only need doing once.
      </P>
      <CTA href={`${siteUrl}/account`} tone="accent">
        Get set up
      </CTA>
      <P>
        Never been near a barre? That is the most common way to arrive. Come to the 6:30pm and say
        so — Kelly will keep an eye on you.
      </P>
    </EmailLayout>
  );
}

// --- Booking confirmed -------------------------------------------------------

export const bookingConfirmedSchema = z.object({
  firstName: z.string().optional(),
  className: z.string(),
  when: z.string(),
  venueName: z.string(),
  venueAddress: z.string().optional(),
  cancellationHours: z.number().int().positive(),
  siteUrl: z.string().url(),
});

export function BookingConfirmed({
  firstName,
  className,
  when,
  venueName,
  venueAddress,
  cancellationHours,
  siteUrl,
}: z.infer<typeof bookingConfirmedSchema>) {
  return (
    <EmailLayout
      preview={`${className}, ${when}`}
      heading="You’re booked in"
      footerNote="The calendar invite is attached."
    >
      <P>{firstName ? `See you there, ${firstName}.` : 'See you there.'}</P>
      <Details
        rows={[
          ['Class', className],
          ['When', when],
          ['Where', venueAddress ? `${venueName}, ${venueAddress}` : venueName],
        ]}
      />
      <P>
        Bring water and wear something you can move in. Socks with grip are ideal but bare feet are
        fine.
      </P>
      <P>
        Need to cancel? Up to <strong>{cancellationHours} hours</strong> before and your credit
        comes straight back.
      </P>
      <CTA href={`${siteUrl}/account/bookings`}>Manage this booking</CTA>
    </EmailLayout>
  );
}

// --- Booking cancelled -------------------------------------------------------

export const bookingCancelledSchema = z.object({
  className: z.string(),
  when: z.string(),
  creditReturned: z.boolean(),
  siteUrl: z.string().url(),
});

export function BookingCancelled({
  className,
  when,
  creditReturned,
  siteUrl,
}: z.infer<typeof bookingCancelledSchema>) {
  return (
    <EmailLayout preview={`Cancelled: ${className}, ${when}`} heading="Booking cancelled">
      <P>
        You are no longer booked onto <strong>{className}</strong> on {when}.
      </P>
      <P>
        {creditReturned
          ? 'Your credit has gone back on your account, ready to use whenever.'
          : 'This was inside the cancellation window, so the credit has been used. Not a telling-off — just so the balance makes sense.'}
      </P>
      <CTA href={`${siteUrl}/timetable`} tone="accent">
        Book another
      </CTA>
    </EmailLayout>
  );
}

// --- Class cancelled by Kelly ------------------------------------------------

export const classCancelledSchema = z.object({
  className: z.string(),
  when: z.string(),
  reason: z.string().optional(),
  remedy: z.enum(['refund', 'credit']),
  siteUrl: z.string().url(),
});

export function ClassCancelled({
  className,
  when,
  reason,
  remedy,
  siteUrl,
}: z.infer<typeof classCancelledSchema>) {
  return (
    <EmailLayout
      preview={`${className} on ${when} is cancelled`}
      heading="Sorry — this class is cancelled"
    >
      <P>
        <strong>{className}</strong> on {when} is not going ahead.
      </P>
      {reason ? <P>{reason}</P> : null}
      <P>
        {remedy === 'refund'
          ? 'You have been refunded in full — nothing for you to do.'
          : 'Your credit is back on your account, ready for another class.'}
      </P>
      <CTA href={`${siteUrl}/timetable`} tone="accent">
        Find another class
      </CTA>
    </EmailLayout>
  );
}

// --- Reminders ---------------------------------------------------------------

export const reminderSchema = z.object({
  className: z.string(),
  when: z.string(),
  venueName: z.string(),
  hoursBefore: z.number().int().positive(),
  cancellationHours: z.number().int().positive(),
  siteUrl: z.string().url(),
});

export function Reminder({
  className,
  when,
  venueName,
  hoursBefore,
  cancellationHours,
  siteUrl,
}: z.infer<typeof reminderSchema>) {
  const soon = hoursBefore <= 3;

  return (
    <EmailLayout
      preview={`${className} ${soon ? 'in a couple of hours' : 'tomorrow'} — ${when}`}
      heading={soon ? 'See you shortly' : 'Class tomorrow'}
    >
      <Details
        rows={[
          ['Class', className],
          ['When', when],
          ['Where', venueName],
        ]}
      />
      {soon ? (
        <P>Water, something to move in, and grippy socks if you have them.</P>
      ) : (
        <P>
          If something has come up, cancelling more than {cancellationHours} hours before returns
          your credit.
        </P>
      )}
      <CTA href={`${siteUrl}/account/bookings`}>My bookings</CTA>
    </EmailLayout>
  );
}

// --- Waitlist ----------------------------------------------------------------

export const waitlistPromotedSchema = z.object({
  className: z.string(),
  when: z.string(),
  venueName: z.string(),
  siteUrl: z.string().url(),
});

export function WaitlistPromoted({
  className,
  when,
  venueName,
  siteUrl,
}: z.infer<typeof waitlistPromotedSchema>) {
  return (
    <EmailLayout
      preview={`A space opened up — you’re in for ${className}`}
      heading="A space opened up, and it’s yours"
    >
      <P>
        You were on the waitlist and somebody dropped out, so you are now <strong>booked</strong> —
        no need to do anything.
      </P>
      <Details
        rows={[
          ['Class', className],
          ['When', when],
          ['Where', venueName],
        ]}
      />
      <P>If you can no longer make it, please cancel so the next person gets the space.</P>
      <CTA href={`${siteUrl}/account/bookings`}>My bookings</CTA>
    </EmailLayout>
  );
}

// --- Purchase receipt --------------------------------------------------------

export const receiptSchema = z.object({
  productName: z.string(),
  amountPence: z.number().int().nonnegative(),
  creditsAdded: z.number().int().nonnegative().optional(),
  expiresAt: z.string().optional(),
  siteUrl: z.string().url(),
});

export function Receipt({
  productName,
  amountPence,
  creditsAdded,
  expiresAt,
  siteUrl,
}: z.infer<typeof receiptSchema>) {
  return (
    <EmailLayout preview={`Receipt: ${productName}`} heading="Thanks — here’s your receipt">
      <Details
        rows={[
          ['Item', productName],
          ['Paid', money(amountPence)],
          ...(creditsAdded
            ? ([['Classes added', String(creditsAdded)]] as [string, string][])
            : []),
          ...(expiresAt ? ([['Use by', expiresAt]] as [string, string][]) : []),
        ]}
      />
      <CTA href={`${siteUrl}/timetable`} tone="accent">
        Book a class
      </CTA>
      <P>
        Your full history is in <Link href={`${siteUrl}/account/billing`}>your account</Link>.
      </P>
    </EmailLayout>
  );
}

// --- Membership --------------------------------------------------------------

export const membershipChangedSchema = z.object({
  productName: z.string(),
  state: z.enum(['started', 'renewed', 'payment_failed', 'cancelled']),
  creditsGranted: z.number().int().nonnegative().optional(),
  graceUntil: z.string().optional(),
  siteUrl: z.string().url(),
});

export function MembershipChanged({
  productName,
  state,
  creditsGranted,
  graceUntil,
  siteUrl,
}: z.infer<typeof membershipChangedSchema>) {
  const headings = {
    started: 'Your membership is live',
    renewed: 'Membership renewed',
    payment_failed: 'Your payment did not go through',
    cancelled: 'Your membership has ended',
  } as const;

  return (
    <EmailLayout preview={`${productName}: ${headings[state]}`} heading={headings[state]}>
      {state === 'payment_failed' ? (
        <>
          <P>
            The card on <strong>{productName}</strong> was declined. It happens — usually an expiry
            date.
          </P>
          <P>
            {graceUntil
              ? `You can still book until ${graceUntil}. Updating the card before then keeps everything as it is.`
              : 'Updating the card will put everything back.'}
          </P>
          <CTA href={`${siteUrl}/account/billing`}>Update payment details</CTA>
        </>
      ) : state === 'cancelled' ? (
        <>
          <P>
            <strong>{productName}</strong> has ended, and you will not be charged again.
          </P>
          <P>
            No hard feelings — the door is open whenever you fancy coming back, and single classes
            are always there.
          </P>
          <CTA href={`${siteUrl}/pricing`}>See the options</CTA>
        </>
      ) : (
        <>
          <P>
            <strong>{productName}</strong> is{' '}
            {state === 'started' ? 'all set up' : 'renewed for another month'}.
          </P>
          {creditsGranted ? (
            <Details rows={[['Classes this period', String(creditsGranted)]]} />
          ) : null}
          <CTA href={`${siteUrl}/timetable`} tone="accent">
            Book a class
          </CTA>
        </>
      )}
    </EmailLayout>
  );
}

// --- Credits expiring --------------------------------------------------------

export const creditsExpiringSchema = z.object({
  credits: z.number().int().positive(),
  expiresAt: z.string(),
  daysLeft: z.number().int().nonnegative(),
  siteUrl: z.string().url(),
});

export function CreditsExpiring({
  credits,
  expiresAt,
  daysLeft,
  siteUrl,
}: z.infer<typeof creditsExpiringSchema>) {
  return (
    <EmailLayout
      preview={`${credits} ${credits === 1 ? 'class' : 'classes'} expiring ${daysLeft === 0 ? 'today' : `in ${daysLeft} days`}`}
      heading={
        credits === 1 ? 'You have a class left to use' : `You have ${credits} classes left to use`
      }
    >
      <P>
        {daysLeft === 0
          ? 'They expire today.'
          : `They expire on ${expiresAt} — ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} away.`}{' '}
        Worth a look at the timetable.
      </P>
      <CTA href={`${siteUrl}/timetable`} tone="accent">
        Book a class
      </CTA>
      <P>If you cannot use them in time, reply to this email and Kelly will sort something out.</P>
    </EmailLayout>
  );
}
