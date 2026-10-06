import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8');

/**
 * Payment-path guarantees, asserted against the source.
 *
 * These are structural rather than behavioural: exercising them properly needs a
 * live Stripe and a live database, which is what the M9 end-to-end suite is for.
 * What they catch is the specific class of regression that would be both easy to
 * introduce and expensive to discover — fulfilment creeping out of the webhook,
 * or the signature check being softened.
 */
describe('fulfilment happens only in the webhook', () => {
  it('no page, action or component grants credits', () => {
    // grant_credits may be called from the webhook, the free intro offer and
    // the seed. Anywhere else means money was not necessarily taken.
    const allowed = [
      'lib/stripe/fulfilment.ts',
      'lib/credits/intro-offer.ts',
      'supabase/migrations',
      'tests/',
    ];

    const offenders: string[] = [];
    for (const file of [
      'app/actions/purchase.ts',
      'app/actions/enquiry.ts',
      'app/(site)/account/billing/page.tsx',
      'app/(site)/pricing/page.tsx',
      'components/site/buy-button.tsx',
    ]) {
      if (read(file).includes('grant_credits')) offenders.push(file);
    }

    expect(offenders, `${allowed.join(', ')} are the only places that may grant`).toEqual([]);
  });

  it('the checkout success page does not fulfil anything', () => {
    // A member can reach this URL by typing it. If it granted credits, that
    // would be free classes for anyone who guessed the query string.
    const billing = read('app/(site)/account/billing/page.tsx');
    expect(billing).not.toContain('grant_credits');
    expect(billing).not.toContain('createAdminClient');
  });
});

describe('webhook safety', () => {
  const webhook = read('app/api/stripe/webhook/route.ts');

  it('verifies the Stripe signature', () => {
    expect(webhook).toContain('constructEvent');
    expect(webhook).toContain('STRIPE_WEBHOOK_SECRET');
  });

  it('reads the raw body, since parsing first would invalidate the signature', () => {
    expect(webhook).toContain('request.text()');
    expect(webhook).not.toContain('request.json()');
  });

  it('claims the event id before fulfilling, so a retry cannot double-grant', () => {
    const claimAt = webhook.indexOf("from('stripe_events').insert");
    const fulfilAt = webhook.indexOf('handleCheckoutCompleted(');
    expect(claimAt).toBeGreaterThan(-1);
    expect(fulfilAt).toBeGreaterThan(claimAt);
  });

  it('answers a duplicate with 200 so Stripe stops retrying', () => {
    expect(webhook).toContain('duplicate: true');
  });

  it('returns 500 on a failed handler so Stripe retries', () => {
    expect(webhook).toMatch(/Fulfilment failed[\s\S]*status: 500/);
  });

  it('does not leak why a signature failed', () => {
    // Echoing the reason tells someone probing the endpoint how close they got.
    expect(webhook).toContain("error: 'Invalid signature.'");
  });
});

describe('checkout', () => {
  const checkout = read('lib/stripe/checkout.ts');

  it('refuses to create a session for a free product', () => {
    // A £0 Checkout Session cannot be completed, so the member would be stuck.
    expect(checkout).toContain('price_pence === 0');
  });

  it('refuses a product that has not been synced to Stripe', () => {
    expect(checkout).toContain('stripe_price_id');
  });

  it('puts the user and product in metadata, so the webhook trusts no URL', () => {
    expect(checkout).toContain('barre_user_id');
    expect(checkout).toContain('barre_product_id');
  });

  it('never takes a user id from the caller', () => {
    const actions = read('app/actions/purchase.ts');
    expect(actions).toContain('requireUser()');
    // The only thing the form supplies is a slug.
    expect(actions).toContain('slugSchema');
  });
});

describe('intro offer', () => {
  const intro = read('lib/credits/intro-offer.ts');

  it('claims eligibility by insert, not by checking first', () => {
    // A read-then-write leaves a window where two requests both pass the check.
    const insertAt = intro.indexOf("from('intro_offer_claims').insert");
    const grantAt = intro.indexOf("rpc('grant_credits'");
    expect(insertAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(insertAt);
  });

  it('treats a unique violation as "already claimed"', () => {
    expect(intro).toContain("'23505'");
    expect(intro).toContain('already_claimed');
  });

  it('refuses to give away a paid intro offer for free', () => {
    expect(intro).toContain('price_pence > 0');
  });

  it('surfaces a failed grant rather than swallowing it', () => {
    // The claim is recorded but the credit is not: somebody is owed a class.
    expect(intro).toContain('contact Kelly');
  });
});

describe('credit expiry cron', () => {
  const cron = read('app/api/cron/expire-credits/route.ts');

  it('requires the shared secret', () => {
    expect(cron).toContain('CRON_SECRET');
    expect(cron).toMatch(/status: 401/);
  });

  // The property that matters — that a missed run can never let somebody book
  // with dead credits — is asserted behaviourally in tests/db/ledger.sql
  // ("an expired lot is excluded from the balance with no cron run at all").
  // Asserting it here against the source comment would be weaker and would pass
  // even if the behaviour changed.
});
