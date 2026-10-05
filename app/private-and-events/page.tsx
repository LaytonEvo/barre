import type { Metadata } from 'next';
import { localSuffix, SITE } from '@/lib/seo/site';
import { EnquiryForm } from '@/components/site/enquiry-form';

export const metadata: Metadata = {
  title: `Private classes & events — ${localSuffix}`,
  description: `Private barre classes, hen parties, corporate sessions and community events in ${SITE.town} and the surrounding villages.`,
  alternates: { canonical: '/private-and-events' },
};

const IDEAS = [
  {
    title: 'One to one',
    body: 'An hour entirely on you — useful if you are working around an injury, returning after a baby, or would simply rather learn the basics without a room full of people.',
  },
  {
    title: 'Hen parties and birthdays',
    body: 'A class built around a group who mostly have not done barre before. Fun first, hard enough to feel like you did something.',
  },
  {
    title: 'Workplaces and community groups',
    body: 'Kelly can come to you if there is a room with enough floor space and a few sturdy chairs.',
  },
] as const;

export default function PrivateAndEventsPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-4xl)]">Private classes &amp; events</h1>
      <p className="text-secondary mt-4 max-w-[60ch] text-lg">
        Kelly runs sessions for groups and individuals alongside the weekly timetable.
      </p>

      <div className="mt-10 grid gap-6">
        {IDEAS.map((idea) => (
          <section key={idea.title} className="border-subtle border-t pt-5">
            <h2 className="text-[length:var(--text-xl)]">{idea.title}</h2>
            <p className="text-secondary mt-2 max-w-[62ch]">{idea.body}</p>
          </section>
        ))}
      </div>

      <p className="text-muted mt-8 max-w-[62ch] text-sm">
        Pricing depends on the group and the venue, so tell Kelly roughly what you have in mind and
        she will come back to you.
      </p>

      <div className="border-subtle mt-10 border-t pt-8">
        <EnquiryForm kind="private_session" />
      </div>
    </div>
  );
}
