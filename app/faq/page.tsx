import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'FAQs' };

export default function FaqPage() {
  return (
    <ComingAtMilestone
      title="Frequently asked questions"
      milestone="M2"
      summary="Booking, cancellations, packs, memberships, and health and safety. The booking and cancellation answers are generated from the policy settings, so they cannot drift from what the system actually does."
      needs={['Confirmation of the cancellation and booking rules (questions C1 to C8)']}
    />
  );
}
