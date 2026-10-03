import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  return (
    <ComingAtMilestone
      title="Privacy policy"
      milestone="M3"
      summary="What we collect, the lawful basis for each use, how health data is handled as special category data under UK GDPR, who processes it (Supabase, Stripe, Mux, Resend, Vercel), how long we keep it, and your rights."
      needs={[
        'The data controller’s name and registered address',
        'Retention periods Kelly is comfortable with',
        'Whether Kelly has registered with the ICO — processing health data almost certainly requires it',
      ]}
    />
  );
}
