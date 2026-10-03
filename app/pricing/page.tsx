import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'Pricing' };

export default function PricingPage() {
  return (
    <ComingAtMilestone
      title="Pricing"
      milestone="M2"
      summary="Intro offer, drop-in, class packs, memberships and on-demand, with a comparison table and clear expiry rules. Nothing here will quote a price we have not been given."
      needs={[
        'Drop-in price and the intro offer (question B1)',
        'Pack sizes, prices and expiry periods',
        'Membership tiers: name, monthly price, credits included',
        'Whether Kelly is VAT-registered (question B2)',
      ]}
    />
  );
}
