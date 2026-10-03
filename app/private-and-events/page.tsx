import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'Private classes & events' };

export default function PrivateAndEventsPage() {
  return (
    <ComingAtMilestone
      title="Private classes & events"
      milestone="M2"
      summary="An enquiry form for one-to-ones, hen parties, corporate sessions and community events. Enquiries land in the admin inbox at M6."
      needs={['Whether Kelly wants to list indicative prices, or handle each enquiry individually']}
    />
  );
}
