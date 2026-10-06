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

# Applies one file, printing its output with the harmless noise filtered out.
#
# psql's exit status is captured DIRECTLY rather than from PIPESTATUS, because a
# trailing `|| true` on a pipeline resets PIPESTATUS to (0) — so reading it after
# the `|| true` that silences grep reports success no matter what psql did.
#
# This whole function used to end in a bare `|| true`, which meant a migration
# could fail with a hard ERROR and the suite still printed "All database checks
# passed". A broken function went undetected that way until a later test happened
# to call it.
run() {
  local out status=0
  out="$(psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1" 2>&1)" || status=$?

  printf '%s\n' "$out" |
    sed 's/^psql:[^ ]* //; s/^NOTICE:  //' |
    grep -vE '^(extension|database|relation) .* (already exists|does not exist)' || true

  if [ "$status" -ne 0 ]; then
    echo "FAILED applying $(basename "$1") (psql exit $status)" >&2
    return "$status"
  fi
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
  -f "$ROOT/tests/db/invariants.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL|SKIP|ERROR|DETAIL|CONTEXT'

echo
echo "== credit ledger =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/ledger.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR|DETAIL|CONTEXT'

echo
echo "== booking engine =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/booking.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR|DETAIL|CONTEXT'

echo
echo "== onboarding =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/onboarding.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR|DETAIL|CONTEXT'

echo
echo "== admin =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/admin.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR|DETAIL|CONTEXT'

echo
echo "== video library (acceptance test 10) =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/videos.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR|DETAIL|CONTEXT'

echo
echo "== gift vouchers (acceptance test 14) =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/vouchers.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR|DETAIL|CONTEXT'

echo
echo "== automations and the notification queue =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/automations.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR|DETAIL|CONTEXT'

echo
echo "== rls =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/rls.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR|DETAIL|CONTEXT'

echo
echo "== scheduled jobs =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/tests/db/cron.sql" 2>&1 | sed 's/^NOTICE:  //' | grep -E 'PASS|FAIL|SKIP|ERROR|DETAIL|CONTEXT'

echo
echo "== concurrency (acceptance test 5) =="
# Runs last: it spawns parallel connections and leaves a filled class behind.
"$ROOT/tests/db/concurrency.sh"

echo
echo "All database checks passed."
