'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { clientEnv } from '@/lib/env';
import { checkRateLimit } from '@/lib/rate-limit';
import { newPasswordSchema } from '@/lib/auth/password';
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

/**
 * Send a password reset link.
 *
 * Always reports success, even for an address with no account. Saying "no such
 * account" turns this form into a way to find out who is a member, which for a
 * small local business is a list of women and where they are on a Tuesday
 * evening. The cost is that someone who mistypes their address waits for an
 * email that never comes; the check-email page says so.
 *
 * Rate limited because it is the one public form that makes the site send mail
 * to an address the requester chose.
 */
export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const parsed = emailOnly.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check your email.' };

  const limit = await checkRateLimit('password_reset', 3);
  if (!limit.allowed) {
    return { error: 'Too many reset requests. Please try again in an hour.' };
  }

  const supabase = await createClient();

  // The recovery link lands on the normal callback, which exchanges the code for
  // a session and then sends them on to set a new one.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent('/account/password')}`,
  });

  redirect('/login/check-email?reset=1');
}

/**
 * Set a new password.
 *
 * Deliberately does NOT ask for the current one. Members arrive here two ways:
 * from a reset link, where by definition they do not know it, and from their
 * account, where they may never have had one — anybody who signed in with Google
 * or only ever used a magic link has no password to confirm. Requiring it would
 * lock out the people most likely to need this page.
 *
 * What makes that safe is that getting here at all needs a live session, and the
 * reset link that grants one is single-use and short-lived.
 */
export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Faccount%2Fpassword');

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    // Supabase rejects a password it considers too weak, or one unchanged from
    // the current one. Its wording is reasonable, so it is passed through rather
    // than flattened into something vaguer.
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  redirect('/account?password=changed');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
