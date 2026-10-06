import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/seo/site';

/** POST only: a GET sign-out can be triggered by a prefetch or an <img> tag. */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Same reason as the callback: request.url is the container's address.
  return NextResponse.redirect(siteUrl('/'));
}
