import { render } from '@react-email/components';
import type { z } from 'zod';
import type { ReactElement } from 'react';
import * as T from '@/lib/email/templates/transactional';
import * as L from '@/lib/email/templates/lifecycle';

/**
 * Every email the system can send, in one table.
 *
 * Three things live here rather than at each call site:
 *
 *  1. The **subject line**, so it is written once and reviewed alongside the body.
 *  2. The **payload schema**, parsed at send time. A notification row can be
 *     queued days before it is sent, by code that has since changed.
 *  3. Whether it is **marketing**, which decides whether consent is required.
 *     The dispatcher reads this and refuses rather than each caller remembering.
 *
 * `template` in the notifications table is a free-text column, so an unknown
 * value is possible. Looking it up here returns undefined and the row fails with
 * a reason, which is the right outcome: better a failed row naming the template
 * than a silent no-op.
 */

type Entry<S extends z.ZodType> = {
  schema: S;
  subject: (payload: z.infer<S>) => string;
  component: (payload: z.infer<S>) => ReactElement;
  /** Marketing under PECR: needs consent and an unsubscribe link. */
  marketing: boolean;
};

function entry<S extends z.ZodType>(e: Entry<S>): Entry<z.ZodType> {
  return e as unknown as Entry<z.ZodType>;
}

export const TEMPLATES = {
  welcome: entry({
    schema: T.welcomeSchema,
    subject: () => 'Welcome to Barre By Kelly — your first class is free',
    component: T.Welcome,
    marketing: false,
  }),

  booking_confirmed: entry({
    schema: T.bookingConfirmedSchema,
    subject: (p) => `You're booked: ${p.className}, ${p.when}`,
    component: T.BookingConfirmed,
    marketing: false,
  }),

  booking_cancelled: entry({
    schema: T.bookingCancelledSchema,
    subject: (p) => `Cancelled: ${p.className}, ${p.when}`,
    component: T.BookingCancelled,
    marketing: false,
  }),

  class_cancelled: entry({
    schema: T.classCancelledSchema,
    subject: (p) => `Cancelled: ${p.className} on ${p.when}`,
    component: T.ClassCancelled,
    marketing: false,
  }),

  reminder_24h: entry({
    schema: T.reminderSchema,
    subject: (p) => `Tomorrow: ${p.className}, ${p.when}`,
    component: T.Reminder,
    marketing: false,
  }),

  reminder_2h: entry({
    schema: T.reminderSchema,
    subject: (p) => `Shortly: ${p.className}, ${p.when}`,
    component: T.Reminder,
    marketing: false,
  }),

  waitlist_promoted: entry({
    schema: T.waitlistPromotedSchema,
    subject: (p) => `A space opened up — you're in for ${p.className}`,
    component: T.WaitlistPromoted,
    marketing: false,
  }),

  receipt: entry({
    schema: T.receiptSchema,
    subject: (p) => `Your receipt: ${p.productName}`,
    component: T.Receipt,
    marketing: false,
  }),

  membership_changed: entry({
    schema: T.membershipChangedSchema,
    subject: (p) =>
      p.state === 'payment_failed'
        ? 'Your membership payment did not go through'
        : p.state === 'cancelled'
          ? 'Your membership has ended'
          : p.state === 'renewed'
            ? 'Your membership has renewed'
            : 'Your membership is live',
    component: T.MembershipChanged,
    marketing: false,
  }),

  credits_expiring: entry({
    schema: T.creditsExpiringSchema,
    subject: (p) =>
      p.daysLeft === 0
        ? `${p.credits} ${p.credits === 1 ? 'class' : 'classes'} expiring today`
        : `${p.credits} ${p.credits === 1 ? 'class' : 'classes'} expiring in ${p.daysLeft} days`,
    component: T.CreditsExpiring,
    marketing: false,
  }),

  waiver_resign: entry({
    schema: L.waiverResignSchema,
    subject: () => 'A quick signature needed before your next class',
    component: L.WaiverResign,
    marketing: false,
  }),

  // Service, not marketing: it is about a class they attended. Checking somebody
  // is not injured after exercise they paid for is not a marketing message.
  first_class_follow_up: entry({
    schema: L.firstClassFollowUpSchema,
    subject: () => 'How did you get on?',
    component: L.FirstClassFollowUp,
    marketing: false,
  }),

  // Marketing: they have stopped coming, and this exists to sell them another
  // class. Needs consent and an unsubscribe link.
  win_back: entry({
    schema: L.winBackSchema,
    subject: () => 'The barre is still here whenever you fancy it',
    component: L.WinBack,
    marketing: true,
  }),

  review_request: entry({
    schema: L.reviewRequestSchema,
    subject: () => 'Would you mind leaving a review?',
    component: L.ReviewRequest,
    marketing: true,
  }),

  // To the recipient of a gift. They never gave us consent for anything, so it
  // is a one-off service message about a specific gift bought for them — not a
  // route onto a marketing list. The purchaser supplied the address for exactly
  // this purpose, and nothing else is ever sent to it.
  voucher_gift: entry({
    schema: L.voucherGiftSchema,
    subject: (p) =>
      p.purchaserName
        ? `${p.purchaserName} has bought you barre classes`
        : 'Someone has bought you barre classes',
    component: L.VoucherGift,
    marketing: false,
  }),

  voucher_purchased: entry({
    schema: L.voucherPurchasedSchema,
    subject: () => 'Your gift voucher is sorted',
    component: L.VoucherPurchased,
    marketing: false,
  }),
} as const;

export type TemplateName = keyof typeof TEMPLATES;

export function isTemplateName(value: string): value is TemplateName {
  return value in TEMPLATES;
}

export type RenderedEmail = { subject: string; html: string; text: string };

/**
 * Render one template, or explain why not.
 *
 * Returns a result rather than throwing: the caller is a queue dispatcher
 * processing a batch, and one bad payload should fail its own row with a readable
 * error, not abandon the rest of the batch.
 */
export async function renderTemplate(
  name: string,
  payload: unknown,
): Promise<{ ok: true; email: RenderedEmail } | { ok: false; error: string }> {
  if (!isTemplateName(name)) {
    return { ok: false, error: `Unknown template "${name}"` };
  }

  const template = TEMPLATES[name];
  const parsed = template.schema.safeParse(payload);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return { ok: false, error: `Payload does not fit "${name}" — ${issues}` };
  }

  const element = template.component(parsed.data);

  // The plain-text part is not optional. A multipart email without one scores
  // worse with spam filters, and some clients (and most screen readers set to
  // plain text) show it instead of the HTML.
  const [html, text] = await Promise.all([
    render(element, { pretty: false }),
    render(element, { plainText: true }),
  ]);

  return {
    ok: true,
    email: { subject: template.subject(parsed.data), html, text },
  };
}

export function isMarketing(name: string): boolean {
  return isTemplateName(name) ? TEMPLATES[name].marketing : false;
}
