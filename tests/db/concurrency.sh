#!/usr/bin/env bash
# =============================================================================
# ACCEPTANCE TEST 5: 20 simultaneous booking attempts at a 10-space class must
# produce exactly 10 bookings.
#
# This is the one test that cannot be written in a single SQL script, because it
# needs genuinely parallel connections — a loop inside one transaction would
# serialise itself and pass regardless of whether the locking works.
#
# Each attempt is a separate psql process, all fired at once and all blocking on
# the same starting gun, so they contend for the session row for real.
#
#   PGPORT=5433 tests/db/concurrency.sh
# =============================================================================
set -euo pipefail

HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
USER="${PGUSER:-postgres}"
DB="${PGDATABASE:-barre_migration_test}"
ATTEMPTS="${ATTEMPTS:-20}"
CAPACITY="${CAPACITY:-10}"

psql() { command psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -tAq "$@"; }

echo "== setting up: a $CAPACITY-space class and $ATTEMPTS members with credits =="

# Idempotent: the script can be re-run without cleaning up by hand.
psql -c "drop table if exists race_entrants;" >/dev/null
psql -c "create table race_entrants (n int primary key, user_id uuid not null);" >/dev/null

SESSION_ID=$(psql -c "
  insert into class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, is_one_off)
  select ct.id, v.id, i.id,
         now() + interval '3 days', now() + interval '3 days 55 minutes',
         $CAPACITY, true
  from class_types ct, venues v, instructors i
  limit 1
  returning id;")

# Each racer needs everything the booking gate asks for: an account, a signed
# current waiver, a valid PAR-Q, and exactly one credit. Exactly one matters —
# it means a member who loses the race cannot quietly succeed on a retry, and
# that the credit count at the end is a real check.
psql -c "
do \$\$
declare
  v_user   uuid;
  v_waiver uuid;
begin
  select id into v_waiver from waiver_versions where is_current limit 1;

  for i in 1..$ATTEMPTS loop
    v_user := gen_random_uuid();
    insert into auth.users (id, email) values (v_user, 'racer' || i || '@test');

    insert into waiver_signatures (user_id, waiver_version_id, typed_name, signature_image_path)
    values (v_user, v_waiver, 'Racer ' || i, 'sig/' || i || '.png');

    insert into health_questionnaires
      (user_id, questionnaire_version, answers, explicit_consent_at, valid_until)
    values (v_user, 'v1', '{}', now(), now() + interval '1 year');

    perform grant_credits(v_user, 1, 'purchase', now() + interval '30 days');
    insert into race_entrants (n, user_id) values (i, v_user);
  end loop;
end \$\$;" >/dev/null

echo "== firing $ATTEMPTS simultaneous attempts =="

OUT=$(mktemp -d)

# Resolve the member ids up front, so the parallel phase contains nothing but
# the booking call itself.
for i in $(seq 1 "$ATTEMPTS"); do
  psql -c "select user_id from race_entrants where n = $i;" > "$OUT/$i.user"
done

# The starting gun is a shared wall-clock instant, enforced inside Postgres.
#
# Synchronising in the shell does not work: a FIFO gate is fragile about which
# reader wakes, and a busy-wait starves the CPU enough that the processes stop
# overlapping — which would quietly turn this into a serial test that passes
# whether or not the locking is correct. Having every connection sleep until the
# same timestamp means they are all already connected, already authenticated,
# and genuinely contend for the row.
START_AT=$(psql -c "select (now() + interval '4 seconds')::text;")
echo "   all connections fire at $START_AT"

for i in $(seq 1 "$ATTEMPTS"); do
  (
    USER_ID=$(cat "$OUT/$i.user")
    command psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -tAq \
      -c "select pg_sleep(greatest(0, extract(epoch from ('$START_AT'::timestamptz - clock_timestamp()))));" \
      -c "select book_session('$SESSION_ID'::uuid, '$USER_ID'::uuid, 'member');" \
      > "$OUT/$i.ok" 2> "$OUT/$i.err" || true
  ) &
done

wait

SUCCEEDED=$(cat "$OUT"/*.ok 2>/dev/null | grep -cE '^[0-9a-f-]{36}$' || true)
# `|| true` throughout: grep exits 1 when it matches nothing, which under
# `set -o pipefail` would abort the script exactly when the news is good.
FULL=$(grep -lc 'session_full' "$OUT"/*.err 2>/dev/null | wc -l | tr -d ' ' || true)
OTHER=$(cat "$OUT"/*.err 2>/dev/null | grep -c 'ERROR' | tr -d ' ' || true)
OTHER=$(( OTHER - FULL ))

BOOKED=$(psql -c "
  select count(*) from bookings
  where session_id = '$SESSION_ID' and booking_holds_a_place(status);")

DEBITS=$(psql -c "
  select count(*) from credit_ledger l
  join bookings b on b.id = l.booking_id
  where b.session_id = '$SESSION_ID' and l.delta < 0;")

echo
echo "  capacity              $CAPACITY"
echo "  attempts              $ATTEMPTS"
echo "  returned a booking    $SUCCEEDED"
echo "  rejected: full        $FULL"
echo "  rejected: other       $OTHER"
echo "  rows in bookings      $BOOKED"
echo "  credit debits written $DEBITS"
echo

FAILED=0
check() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; else echo "  FAIL  $1 (expected $3, got $2)"; FAILED=1; fi
}

check "exactly $CAPACITY bookings exist"            "$BOOKED"    "$CAPACITY"
check "exactly $CAPACITY attempts succeeded"        "$SUCCEEDED" "$CAPACITY"
check "the other $((ATTEMPTS - CAPACITY)) were told the class is full" "$FULL" "$((ATTEMPTS - CAPACITY))"
check "no attempt failed for any other reason"      "$OTHER"     "0"
check "one credit debited per booking, no more"     "$DEBITS"    "$CAPACITY"

if [ "$FAILED" != "0" ]; then
  echo
  echo "  --- errors seen ---"
  cat "$OUT"/*.err 2>/dev/null | sort | uniq -c | head
fi

rm -rf "$OUT"
psql -c "drop table if exists race_entrants;" >/dev/null
exit "$FAILED"
