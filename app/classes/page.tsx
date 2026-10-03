import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'Classes' };

export default function ClassesPage() {
  return (
    <ComingAtMilestone
      title="Classes"
      milestone="M2"
      summary="One page per class type: what to expect, the level, the intensity, what to bring, and the next sessions you can book."
      needs={['How many distinct class types there are, and their names (question A5)']}
    />
  );
}
