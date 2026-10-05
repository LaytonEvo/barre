/**
 * Security audit, run against a live database.
 *
 * Prose in a checklist goes stale the moment somebody adds a table. These are the
 * same checks as assertions, so they answer for the schema as it is now rather
 * than as it was when the document was written.
 *
 *   npm run audit:security                 # local Supabase
 *   DATABASE_URL=... npm run audit:security
 *
 * Exits non-zero on any failure, so it can gate a deploy.
 */
import { Client } from 'pg';

const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/**
 * Tables that intentionally have RLS on and no policy, which denies everyone
 * except the service role. Named rather than counted: a count cannot tell a
 * deliberate addition from an accidental one.
 */
const SERVICE_ROLE_ONLY = ['rate_limits', 'session_generation_runs', 'stripe_events'];

/**
 * The only SECURITY DEFINER functions an anonymous caller may execute.
 *
 * Both are needed by RLS itself: policies run as the querying role, so a visitor
 * who cannot execute `is_staff()` cannot read a table whose policy calls it. With
 * no JWT, `auth.uid()` is null and both return false, so exposing them grants
 * nothing.
 *
 * Anything else appearing here means a new function picked up Postgres's default
 * grant to PUBLIC — which is how nineteen of them ended up reachable before.
 */
const ANON_MAY_EXECUTE = ['is_admin', 'is_staff'];

/**
 * Views and the security mode each one must have.
 *
 * `session_availability` runs with OWNER rights deliberately: it aggregates
 * bookings that the caller is not allowed to read, and exposes counts only. It
 * was shipped as security_invoker and reported every class as empty, so this is
 * pinned rather than left to a reviewer to notice.
 */
const VIEW_SECURITY: Record<string, 'invoker' | 'owner'> = {
  session_availability: 'owner',
  credit_lots: 'invoker',
  member_onboarding_status: 'invoker',
};

type Check = { name: string; ok: boolean; detail: string };

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL ?? DEFAULT_URL });
  await client.connect();

  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  // --- RLS everywhere -------------------------------------------------------
  const noRls = await client.query<{ relname: string }>(`
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    order by c.relname`);
  add(
    'RLS enabled on every table',
    noRls.rowCount === 0,
    noRls.rowCount === 0
      ? 'all tables'
      : `missing on: ${noRls.rows.map((r) => r.relname).join(', ')}`,
  );

  // --- Deny-all tables are the expected ones --------------------------------
  const noPolicy = await client.query<{ tablename: string }>(`
    select tablename::text as tablename from pg_tables
    where schemaname = 'public'
      and tablename not in (select distinct tablename from pg_policies where schemaname = 'public')
    order by tablename`);
  const denyAll = noPolicy.rows.map((r) => r.tablename);
  const expected = [...SERVICE_ROLE_ONLY].sort();
  add(
    'deny-all tables are the intended ones',
    JSON.stringify(denyAll) === JSON.stringify(expected),
    `found: ${denyAll.join(', ') || 'none'} | expected: ${expected.join(', ')}`,
  );

  // --- search_path pinned on every SECURITY DEFINER -------------------------
  // An unpinned search_path lets a caller who can create a schema shadow a
  // function the definer calls, and have it run with the definer's rights.
  const unpinned = await client.query<{ proname: string }>(`
    select p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
      )
    order by p.proname`);
  add(
    'every SECURITY DEFINER pins search_path',
    unpinned.rowCount === 0,
    unpinned.rowCount === 0
      ? 'all pinned'
      : `unpinned: ${unpinned.rows.map((r) => r.proname).join(', ')}`,
  );

  // --- Only the intended definer functions are reachable by anon ------------
  //
  // Not "none": RLS policies are evaluated as the querying role, so a policy
  // reading `using (published or public.is_staff())` fails outright for a
  // visitor who cannot execute it. Both return false without a JWT.
  //
  // Extension-owned functions are excluded — citext and pgcrypto install into
  // public here, and their grants are not ours to manage.
  const anonExec = await client.query<{ proname: string }>(`
    select distinct p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname`);
  const anonCallable = anonExec.rows.map((r) => r.proname);
  const anonAllowed = [...ANON_MAY_EXECUTE].sort();
  add(
    'only the RLS helpers are callable by anon',
    JSON.stringify(anonCallable) === JSON.stringify(anonAllowed),
    `callable: ${anonCallable.join(', ') || 'none'} | allowed: ${anonAllowed.join(', ')}`,
  );

  // --- View security modes are the intended ones ----------------------------
  const views = await client.query<{ relname: string; invoker: boolean }>(`
    select c.relname,
           coalesce('security_invoker=true' = any(c.reloptions), false) as invoker
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
    order by c.relname`);

  for (const view of views.rows) {
    const want = VIEW_SECURITY[view.relname];
    if (!want) {
      add(
        `view ${view.relname} is accounted for`,
        false,
        'not listed in VIEW_SECURITY — decide which rights it needs',
      );
      continue;
    }
    const actual = view.invoker ? 'invoker' : 'owner';
    add(`view ${view.relname} runs with ${want} rights`, actual === want, `actual: ${actual}`);
  }

  // --- The secret that must never be public ---------------------------------
  add(
    'service role key is not exposed to the browser',
    !Object.keys(process.env).some(
      (k) => k.startsWith('NEXT_PUBLIC_') && /service|secret/i.test(k),
    ),
    'no NEXT_PUBLIC_* variable names a secret',
  );

  await client.end();

  const failed = checks.filter((c) => !c.ok);
  const pad = Math.max(...checks.map((c) => c.name.length));

  for (const check of checks) {
    console.log(`${check.ok ? 'pass' : 'FAIL'}  ${check.name.padEnd(pad)}  ${check.detail}`);
  }

  console.log(
    `\n${checks.length - failed.length}/${checks.length} checks passed.` +
      (failed.length ? ` ${failed.length} FAILED.` : ''),
  );

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Security audit could not run:', error instanceof Error ? error.message : error);
  process.exit(2);
});
