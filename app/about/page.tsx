import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { PHOTOS } from '@/lib/images';
import { createClient } from '@/lib/supabase/server';
import { InstructorJsonLd } from '@/lib/seo/json-ld';
import { localSuffix, SITE } from '@/lib/seo/site';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: `About Kelly — ${localSuffix}`,
  description: `Kelly teaches barre in ${SITE.town}, St Leonards and St Ives. How she teaches and what to expect from her classes.`,
  alternates: { canonical: '/about' },
};

export default async function AboutPage() {
  const supabase = await createClient();

  // Queried by sort order rather than by a hard-coded slug. A slug can change
  // (Kelly's did, when her surname arrived), and the brief is explicit that
  // nothing may assume a single named instructor — when there are two, this
  // page becomes a list rather than needing a rewrite.
  const { data: instructor } = await supabase
    .from('instructors')
    .select('display_name, bio, qualifications, photo_path')
    .eq('active', true)
    .order('sort_order')
    .limit(1)
    .maybeSingle();

  const name = instructor?.display_name ?? 'Kelly';
  const bio = instructor?.bio ?? null;
  const qualifications = instructor?.qualifications ?? [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
      <InstructorJsonLd name={name} bio={bio} qualifications={qualifications} />

      <h1 className="text-[length:var(--text-4xl)]">{name}</h1>

      {bio ? (
        <>
          <div className="mt-8 grid items-start gap-8 sm:grid-cols-[1fr_1.3fr] sm:gap-10">
            <Image
              src={PHOTOS.portrait.src}
              alt={`${name}, ${PHOTOS.portrait.alt.replace(/^Kelly /, '')}`}
              width={PHOTOS.portrait.width}
              height={PHOTOS.portrait.height}
              priority
              sizes="(min-width: 640px) 38vw, 100vw"
              className="w-full rounded-xl object-cover shadow-sm"
            />

            {/* Kelly's own words, verbatim. */}
            <div className="text-secondary grid gap-4 text-lg">
              {bio.split('\n\n').map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>

          <figure className="mt-12">
            <Image
              src={PHOTOS.barreStudio.src}
              alt={PHOTOS.barreStudio.alt}
              width={PHOTOS.barreStudio.width}
              height={PHOTOS.barreStudio.height}
              sizes="(min-width: 768px) 60vw, 100vw"
              className="w-full rounded-xl object-cover shadow-sm"
            />
          </figure>
        </>
      ) : (
        <>
          <p className="text-secondary mt-6 max-w-[62ch] text-lg">
            Kelly teaches every class at Barre By Kelly herself — Mondays at St Leonards and
            Thursdays at St Ives.
          </p>
          <p className="text-muted mt-6 max-w-[62ch] text-sm">
            Her own story is still to come. We are not going to write it for her, and we are not
            going to list a qualification she has not told us she holds — so this page stays short
            until she has sent it over.
          </p>
        </>
      )}

      {qualifications.length > 0 ? (
        <section className="border-subtle mt-10 border-t pt-6">
          <h2 className="text-[length:var(--text-xl)]">Qualifications</h2>
          <ul className="text-secondary mt-3 grid gap-2">
            {qualifications.map((qualification) => (
              <li key={qualification}>{qualification}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/timetable">
          <Button variant="accent">See the timetable</Button>
        </Link>
        <Link href="/new-here">
          <Button variant="secondary">New to barre?</Button>
        </Link>
      </div>
    </div>
  );
}
