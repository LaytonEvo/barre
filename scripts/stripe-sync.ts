/**
 * Push products and prices to Stripe.
 *
 *   npm run stripe:sync
 *
 * Safe to re-run. A product whose price has not moved is left untouched; a
 * changed price creates a new Stripe Price and deactivates the old one, because
 * Stripe Prices are immutable and past purchases must keep resolving to what
 * was actually charged.
 */
import { syncProductsToStripe } from '../lib/stripe/sync';

async function main() {
  const results = await syncProductsToStripe();

  for (const result of results) {
    const suffix = result.reason ? ` (${result.reason})` : '';
    console.warn(`  ${result.action.padEnd(10)} ${result.slug}${suffix}`);
  }

  const changed = results.filter((r) => r.action !== 'unchanged' && r.action !== 'skipped');
  console.warn(`\n${changed.length} product(s) changed, ${results.length} considered.`);
}

main().catch((error) => {
  console.error('Stripe sync failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
