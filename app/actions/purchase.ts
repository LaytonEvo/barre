'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Route } from 'next';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/auth';
import { createCheckoutSession, createPortalSession } from '@/lib/stripe/checkout';
import { grantIntroOffer } from '@/lib/credits/intro-offer';

/**
 * Buying.
 *
 * Every action re-establishes who the member is on the server with
 * `requireUser()`. A user id is never accepted from the form — that would let
 * anyone buy credits into somebody else's account, or worse, claim their free
 * class.
 */

export type PurchaseResult = { error: string } | undefined;

const slugSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Unknown product.'),
});

export async function startCheckout(formData: FormData): Promise<PurchaseResult> {
  const user = await requireUser();

  const parsed = slugSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Unknown product.' };

  let url: string;
  try {
    ({ url } = await createCheckoutSession(user.id, parsed.data.slug));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start checkout.';
    // The product-level messages ("not on sale at the moment") are safe to show;
    // anything else is logged rather than leaked.
    console.error('Checkout failed', error);
    return {
      error: message.startsWith('That product')
        ? message
        : 'Could not start checkout. Please try again.',
    };
  }

  // Stripe's hosted checkout, deliberately off-site.
  redirect(url as Route);
}

export async function claimFreeClass(): Promise<PurchaseResult> {
  const user = await requireUser();

  const result = await grantIntroOffer(user.id);
  if (!result.ok) return { error: result.message };

  revalidatePath('/account');
  revalidatePath('/account/billing');
  redirect('/account?welcome=free-class');
}

export async function openBillingPortal(): Promise<PurchaseResult> {
  const user = await requireUser();

  let url: string;
  try {
    ({ url } = await createPortalSession(user.id));
  } catch (error) {
    console.error('Billing portal failed', error);
    return { error: 'Could not open the billing portal. Please try again.' };
  }

  redirect(url as Route);
}
