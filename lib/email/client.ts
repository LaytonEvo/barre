import { Resend } from 'resend';
import { serverEnv } from '@/lib/env';

/**
 * Resend client, lazily constructed for the same reason as Stripe and Mux: the
 * site has to run on a checkout with no email credentials.
 */
let cached: Resend | null = null;

export function resend(): Resend {
  if (cached) return cached;

  const { RESEND_API_KEY } = serverEnv();
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set. Create one at resend.com/api-keys.');
  }

  cached = new Resend(RESEND_API_KEY);
  return cached;
}

export function isEmailConfigured(): boolean {
  try {
    const env = serverEnv();
    return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  } catch {
    return false;
  }
}

/**
 * The From address.
 *
 * Deliberately throws rather than falling back to a default. A guessed sender
 * domain fails SPF and lands the whole send in spam — silently, and for every
 * email after it. Better to refuse to send than to train Gmail to distrust the
 * domain.
 */
export function emailFrom(): string {
  const { EMAIL_FROM } = serverEnv();
  if (!EMAIL_FROM) {
    throw new Error('EMAIL_FROM is not set, e.g. "Barre By Kelly <hello@barrebykelly.co.uk>".');
  }
  return EMAIL_FROM;
}
