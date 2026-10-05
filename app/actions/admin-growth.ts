'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/supabase/auth';
import { createPromoCode, deactivatePromoCode } from '@/lib/stripe/promos';
import { isStripeConfigured } from '@/lib/stripe/client';

export type GrowthResult = { ok: true; message: string } | { ok: false; error: string } | undefined;

const promoSchema = z
  .object({
    code: z
      .string()
      .min(3)
      .max(40)
      // Stripe accepts letters, digits and dashes only.
      .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only.'),
    description: z.string().max(200).optional(),
    percentOff: z.number().int().min(1).max(100).optional(),
    amountOffPence: z.number().int().min(1).optional(),
    maxRedemptions: z.number().int().min(1).optional(),
    expiresAt: z.string().optional(),
  })
  .refine((v) => Boolean(v.percentOff) !== Boolean(v.amountOffPence), {
    message: 'Set either a percentage or an amount, not both.',
  });

function num(value: FormDataEntryValue | null): number | undefined {
  if (value === null || String(value).trim() === '') return undefined;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function addPromoCode(
  _previous: GrowthResult,
  formData: FormData,
): Promise<GrowthResult> {
  await requireRole('admin');

  if (!isStripeConfigured()) {
    return { ok: false, error: 'Stripe is not configured, so promo codes cannot be created.' };
  }

  const parsed = promoSchema.safeParse({
    code: formData.get('code'),
    description: formData.get('description') || undefined,
    percentOff: num(formData.get('percentOff')),
    amountOffPence: num(formData.get('amountOffPounds'))
      ? Math.round(num(formData.get('amountOffPounds'))! * 100)
      : undefined,
    maxRedemptions: num(formData.get('maxRedemptions')),
    expiresAt: formData.get('expiresAt') || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  try {
    const result = await createPromoCode(parsed.data);
    revalidatePath('/admin/growth');
    return { ok: true, message: `${result.code} is live.` };
  } catch (error) {
    console.error('Promo code creation failed', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not create that code.',
    };
  }
}

export async function retirePromoCode(
  _previous: GrowthResult,
  formData: FormData,
): Promise<GrowthResult> {
  await requireRole('admin');

  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return { ok: false, error: 'Unknown code.' };

  try {
    await deactivatePromoCode(id.data);
    revalidatePath('/admin/growth');
    return { ok: true, message: 'That code no longer works.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not retire that code.',
    };
  }
}
