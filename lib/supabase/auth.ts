import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/db/roles';

export type SessionUser = {
  id: string;
  email: string;
  roles: AppRole[];
  firstName: string | null;
  lastName: string | null;
};

/** The signed-in member, or null. Reads roles in the same round trip. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id),
    supabase.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle(),
  ]);

  return {
    id: user.id,
    email: user.email ?? '',
    roles: (roles ?? []).map((r) => r.role),
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
  };
}

/**
 * Require a signed-in member, redirecting to login otherwise.
 *
 * Every protected page calls this. Hiding a nav link is not authorisation, and
 * neither is middleware on its own — a page that needs a user asks for one here.
 */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const query = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    redirect(`/login${query}` as Route);
  }
  return user;
}

/** Require one of the given roles. Sends members to their own dashboard. */
export async function requireRole(...allowed: AppRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.some((role) => user.roles.includes(role))) {
    redirect('/account');
  }
  return user;
}

export function hasRole(user: SessionUser | null, role: AppRole): boolean {
  return user?.roles.includes(role) ?? false;
}

export function isStaff(user: SessionUser | null): boolean {
  return hasRole(user, 'admin') || hasRole(user, 'instructor');
}
