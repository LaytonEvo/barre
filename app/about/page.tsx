import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <ComingAtMilestone
      title="About Kelly"
      milestone="M2"
      summary="Kelly's story, her qualifications and how she teaches."
      needs={[
        'Kelly’s surname and how she wants to be credited (question A2)',
        'Her qualifications, in her own words — these will not be paraphrased or guessed (question A7)',
        'A headshot and a few photos of her teaching',
      ]}
    />
  );
}
