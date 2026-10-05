#!/usr/bin/env bash
# =============================================================================
# Applies the Supabase shim, every migration in order, the seed, and then the
# invariant and RLS test suites against a scratch database.
#
#   PGPORT=5433 tests/db/run.sh          # local, against your own Postgres
#   npm run test:db
#
# Fails on the first error. Safe to re-run: it drops and recreates the database.
# =============================================================================
set -euo pipefail

HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
USER="${PGUSER:-postgres}"
DB="${PGDATABASE:-barre_migration_test}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -qc "drop database if exists $DB;" 2>/dev/null
psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -qc "create database $DB;"

run() {
  psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1" 2>&1 |
    sed 's/^psql:[^ ]* //; s/^NOTICE:  //' |
    grep -vE '^(extension|database|relation) .* (already exists|does not exist)' || true
}

echo "== shim =="
run "$ROOT/tests/db/supabase-shim.sql"

echo "== migrations =="
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "-- $(basename "$migration")"
  run "$migration"
done

echo "== seed =="
run "$ROOT/supabase/seed.sql"

# psql's exit status is swallowed by the pipeline above, so the test suites run
# unpiped: a FAIL raises, ON_ERROR_STOP aborts, and set -e fails the script.
echo
echo "== invariants =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/invariants.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL|SKIP'

echo
echo "== credit ledger =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/ledger.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL'

echo
echo "== rls =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/rls.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL'

echo
echo "All database checks passed."
