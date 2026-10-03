import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <ComingAtMilestone
      title="Contact"
      milestone="M2"
      summary="A form that lands in Kelly's admin inbox, plus her email, phone and socials."
      needs={['Contact email, phone number and Instagram handle (question A6)']}
    />
  );
}
