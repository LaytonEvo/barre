'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { createGiftCheckoutSession, giftSchema } from '@/lib/stripe/gift';
import { isStripeConfigured } from '@/lib/stripe/client';

export type GiftResult = { ok: false; error: string } | undefined;

/**
 * Buy a gift voucher.
 *
 * Redirects to Stripe on success, so there is no success branch to return — the
 * caller either gets an error back or the browser leaves.
 */
export async function buyGift(_previous: GiftResult, formData: FormData): Promise<GiftResult> {
  const user = await requireUser('/gift');

  if (!isStripeConfigured()) {
    return { ok: false, error: 'Payments are not set up yet, so gifts cannot be bought.' };
  }

  const parsed = giftSchema.safeParse({
    productSlug: formData.get('productSlug'),
    recipientName: formData.get('recipientName') || undefined,
    recipientEmail: formData.get('recipientEmail'),
    message: formData.get('message') || undefined,
    sendOn: formData.get('sendOn') || undefined,
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join('.');
    return {
      ok: false,
      error:
        field === 'recipientEmail'
          ? 'That email address does not look right — it is where the gift goes, so it is worth checking.'
          : 'Please check the form and try again.',
    };
  }

  // A date in the past would mean "send immediately", which is probably a typo
  // rather than an intention. Saying so beats silently sending it today.
  if (parsed.data.sendOn) {
    const when = new Date(`${parsed.data.sendOn}T09:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (when < today) {
      return { ok: false, error: 'That date has already passed — pick today or later.' };
    }
  }

  let url: string;
  try {
    ({ url } = await createGiftCheckoutSession(user.id, parsed.data));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not start the payment.',
    };
  }

  // Stripe's hosted checkout, deliberately off-site.
  redirect(url as Route);
}

/** Redeem a code. */
export async function redeemVoucher(
  _previous: { ok: boolean; message?: string; error?: string } | undefined,
  formData: FormData,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  await requireUser('/redeem');

  const code = z.string().min(4).max(40).safeParse(formData.get('code'));
  if (!code.success) {
    return { ok: false, error: 'Enter the code from the email or card.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('redeem_voucher', { p_code: code.data });

  if (error) {
    const known: Record<string, string> = {
      voucher_not_found: 'That code was not recognised. Check it and try again.',
      voucher_already_redeemed: 'That voucher has already been used.',
      voucher_expired: 'That voucher has expired. Reply to the email and Kelly will help.',
      voucher_has_no_value: 'Something is wrong with that voucher — please let Kelly know.',
      not_signed_in: 'Please log in first.',
    };
    for (const [token, message] of Object.entries(known)) {
      if (error.message.includes(token)) return { ok: false, error: message };
    }
    return { ok: false, error: 'Could not redeem that code.' };
  }

  const result = data?.[0];
  return {
    ok: true,
    message: result ? `Added ${result.description} to your account.` : 'Voucher redeemed.',
  };
}
