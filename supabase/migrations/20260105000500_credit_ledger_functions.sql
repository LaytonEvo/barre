-- =============================================================================
-- The credit ledger, properly.
--
-- FIXES A REAL BUG in credit_balance. The old definition was
--
--   sum(delta) where expires_at is null or expires_at > now()
--
-- which looks right and is not. A grant carries an expiry; the debit that
-- consumes it does not. Once the grant expires it drops out of the sum while
-- its debits stay in, so a member who bought a 5-pack, used two classes and let
-- the rest expire ended up with a balance of MINUS TWO. Verified against a real
-- database before this migration was written.
--
-- The fix is per-lot accounting. A positive row is a lot; negative rows are
-- attributed to the lot they consume; the balance is the sum of what remains in
-- lots that have not expired. Expiry then needs no cron to be correct — a
-- missed nightly job can no longer let someone book with dead credits.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Every debit must say which lot it came out of.
--
-- Without this an unattributed negative row is invisible to lot accounting, so
-- an admin deduction would silently fail to reduce the balance. Forcing the
-- attribution is also just correct bookkeeping: "which credits are you taking?"
-- -----------------------------------------------------------------------------
alter table public.credit_ledger
  add constraint credit_ledger_debits_are_attributed
  check (delta > 0 or source_entry_id is not null);

comment on constraint credit_ledger_debits_are_attributed on public.credit_ledger is
  'A negative row must name the lot it consumes, so lot accounting cannot lose it.';

-- -----------------------------------------------------------------------------
-- Balance: the sum of what is left in unexpired lots.
-- -----------------------------------------------------------------------------
create or replace function public.credit_balance(p_user_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(sum(
    grant_row.delta - coalesce((
      select -sum(spend.delta)
      from public.credit_ledger spend
      where spend.source_entry_id = grant_row.id and spend.delta < 0
    ), 0)
  ), 0)::integer
  from public.credit_ledger grant_row
  where grant_row.user_id = p_user_id
    and grant_row.delta > 0
    and (grant_row.expires_at is null or grant_row.expires_at > now());
$$;

comment on function public.credit_balance is
  'Sum of what remains in unexpired lots. Never sum(delta) over the whole ledger: debits outlive the grants they consumed, which produces negative balances.';

-- -----------------------------------------------------------------------------
-- Grant.
-- -----------------------------------------------------------------------------
create or replace function public.grant_credits(
  p_user_id    uuid,
  p_quantity   integer,
  p_kind       public.ledger_kind,
  p_expires_at timestamptz default null,
  p_purchase_id uuid default null,
  p_membership_id uuid default null,
  p_voucher_id uuid default null,
  p_admin_id   uuid default null,
  p_reason     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if p_quantity <= 0 then
    raise exception 'grant_credits: quantity must be positive, got %', p_quantity;
  end if;

  insert into public.credit_ledger
    (user_id, delta, kind, expires_at, purchase_id, membership_id, voucher_id, admin_id, reason)
  values
    (p_user_id, p_quantity, p_kind, p_expires_at, p_purchase_id, p_membership_id,
     p_voucher_id, p_admin_id, p_reason)
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Consume, soonest-expiring first.
--
-- Locks the user's lots for the transaction, so two bookings racing for the
-- last credit cannot both win. Invariant 3.
-- -----------------------------------------------------------------------------
create or replace function public.consume_credits(
  p_user_id    uuid,
  p_quantity   integer,
  p_kind       public.ledger_kind default 'booking_debit',
  p_booking_id uuid default null,
  p_session_id uuid default null,
  p_admin_id   uuid default null,
  p_reason     text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining integer := p_quantity;
  v_entries   uuid[] := '{}';
  v_entry     uuid;
  v_lot       record;
  v_take      integer;
begin
  if p_quantity <= 0 then
    raise exception 'consume_credits: quantity must be positive, got %', p_quantity;
  end if;

  for v_lot in
    select g.id,
           g.expires_at,
           g.delta - coalesce((
             select -sum(s.delta) from public.credit_ledger s
             where s.source_entry_id = g.id and s.delta < 0
           ), 0) as remaining
    from public.credit_ledger g
    where g.user_id = p_user_id
      and g.delta > 0
      and (g.expires_at is null or g.expires_at > now())
    -- NULLS LAST: a credit with no expiry is spent only once the dated ones are
    -- gone, because it is the one that cannot be lost by waiting.
    order by g.expires_at asc nulls last, g.created_at asc
    for update
  loop
    exit when v_remaining <= 0;
    continue when v_lot.remaining <= 0;

    v_take := least(v_remaining, v_lot.remaining);

    insert into public.credit_ledger
      (user_id, delta, kind, source_entry_id, booking_id, session_id, admin_id, reason)
    values
      (p_user_id, -v_take, p_kind, v_lot.id, p_booking_id, p_session_id, p_admin_id, p_reason)
    returning id into v_entry;

    v_entries   := v_entries || v_entry;
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'insufficient_credits: % of % could not be covered', v_remaining, p_quantity
      using errcode = 'P0001';
  end if;

  return v_entries;
end;
$$;

-- -----------------------------------------------------------------------------
-- Refund a booking's credits.
--
-- The refund is a NEW lot carrying the ORIGINAL lot's expiry date. This is the
-- rule that stops a member extending a pack indefinitely by booking and
-- cancelling: the credit comes back, but it comes back with the same deadline it
-- had before. Invariant 4.
-- -----------------------------------------------------------------------------
create or replace function public.refund_booking_credits(
  p_booking_id uuid,
  p_kind       public.ledger_kind default 'cancel_refund',
  p_reason     text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entries uuid[] := '{}';
  v_entry   uuid;
  v_debit   record;
begin
  for v_debit in
    select d.id, d.user_id, d.delta, d.source_entry_id, g.expires_at as original_expiry
    from public.credit_ledger d
    join public.credit_ledger g on g.id = d.source_entry_id
    where d.booking_id = p_booking_id
      and d.delta < 0
      -- Only refund debits that have not already been refunded.
      and not exists (
        select 1 from public.credit_ledger r
        where r.source_entry_id = d.id and r.delta > 0
      )
  loop
    insert into public.credit_ledger
      (user_id, delta, kind, expires_at, booking_id, source_entry_id, reason)
    values
      (v_debit.user_id, -v_debit.delta, p_kind, v_debit.original_expiry,
       p_booking_id, v_debit.id, p_reason)
    returning id into v_entry;

    v_entries := v_entries || v_entry;
  end loop;

  return v_entries;
end;
$$;

comment on function public.refund_booking_credits is
  'Returns credits with the ORIGINAL expiry, so cancelling cannot be used to extend a pack. Idempotent: a debit already refunded is skipped.';

-- -----------------------------------------------------------------------------
-- Expire.
--
-- The balance is already correct without this — an expired lot is excluded by
-- date. These rows exist so a member can see WHY credits vanished, and so the
-- ledger reads as a complete history. Writing them is therefore safe to miss
-- and safe to re-run.
-- -----------------------------------------------------------------------------
create or replace function public.expire_credits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lot   record;
  v_count integer := 0;
begin
  for v_lot in
    select g.id, g.user_id, g.expires_at,
           g.delta - coalesce((
             select -sum(s.delta) from public.credit_ledger s
             where s.source_entry_id = g.id and s.delta < 0
           ), 0) as remaining
    from public.credit_ledger g
    where g.delta > 0
      and g.expires_at is not null
      and g.expires_at <= now()
    for update
  loop
    continue when v_lot.remaining <= 0;

    insert into public.credit_ledger
      (user_id, delta, kind, source_entry_id, reason)
    values
      (v_lot.user_id, -v_lot.remaining, 'expiry', v_lot.id,
       format('Expired on %s', to_char(v_lot.expires_at at time zone 'Europe/London', 'DD Mon YYYY')));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.grant_credits(uuid, integer, public.ledger_kind, timestamptz, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.consume_credits(uuid, integer, public.ledger_kind, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.refund_booking_credits(uuid, public.ledger_kind, text) from public, anon, authenticated;
revoke all on function public.expire_credits() from public, anon, authenticated;
