import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'Locations' };

export default function LocationsPage() {
  return (
    <ComingAtMilestone
      title="Locations"
      milestone="M2"
      summary="A page per venue with a map, parking, access notes, photos and the classes held there. These pages are the main local-SEO asset, so they matter more than their length suggests."
      needs={[
        'Full address and postcode for each venue (question A3)',
        'Parking, entrance, changing and toilet notes',
        'The town, which every local-SEO decision depends on (question A1)',
      ]}
    />
  );
}
