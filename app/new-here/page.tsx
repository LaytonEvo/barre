import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'New here' };

export default function NewHerePage() {
  return (
    <ComingAtMilestone
      title="New here"
      milestone="M2"
      summary="What barre actually is, what to wear and bring, what happens when you arrive, and the questions everyone asks before a first class. Written for someone who is a little nervous."
      needs={[
        'Whether mats and equipment are provided at each venue',
        'Kelly’s pre/postnatal position, and how she wants it worded',
      ]}
    />
  );
}
