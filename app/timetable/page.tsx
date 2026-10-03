import type { Metadata } from 'next';
import { ComingAtMilestone } from '@/components/site/coming-at-milestone';

export const metadata: Metadata = { title: 'Timetable' };

export default function TimetablePage() {
  return (
    <ComingAtMilestone
      title="Timetable"
      milestone="M2"
      summary="A week view — a list on mobile, a grid on desktop — filterable by venue and class type, with live spaces-left counts and Book, Join waitlist or Full on every session. Booking itself goes live at M5."
      needs={[
        'The real timetable: day, time, duration, class type and venue for each class (question A4)',
        'Venue names and capacities (question A3)',
        'Class type names (question A5)',
      ]}
    />
  );
}
