import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { PHOTOS } from '@/lib/images';
import { listVenues } from '@/lib/queries/catalogue';
import { cancellationPolicyText, loadPolicy } from '@/lib/policy';
import { localSuffix, SITE } from '@/lib/seo/site';
import { Button } from '@/components/ui/button';
import { path } from '@/lib/routes';

export const metadata: Metadata = {
  title: `New to barre? — ${localSuffix}`,
  description: `What to expect at your first barre class in ${SITE.town}: what to wear, what to bring, when to arrive, and the questions everyone asks. First class free.`,
  alternates: { canonical: '/new-here' },
};

const SECTIONS = [
  {
    heading: 'You do not need to be fit, flexible or coordinated',
    paragraphs: [
      'This is the thing worth saying first, because it stops most people coming. Barre is not a dance class and there is nothing to keep up with. Kelly shows an easier and a harder version of almost everything, and you choose as you go — often differently from one side to the other.',
      'Plenty of people arrive having done nothing for years. That is a completely normal way to start.',
    ],
  },
  {
    heading: 'What to wear',
    paragraphs: [
      'Leggings or shorts and a top you can move in. Avoid anything so loose that it gets in the way when you are upside down over a chair.',
      'Grippy socks are ideal because the floors can be slippery. Bare feet are fine. Trainers are not needed.',
    ],
  },
  {
    heading: 'What to bring',
    paragraphs: [
      'Water, and a mat if you have one. Whether mats are provided at each hall is still being confirmed, so bringing your own is the safe bet for a first class.',
      'Everything else you might need is there.',
    ],
  },
  {
    heading: 'When to arrive',
    paragraphs: [
      'Five or ten minutes early for your first class. It gives you time to find the hall, say hello to Kelly and mention anything she should know about — an injury, a recent operation, a pregnancy.',
      'Tell her even if you think it is too small to matter. It changes what she suggests for you, and she would much rather know.',
    ],
  },
  {
    heading: 'Pregnant or recently postnatal?',
    paragraphs: [
      'Often yes, with modifications — but please speak to Kelly before you book, and check with your midwife or GP first. Barre adapts well to pregnancy and to returning afterwards, but what is appropriate depends entirely on you and when.',
      'The health questions during sign-up ask about this, and anything you flag goes to Kelly rather than stopping you booking.',
    ],
  },
  {
    heading: 'What it will feel like afterwards',
    paragraphs: [
      'Your legs will shake during class. That is the point, and it happens to everyone, including people who have been coming for years.',
      'Expect to notice your inner thighs and seat for a day or two after your first one. That settles quickly once you have been a few times.',
    ],
  },
] as const;

export default async function NewHerePage() {
  const [venues, policy] = await Promise.all([listVenues(), loadPolicy()]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-4xl)]">New to barre?</h1>
      <p className="text-secondary mt-4 max-w-[60ch] text-lg">
        Everything worth knowing before your first class. Your first one is free, so the only thing
        it costs you is 55 minutes.
      </p>

      {/* A real class, which does more to answer "what is it actually like" than
          any amount of copy. */}
      <Image
        src={PHOTOS.classGroup.src}
        alt={PHOTOS.classGroup.alt}
        width={PHOTOS.classGroup.width}
        height={PHOTOS.classGroup.height}
        priority
        sizes="(min-width: 768px) 70vw, 100vw"
        className="mt-8 w-full rounded-xl object-cover shadow-sm"
      />

      <div className="mt-12 grid gap-10">
        {SECTIONS.map((section) => (
          <section key={section.heading} className="border-subtle border-t pt-6">
            <h2 className="text-[length:var(--text-xl)]">{section.heading}</h2>
            <div className="mt-3 grid gap-3">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-secondary max-w-[62ch]">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}

        <section className="border-subtle border-t pt-6">
          <h2 className="text-[length:var(--text-xl)]">Where to go</h2>
          <ul className="mt-3 grid gap-2">
            {venues.map((venue) => (
              <li key={venue.slug}>
                <Link href={path(`/locations/${venue.slug}`)} className="text-link underline">
                  {venue.name}
                </Link>
                <span className="text-muted text-sm">
                  {' — '}
                  {[venue.city, venue.postcode].filter(Boolean).join(' ')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-subtle border-t pt-6">
          <h2 className="text-[length:var(--text-xl)]">If you need to cancel</h2>
          <p className="text-secondary mt-3 max-w-[62ch]">{cancellationPolicyText(policy)[0]}</p>
        </section>
      </div>

      <div className="bg-accent-soft mt-14 grid gap-4 rounded-xl p-6 md:p-8">
        <h2 className="text-[length:var(--text-2xl)]">Ready?</h2>
        <p className="text-primary max-w-[52ch]">
          Pick a time that suits you. If you are still not sure, come to a Monday — there are two
          back to back, so the hall is a little quieter at the later one.
        </p>
        <div>
          <Link href="/timetable">
            <Button variant="accent" size="lg">
              Book your free class
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
