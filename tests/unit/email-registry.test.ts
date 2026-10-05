import { describe, expect, it } from 'vitest';
import { TEMPLATES, isMarketing, renderTemplate } from '@/lib/email/registry';

const SITE = 'https://barrebykelly.example';

/** A valid payload for each template, so every one is actually rendered. */
const PAYLOADS: Record<string, Record<string, unknown>> = {
  welcome: { firstName: 'Jo', siteUrl: SITE },
  booking_confirmed: {
    firstName: 'Jo',
    className: 'Barre',
    when: 'Monday 12 October, 18:30',
    venueName: "St Leonard's Village Hall",
    cancellationHours: 24,
    siteUrl: SITE,
  },
  booking_cancelled: {
    className: 'Barre',
    when: 'Monday 12 October',
    creditReturned: true,
    siteUrl: SITE,
  },
  class_cancelled: {
    className: 'Barre',
    when: 'Monday 12 October',
    remedy: 'refund',
    siteUrl: SITE,
  },
  reminder_24h: {
    className: 'Barre',
    when: 'Monday 12 October, 18:30',
    venueName: 'Village Hall',
    hoursBefore: 24,
    cancellationHours: 24,
    siteUrl: SITE,
  },
  reminder_2h: {
    className: 'Barre',
    when: 'Monday 12 October, 18:30',
    venueName: 'Village Hall',
    hoursBefore: 2,
    cancellationHours: 24,
    siteUrl: SITE,
  },
  waitlist_promoted: {
    className: 'Barre',
    when: 'Monday 12 October',
    venueName: 'Village Hall',
    siteUrl: SITE,
  },
  receipt: { productName: 'Buy 5, get 1 free', amountPence: 2500, creditsAdded: 6, siteUrl: SITE },
  membership_changed: { productName: 'Monthly', state: 'started', siteUrl: SITE },
  credits_expiring: { credits: 3, expiresAt: '31 October', daysLeft: 7, siteUrl: SITE },
  waiver_resign: { siteUrl: SITE },
  first_class_follow_up: { firstName: 'Jo', className: 'Barre', creditsLeft: 2, siteUrl: SITE },
  win_back: {
    firstName: 'Jo',
    weeksAway: 6,
    creditsLeft: 1,
    siteUrl: SITE,
    unsubscribeUrl: `${SITE}/unsubscribe?t=abc`,
  },
  review_request: {
    firstName: 'Jo',
    classesAttended: 3,
    reviewUrl: 'https://g.page/r/example/review',
    unsubscribeUrl: `${SITE}/unsubscribe?t=abc`,
  },
  voucher_gift: {
    recipientName: 'Sam',
    purchaserName: 'Jo',
    code: 'BARRE-7KQ2-M4XZ',
    description: 'six classes',
    message: 'Happy birthday!',
    expiresAt: '31 December 2027',
    siteUrl: SITE,
  },
  voucher_purchased: {
    recipientEmail: 'sam@example.com',
    description: 'six classes',
    sendAt: '25 December',
    alreadySent: false,
    siteUrl: SITE,
  },
};

describe('every template renders', () => {
  for (const name of Object.keys(TEMPLATES)) {
    it(`${name} produces a subject, HTML and plain text`, async () => {
      const payload = PAYLOADS[name];
      expect(payload, `no test payload for ${name}`).toBeDefined();

      const result = await renderTemplate(name, payload);
      if (!result.ok) throw new Error(result.error);

      expect(result.email.subject.length).toBeGreaterThan(5);
      expect(result.email.html).toContain('<html');
      // The plain-text part is a spam-filter requirement, not a nicety.
      expect(result.email.text.length).toBeGreaterThan(40);
      expect(result.email.text).not.toContain('<div');
    });
  }

  it('covers every template in the registry, so a new one cannot go untested', () => {
    expect(Object.keys(PAYLOADS).sort()).toEqual(Object.keys(TEMPLATES).sort());
  });
});

describe('subjects', () => {
  it('names the class, so a full inbox is still scannable', async () => {
    const result = await renderTemplate('booking_confirmed', PAYLOADS.booking_confirmed);
    expect(result.ok && result.email.subject).toContain('Barre');
  });

  it('distinguishes a 24h reminder from a 2h one', async () => {
    const day = await renderTemplate('reminder_24h', PAYLOADS.reminder_24h);
    const soon = await renderTemplate('reminder_2h', PAYLOADS.reminder_2h);
    expect(day.ok && day.email.subject).not.toBe(soon.ok && soon.email.subject);
  });

  it('singularises one expiring credit', async () => {
    const one = await renderTemplate('credits_expiring', {
      ...PAYLOADS.credits_expiring,
      credits: 1,
    });
    expect(one.ok && one.email.subject).toContain('1 class ');
    expect(one.ok && one.email.subject).not.toContain('classes');
  });

  it('says "today" rather than "in 0 days"', async () => {
    const today = await renderTemplate('credits_expiring', {
      ...PAYLOADS.credits_expiring,
      daysLeft: 0,
    });
    expect(today.ok && today.email.subject).toContain('today');
    expect(today.ok && today.email.subject).not.toContain('0 days');
  });
});

describe('marketing classification', () => {
  it('treats win-back and review requests as marketing', () => {
    expect(isMarketing('win_back')).toBe(true);
    expect(isMarketing('review_request')).toBe(true);
  });

  it('treats receipts, reminders and cancellations as service email', () => {
    // These are about something the member bought. Requiring marketing consent
    // for a booking confirmation would mean not sending one.
    for (const name of ['receipt', 'reminder_24h', 'booking_confirmed', 'class_cancelled']) {
      expect(isMarketing(name), name).toBe(false);
    }
  });

  it('treats the first-class follow-up as service, not marketing', () => {
    // It asks whether a class they paid for hurt them. That is not a sales email.
    expect(isMarketing('first_class_follow_up')).toBe(false);
  });

  it('treats a gift voucher to its recipient as service', () => {
    // The purchaser gave us the address for this one delivery. Nothing else is
    // ever sent to it, so it needs no consent — but it must also never become a
    // marketing list, which is why it is not flagged marketing to be "safe".
    expect(isMarketing('voucher_gift')).toBe(false);
  });

  it('gives every marketing template an unsubscribe link in the body', async () => {
    for (const [name, template] of Object.entries(TEMPLATES)) {
      if (!template.marketing) continue;
      const result = await renderTemplate(name, PAYLOADS[name]);
      expect(result.ok && result.email.html, name).toContain('/unsubscribe');
    }
  });
});

describe('renderTemplate guards', () => {
  it('names an unknown template rather than silently sending nothing', async () => {
    const result = await renderTemplate('does_not_exist', {});
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('does_not_exist');
  });

  it('rejects a payload missing a required field, and says which', async () => {
    const result = await renderTemplate('booking_confirmed', { className: 'Barre' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('when');
  });

  it('rejects a siteUrl that is not a URL, which would render a broken button', async () => {
    const result = await renderTemplate('welcome', { siteUrl: 'barrebykelly' });
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown membership state rather than rendering a blank heading', async () => {
    const result = await renderTemplate('membership_changed', {
      productName: 'Monthly',
      state: 'exploded',
      siteUrl: SITE,
    });
    expect(result.ok).toBe(false);
  });
});

describe('content', () => {
  it('puts the voucher code in the gift email', async () => {
    const result = await renderTemplate('voucher_gift', PAYLOADS.voucher_gift);
    expect(result.ok && result.email.html).toContain('BARRE-7KQ2-M4XZ');
    // And in the plain-text part, which is what some recipients will read.
    expect(result.ok && result.email.text).toContain('BARRE-7KQ2-M4XZ');
  });

  it('includes the personal message from the buyer', async () => {
    const result = await renderTemplate('voucher_gift', PAYLOADS.voucher_gift);
    expect(result.ok && result.email.html).toContain('Happy birthday!');
  });

  it('offers nothing in return for a review', async () => {
    // Google prohibits incentivised reviews, and a bought review is worthless to
    // the next person reading it.
    const result = await renderTemplate('review_request', PAYLOADS.review_request);
    const text = (result.ok ? result.email.text : '').toLowerCase();
    for (const bribe of ['free class', 'discount', 'in return', 'reward', '% off']) {
      expect(text, bribe).not.toContain(bribe);
    }
  });

  it('tells a member their credit came back when it did', async () => {
    const back = await renderTemplate('booking_cancelled', {
      ...PAYLOADS.booking_cancelled,
      creditReturned: true,
    });
    expect(back.ok && back.email.text).toContain('back on your account');

    const kept = await renderTemplate('booking_cancelled', {
      ...PAYLOADS.booking_cancelled,
      creditReturned: false,
    });
    expect(kept.ok && kept.email.text).toContain('cancellation window');
  });

  it('escapes a payload value rather than injecting markup', async () => {
    const result = await renderTemplate('voucher_gift', {
      ...PAYLOADS.voucher_gift,
      message: '<script>alert(1)</script>',
    });
    expect(result.ok && result.email.html).not.toContain('<script>');
  });
});
