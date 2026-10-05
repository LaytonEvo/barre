import type Stripe from 'stripe';
import { stripe } from './client';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Sync `products` rows to Stripe Products and Prices.
 *
 * The important asymmetry: a Stripe **Product** can be updated in place, but a
 * Stripe **Price is immutable**. Changing £5 to £6 therefore means creating a
 * new Price and repointing the row, leaving the old Price attached to every
 * purchase that used it — which is exactly what you want, because a receipt
 * from last month must keep showing what was actually paid.
 *
 * Run from the admin screen (M6) or `npm run stripe:sync`. Safe to re-run: a
 * product whose price has not moved is left alone.
 */

export type SyncResult = {
  slug: string;
  action: 'created' | 'updated' | 'repriced' | 'unchanged' | 'skipped';
  reason?: string;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: string;
  price_pence: number;
  currency: string;
  billing_interval: 'month' | 'year' | null;
  active: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
};

export async function syncProductsToStripe(): Promise<SyncResult[]> {
  const client = stripe();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, slug, name, description, kind, price_pence, currency, billing_interval, active, stripe_product_id, stripe_price_id',
    )
    .order('sort_order');

  if (error) throw new Error(`Could not read products: ${error.message}`);

  const results: SyncResult[] = [];

  for (const product of (data ?? []) as ProductRow[]) {
    // The free first class never touches Stripe — see grantIntroOffer. Pushing a
    // £0 Price would create a checkout nobody can complete.
    if (product.price_pence === 0) {
      results.push({
        slug: product.slug,
        action: 'skipped',
        reason: 'free — fulfilled without Stripe',
      });
      continue;
    }

    if (!product.active) {
      results.push({ slug: product.slug, action: 'skipped', reason: 'inactive' });
      continue;
    }

    // --- Product ---------------------------------------------------------
    let stripeProductId = product.stripe_product_id;

    if (stripeProductId) {
      await client.products.update(stripeProductId, {
        name: product.name,
        ...(product.description ? { description: product.description } : {}),
        active: true,
      });
    } else {
      const created = await client.products.create({
        name: product.name,
        ...(product.description ? { description: product.description } : {}),
        metadata: { barre_product_id: product.id, barre_slug: product.slug },
      });
      stripeProductId = created.id;
    }

    // --- Price -----------------------------------------------------------
    let stripePriceId = product.stripe_price_id;
    let action: SyncResult['action'] = stripePriceId ? 'updated' : 'created';

    const existing: Stripe.Price | null = stripePriceId
      ? await client.prices.retrieve(stripePriceId).catch(() => null)
      : null;

    const priceMatches =
      existing !== null &&
      existing.unit_amount === product.price_pence &&
      existing.currency === product.currency.toLowerCase() &&
      existing.active;

    if (!priceMatches) {
      const created = await client.prices.create({
        product: stripeProductId,
        unit_amount: product.price_pence,
        currency: product.currency.toLowerCase(),
        ...(product.kind === 'membership' && product.billing_interval
          ? { recurring: { interval: product.billing_interval } }
          : {}),
        metadata: { barre_product_id: product.id, barre_slug: product.slug },
      });

      // Deactivate rather than delete: the old Price must stay resolvable so
      // historical invoices and receipts keep rendering.
      if (existing?.active) {
        await client.prices.update(existing.id, { active: false });
      }

      stripePriceId = created.id;
      action = existing ? 'repriced' : action;
    } else {
      action = 'unchanged';
    }

    if (
      stripeProductId !== product.stripe_product_id ||
      stripePriceId !== product.stripe_price_id
    ) {
      const { error: updateError } = await supabase
        .from('products')
        .update({ stripe_product_id: stripeProductId, stripe_price_id: stripePriceId })
        .eq('id', product.id);

      if (updateError) {
        throw new Error(
          `Synced ${product.slug} to Stripe but could not save the ids: ${updateError.message}`,
        );
      }
    }

    results.push({ slug: product.slug, action });
  }

  return results;
}
