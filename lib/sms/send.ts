import { serverEnv } from '@/lib/env';

/**
 * SMS, behind a flag and off by default (brief §5: "SMS (optional, flag-gated)").
 *
 * Two independent switches, both of which must be on:
 *
 *  1. `feature_sms_enabled` in settings — Kelly's decision, changeable without a
 *     deploy.
 *  2. Twilio credentials in the environment — whether it is even possible.
 *
 * Two switches rather than one because they answer different questions, and the
 * failure modes differ: credentials present with the flag off is a deliberate
 * "not yet", while the flag on with no credentials is a misconfiguration worth
 * reporting rather than silently dropping messages.
 *
 * Deliberately NOT built on the Resend-style client: Twilio's REST API is a single
 * form POST, and an SDK for one endpoint is a dependency with no payoff.
 */

export type SmsResult =
  { ok: true; sid: string } | { ok: false; error: string; configured: boolean };

export function isSmsConfigured(): boolean {
  try {
    const env = serverEnv();
    return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
  } catch {
    return false;
  }
}

/**
 * Normalise a UK mobile number to E.164, which is the only format Twilio accepts.
 *
 * Members type these however they like: "07700 900123", "+44 7700 900123",
 * "0044 7700900123". Returns null rather than guessing when it is not a UK mobile
 * — texting a landline silently fails and costs money.
 */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');

  let national: string;
  if (digits.startsWith('+44')) national = digits.slice(3);
  else if (digits.startsWith('0044')) national = digits.slice(4);
  else if (digits.startsWith('44') && digits.length >= 12) national = digits.slice(2);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else return null;

  // UK mobiles are 07xxx xxxxxx: ten digits after the leading zero, starting 7.
  if (!/^7\d{9}$/.test(national)) return null;

  return `+44${national}`;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!isSmsConfigured()) {
    return { ok: false, error: 'Twilio is not configured.', configured: false };
  }

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = serverEnv();

  const number = toE164(to);
  if (!number) {
    return { ok: false, error: 'Not a UK mobile number.', configured: true };
  }

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: number,
          From: TWILIO_FROM_NUMBER!,
          Body: body,
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        error: `Twilio ${response.status}: ${detail.slice(0, 200)}`,
        configured: true,
      };
    }

    const json = (await response.json()) as { sid?: string };
    return json.sid
      ? { ok: true, sid: json.sid }
      : { ok: false, error: 'Twilio returned no message sid.', configured: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'SMS send threw',
      configured: true,
    };
  }
}

/**
 * SMS bodies.
 *
 * Deliberately terse and separate from the email templates. A text is read on a
 * lock screen in a few words, and every message costs money per segment — 160
 * characters is one segment, 161 is two.
 */
export const SMS_TEMPLATES = {
  reminder_24h: (className: string, when: string) =>
    `Barre By Kelly: ${className} tomorrow, ${when}. Reply to Kelly if you can't make it.`,
  reminder_2h: (className: string, when: string) =>
    `Barre By Kelly: ${className} at ${when} today. See you there!`,
  waitlist_promoted: (className: string, when: string) =>
    // ASCII only, deliberately. An em dash or a curly apostrophe forces the whole
    // message into UCS-2, which cuts the per-segment limit from 160 to 70 and
    // doubles what every one of these costs.
    `Barre By Kelly: a space opened up, so you're booked into ${className}, ${when}.`,
  class_cancelled: (className: string, when: string) =>
    `Barre By Kelly: sorry, ${className} on ${when} is cancelled. You've been refunded.`,
} as const;

export type SmsTemplateName = keyof typeof SMS_TEMPLATES;
