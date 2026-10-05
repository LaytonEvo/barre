import {
  buildBusiness,
  buildClass,
  buildFaq,
  buildInstructor,
  buildSessions,
  buildVenue,
  type JsonLdObject,
} from './structured-data';
import type { ClassType, Faq, Venue } from '@/lib/queries/catalogue';
import type { TimetableSession } from '@/lib/queries/timetable';

/**
 * Thin renderers over the pure builders in structured-data.ts, which is where
 * the logic and the tests live.
 */
function JsonLd({ data }: { data: JsonLdObject | null }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      // Built from our own database rows, never from user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export const VenueJsonLd = ({ venue }: { venue: Venue }) => <JsonLd data={buildVenue(venue)} />;

export const BusinessJsonLd = ({ venues }: { venues: Venue[] }) => (
  <JsonLd data={buildBusiness(venues)} />
);

export const SessionsJsonLd = ({
  sessions,
  introOfferIsFree,
}: {
  sessions: TimetableSession[];
  introOfferIsFree: boolean;
}) => <JsonLd data={buildSessions(sessions, { introOfferIsFree })} />;

export const FaqJsonLd = ({ faqs }: { faqs: Faq[] }) => <JsonLd data={buildFaq(faqs)} />;

export const InstructorJsonLd = (props: {
  name: string;
  bio: string | null;
  qualifications: string[];
}) => <JsonLd data={buildInstructor(props)} />;

export const ClassJsonLd = ({ classType }: { classType: ClassType }) => (
  <JsonLd data={buildClass(classType)} />
);
