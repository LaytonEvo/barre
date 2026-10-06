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
 *   DATABASE_URL=postgresql://... npm run db:migrate
 *   DATABASE_URL=postgresql://... npm run db:migrate -- --seed
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const SEED_FILE = join(process.cwd(), 'supabase', 'seed.sql');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
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

  const { rows } = await client.query<{ version: string }>(
    'select version from supabase_migrations.schema_migrations',
  );
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

main().catch((error) => {
  console.error('Migration run could not start:', error instanceof Error ? error.message : error);
  process.exit(2);
});
