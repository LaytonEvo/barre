import type { Metadata } from 'next';
import Link from 'next/link';
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
  const { data: instructor } = await supabase
    .from('instructors')
    .select('display_name, bio, qualifications')
    .eq('slug', 'kelly')
    .maybeSingle();

  const name = instructor?.display_name ?? 'Kelly';
  const bio = instructor?.bio ?? null;
  const qualifications = instructor?.qualifications ?? [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
      <InstructorJsonLd name={name} bio={bio} qualifications={qualifications} />

      <h1 className="text-[length:var(--text-4xl)]">{name}</h1>

      {bio ? (
        <div className="text-secondary mt-6 grid max-w-[62ch] gap-4 text-lg">
          {bio.split('\n\n').map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
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
