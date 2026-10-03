import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'Cookie policy' };

export default function CookiesPage() {
  return (
    <ComingAtMilestone
      title="Cookie policy"
      milestone="M2"
      summary="What we set and why. Analytics only loads after consent, which is what UK PECR requires."
    />
  );
}
