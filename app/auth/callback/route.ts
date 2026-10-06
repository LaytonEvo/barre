import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/seo/site';

/**
 * OAuth and magic-link landing point.
 *
 * Exchanges the one-time code for a session, then redirects. `next` is checked
 * to be a same-site path so this cannot be used as an open redirect.
 */
export async function GET(request: NextRequest) {
  // Only the query string comes from request.url. Its origin must not: behind a
  // proxy it is the container's own address — http://localhost:8080 on Railway —
  // so redirecting to it sends the member to a machine that exists only inside
  // the datacentre. Every confirmation link died there.
  //
  // The forwarded Host header would be the other candidate and is worse: it is
  // attacker-controlled, which would turn this into an open redirect. The
  // configured site URL is neither guessed nor spoofable.
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next');
  const next =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/account';

  if (!code) {
    return NextResponse.redirect(siteUrl('/login?error=missing_code'));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(siteUrl('/login?error=link_expired'));
  }

  return NextResponse.redirect(siteUrl(next));
}
