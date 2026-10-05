import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';

/**
 * Stripe client. Server-only — `serverEnv()` throws if imported into a client
 * bundle, which is the cheapest guard against the secret key escaping.
 *
 * Constructed lazily so a checkout that nobody has triggered does not make the
 * whole app refuse to boot before Stripe keys are configured. Through M0–M3 the
 * site runs perfectly well without them.
 */
let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;

  const { STRIPE_SECRET_KEY } = serverEnv();
  if (!STRIPE_SECRET_KEY) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Copy it from the Stripe dashboard into .env.local.',
    );
  }

  cached = new Stripe(STRIPE_SECRET_KEY, {
    // Pinned deliberately. Stripe ships breaking changes behind versions, and a
    // silent upgrade is the last thing a payment path needs.
    apiVersion: '2026-09-30.endive',
    appInfo: { name: 'Barre By Kelly', url: 'https://github.com/LaytonEvo/barre' },
    typescript: true,
  });

  return cached;
}

export function isStripeConfigured(): boolean {
  try {
    return Boolean(serverEnv().STRIPE_SECRET_KEY);
  } catch {
    return false;
  }
}
