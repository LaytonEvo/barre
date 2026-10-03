'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { clientEnv } from '@/lib/env';
import { internalPath } from '@/lib/routes';
import type { Route } from 'next';

/**
 * Auth Server Actions.
 *
 * Every action validates with Zod before touching Supabase, and every one
 * returns a plain `{ error }` rather than throwing, so the form can render the
 * message without a client-side error boundary.
 */

export type ActionResult = { error: string } | undefined;

const credentials = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Passwords are at least 8 characters.'),
  next: z.string().optional(),
});

const emailOnly = z.object({
  email: z.string().email('Enter a valid email address.'),
  next: z.string().optional(),
});

const signUpFields = credentials.extend({
  firstName: z.string().trim().min(1, 'Please tell us your first name.'),
  lastName: z.string().trim().min(1, 'Please tell us your last name.'),
  // Separate from account creation, and unticked by default (UK GDPR / PECR).
  marketingConsent: z.coerce.boolean().optional(),
});

/** Only allow redirects back into this site. See lib/routes.ts. */
const safeNext = (next: string | undefined) => internalPath(next, '/account');

async function origin(): Promise<string> {
  const headerList = await headers();
  return headerList.get('origin') ?? clientEnv.NEXT_PUBLIC_SITE_URL;
}

export async function signInWithPassword(formData: FormData): Promise<ActionResult> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  // Deliberately vague: distinguishing "no such account" from "wrong password"
  // tells an attacker which emails are registered.
  if (error) return { error: 'That email and password did not match. Please try again.' };

  revalidatePath('/', 'layout');
  redirect(safeNext(parsed.data.next));
}

export async function signUp(formData: FormData): Promise<ActionResult> {
  const parsed = signUpFields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(safeNext(parsed.data.next))}`,
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        marketing_consent: parsed.data.marketingConsent === true,
      },
    },
  });

  if (error) return { error: error.message };

  redirect('/login/check-email');
}

export async function signInWithMagicLink(formData: FormData): Promise<ActionResult> {
  const parsed = emailOnly.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check your email.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(safeNext(parsed.data.next))}`,
    },
  });

  if (error) return { error: error.message };

  redirect('/login/check-email');
}

export async function signInWithGoogle(formData: FormData): Promise<ActionResult> {
  const next = safeNext(formData.get('next')?.toString());

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error || !data.url) return { error: 'Could not reach Google. Please try another way in.' };

  // data.url is Google's consent screen on accounts.google.com, so it is
  // deliberately not one of our own routes. It comes from the Supabase client
  // rather than from user input, so there is nothing to validate here.
  redirect(data.url as Route);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
