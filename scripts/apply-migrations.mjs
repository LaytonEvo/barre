/**
 * Apply the migrations to whichever database DATABASE_URL points at.
 *
 * Why this exists rather than `supabase db push`: the CLI wants a linked project
 * and a direct Postgres connection, and the environments this runs from often
 * have neither. This needs one connection string and nothing else.
 *
 * It is idempotent. Applied filenames are recorded in
 * `supabase_migrations.schema_migrations` — the same table the Supabase CLI
 * uses, so the two agree about what has run and moving between them later costs
 * nothing. Running it twice applies nothing the second time, which is what makes
 * it safe as a deploy step.
 *
 * Plain JavaScript on purpose: this runs as Railway's pre-deploy command, in the
 * runtime container, after dev dependencies have been pruned. Nothing here may
 * depend on tsx or on anything outside `dependencies`.
 *
 *   DATABASE_URL=postgresql://... npm run db:migrate
 *   DATABASE_URL=postgresql://... npm run db:migrate -- --seed
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const SEED_FILE = join(process.cwd(), 'supabase', 'seed.sql');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      'DATABASE_URL is not set. Set it to the Supabase connection string ' +
        '(Connect → Session pooler) before deploying.',
    );
    process.exit(2);
  }

  // TLS for anything remote; off for a local database, which does not offer it.
  // Supabase presents a certificate this client has no root for, so the chain is
  // not verified — the connection is still encrypted, and this is the usual
  // posture for a managed Postgres behind a pooler.
  const host = new URL(connectionString.replace(/^postgres(ql)?:/, 'http:')).hostname;
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);

  const client = new Client({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    statement_timeout: 120_000,
  });

  await client.connect();

  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      inserted_at timestamptz not null default now()
    );
  `);

  const { rows } = await client.query('select version from supabase_migrations.schema_migrations');
  const applied = new Set(rows.map((r) => r.version));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;

  for (const file of files) {
    // The version is the leading timestamp, which is what the Supabase CLI
    // records — not the whole filename.
    const version = file.split('_')[0] ?? file;
    if (applied.has(version)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`applying ${file} … `);

    try {
      // Each migration in its own transaction: a failure leaves the database at
      // the last good migration rather than half-way through a broken one.
      await client.query('begin');
      await client.query(sql);
      await client.query(
        'insert into supabase_migrations.schema_migrations (version) values ($1)',
        [version],
      );
      await client.query('commit');
      console.log('ok');
      count += 1;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      console.log('FAILED');
      console.error(`\n${file} failed:\n`, error instanceof Error ? error.message : error);
      await client.end();
      process.exit(1);
    }
  }

  console.log(count === 0 ? 'Nothing to apply — already up to date.' : `Applied ${count}.`);

  await configureCron(client);

  if (process.argv.includes('--seed')) {
    process.stdout.write('seeding … ');
    try {
      await client.query(readFileSync(SEED_FILE, 'utf8'));
      console.log('ok');
    } catch (error) {
      console.log('FAILED');
      console.error(error instanceof Error ? error.message : error);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
}

/**
 * Schedule the cron jobs.
 *
 * The schedules live in a migration, but the URL and the shared secret are
 * per-environment, so they are applied here from the environment rather than
 * baked into a file that every deployment shares.
 *
 * Half-configured is treated as an error. Having one of the two set almost
 * always means a variable was missed, and the failure mode otherwise is silent:
 * the site comes up looking perfectly healthy and never sends an email.
 */
async function configureCron(client) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.CRON_SECRET;

  if (!baseUrl && !secret) {
    console.log('Skipping cron setup — NEXT_PUBLIC_SITE_URL and CRON_SECRET are both unset.');
    return;
  }

  if (!baseUrl || !secret) {
    console.error(
      `Cannot schedule the cron jobs: ${baseUrl ? 'CRON_SECRET' : 'NEXT_PUBLIC_SITE_URL'} is not set. ` +
        'Set both, or neither.',
    );
    await client.end();
    process.exit(1);
  }

  process.stdout.write('scheduling cron jobs … ');
  try {
    const { rows } = await client.query('select * from private.configure_cron($1, $2)', [
      baseUrl,
      secret,
    ]);
    console.log(`ok (${rows.length})`);
    for (const row of rows) {
      console.log(`  ${row.job_name.padEnd(24)} ${row.schedule}`);
    }
  } catch (error) {
    console.log('FAILED');
    console.error(error instanceof Error ? error.message : error);
    await client.end();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Migration run could not start:', error instanceof Error ? error.message : error);
  process.exit(2);
});
