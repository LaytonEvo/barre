import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <ComingAtMilestone
      title="Terms and conditions"
      milestone="M3"
      summary="Drafted alongside the waiver, and clearly marked as draft until a legal professional has reviewed it."
      needs={['The data controller’s registered name and address', 'Legal review before launch']}
    />
  );
}
