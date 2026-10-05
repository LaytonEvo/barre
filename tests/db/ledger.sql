-- =============================================================================
-- Credit ledger behaviour, against a real database.
--
-- The ledger is the financial record. Every path gets a test, and the edges
-- around expiry get several, because that is where the bug this migration fixes
-- was hiding.
-- =============================================================================
\set ON_ERROR_STOP on

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

create or replace function new_member(p_email text) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_id, p_email);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- THE REGRESSION. A pack that expires with credits already spent.
-- ---------------------------------------------------------------------------
do $$
declare v_user uuid := new_member('regression@test');
begin
  -- A 5-credit pack that has since expired, two of which were spent while it
  -- was still valid. The debits are written directly because consume_credits
  -- (correctly) refuses to touch an expired lot — this reconstructs the state a
  -- real member reaches by buying a pack, using some of it, and running out of
  -- time on the rest.
  perform grant_credits(v_user, 5, 'purchase', now() - interval '1 day');

  insert into public.credit_ledger (user_id, delta, kind, source_entry_id)
  select v_user, -2, 'booking_debit', id
  from public.credit_ledger
  where user_id = v_user and delta > 0;

  -- Before the fix this returned -2.
  perform assert(credit_balance(v_user) = 0,
    format('expired pack with 2 spent gives a balance of 0, not a negative (got %s)',
           credit_balance(v_user)));
end $$;

-- ---------------------------------------------------------------------------
-- Grant and consume
-- ---------------------------------------------------------------------------
do $$
declare v_user uuid := new_member('basic@test');
begin
  perform grant_credits(v_user, 6, 'purchase', now() + interval '180 days');
  perform assert(credit_balance(v_user) = 6, 'a 6-credit pack gives a balance of 6');

  perform consume_credits(v_user, 1);
  perform assert(credit_balance(v_user) = 5, 'booking one class leaves 5');

  perform consume_credits(v_user, 5);
  perform assert(credit_balance(v_user) = 0, 'spending the rest leaves 0');
end $$;

do $$
declare v_user uuid := new_member('insufficient@test');
begin
  perform grant_credits(v_user, 2, 'purchase', now() + interval '30 days');
  begin
    perform consume_credits(v_user, 3);
    raise exception 'FAIL  consuming more credits than exist was permitted';
  exception when sqlstate 'P0001' then
    raise notice 'PASS  consuming more credits than exist is refused';
  end;

  -- And the failed attempt must leave nothing behind.
  perform assert(credit_balance(v_user) = 2,
    'a refused consumption rolls back cleanly and leaves the balance untouched');
end $$;

-- ---------------------------------------------------------------------------
-- FIFO: the credit about to die is spent first
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid := new_member('fifo@test');
  v_soon uuid; v_later uuid; v_never uuid;
begin
  v_later := grant_credits(v_user, 2, 'purchase', now() + interval '90 days');
  v_soon  := grant_credits(v_user, 2, 'purchase', now() + interval '7 days');
  v_never := grant_credits(v_user, 2, 'admin_adjustment', null, null, null, null, v_user, 'goodwill');

  perform consume_credits(v_user, 2);

  perform assert(
    (select count(*) from public.credit_ledger
     where source_entry_id = v_soon and delta < 0) = 1,
    'FIFO spends the soonest-expiring lot first');

  perform assert(
    not exists (select 1 from public.credit_ledger
                where source_entry_id = v_later and delta < 0),
    'FIFO leaves the later-expiring lot alone');

  -- A credit with no expiry is the one that cannot be lost by waiting, so it
  -- goes last.
  perform consume_credits(v_user, 2);
  perform assert(
    (select count(*) from public.credit_ledger
     where source_entry_id = v_later and delta < 0) = 1,
    'a dated lot is spent before an undated one');

  perform consume_credits(v_user, 2);
  perform assert(
    (select count(*) from public.credit_ledger
     where source_entry_id = v_never and delta < 0) = 1,
    'the never-expiring lot is spent last');
end $$;

do $$
declare v_user uuid := new_member('spanning@test');
begin
  perform grant_credits(v_user, 2, 'purchase', now() + interval '7 days');
  perform grant_credits(v_user, 3, 'purchase', now() + interval '90 days');

  -- Four credits spans both lots, so it must produce two debit rows.
  perform assert(array_length(consume_credits(v_user, 4), 1) = 2,
    'a consumption spanning two lots writes one debit per lot');
  perform assert(credit_balance(v_user) = 1, 'and leaves the right remainder');
end $$;

-- ---------------------------------------------------------------------------
-- Expiry
-- ---------------------------------------------------------------------------
do $$
declare v_user uuid := new_member('expiry-skip@test');
begin
  perform grant_credits(v_user, 3, 'purchase', now() - interval '1 hour');
  perform grant_credits(v_user, 2, 'purchase', now() + interval '30 days');

  perform assert(credit_balance(v_user) = 2,
    'an expired lot is excluded from the balance with no cron run at all');

  -- This is the property that matters most: a missed nightly job must not let
  -- someone book with dead credits.
  perform consume_credits(v_user, 2);
  begin
    perform consume_credits(v_user, 1);
    raise exception 'FAIL  an expired credit was spendable';
  exception when sqlstate 'P0001' then
    raise notice 'PASS  an expired credit cannot be spent even before expiry runs';
  end;
end $$;

do $$
declare v_user uuid := new_member('expiry-audit@test');
begin
  perform grant_credits(v_user, 4, 'purchase', now() - interval '1 day');
  perform assert(expire_credits() >= 1, 'expire_credits writes an audit row for a dead lot');
  perform assert(credit_balance(v_user) = 0, 'and the balance stays 0');

  perform assert(
    exists (select 1 from public.credit_ledger
            where user_id = v_user and kind = 'expiry' and delta = -4),
    'the expiry row records how many credits were lost');

  -- Running twice must not double-count.
  perform expire_credits();
  perform assert(
    (select count(*) from public.credit_ledger where user_id = v_user and kind = 'expiry') = 1,
    're-running expire_credits is idempotent');
  perform assert(credit_balance(v_user) = 0, 'and the balance is still 0');
end $$;

-- ---------------------------------------------------------------------------
-- Refunds keep the original expiry (invariant 4)
-- ---------------------------------------------------------------------------
do $$
declare
  v_user    uuid := new_member('refund2@test');
  v_session uuid;
  v_booking uuid;
  v_expiry  timestamptz := date_trunc('second', now() + interval '10 days');
  v_refund_expiry timestamptz;
begin
  perform grant_credits(v_user, 4, 'purchase', v_expiry);
  select id into v_session from public.class_sessions order by starts_at limit 1;

  -- A booking needs a ledger entry, and the entry needs the booking id, so the
  -- booking row is created first and the debit written against it. That is the
  -- order book_session() will use at M5.
  -- entitlement_kind 'credit' requires a ledger entry, so the booking is first
  -- recorded as a payment and the credit debit attached — M5's book_session()
  -- does both inside one transaction, which this fixture cannot.
  insert into public.bookings (session_id, user_id, entitlement_kind)
  values (v_session, v_user, 'payment')
  returning id into v_booking;

  perform consume_credits(v_user, 1, 'booking_debit', v_booking, v_session);
  perform assert(credit_balance(v_user) = 3, 'booking a class debits one credit');

  perform refund_booking_credits(v_booking);
  perform assert(credit_balance(v_user) = 4, 'cancelling returns the credit');

  select expires_at into v_refund_expiry
  from public.credit_ledger
  where booking_id = v_booking and delta > 0 and kind = 'cancel_refund';

  perform assert(v_refund_expiry = v_expiry,
    'INVARIANT 4: the refunded credit keeps its ORIGINAL expiry, so cancelling cannot extend a pack');

  -- Refunding twice must not mint credits.
  perform refund_booking_credits(v_booking);
  perform assert(credit_balance(v_user) = 4, 'refunding the same booking twice is a no-op');
end $$;

-- ---------------------------------------------------------------------------
-- Attribution: an unattributed debit cannot exist
-- ---------------------------------------------------------------------------
do $$
declare v_user uuid := new_member('attribution@test');
begin
  perform grant_credits(v_user, 2, 'purchase', now() + interval '30 days');
  begin
    insert into public.credit_ledger (user_id, delta, kind, admin_id, reason)
    values (v_user, -1, 'admin_adjustment', v_user, 'untraceable');
    raise exception 'FAIL  an unattributed debit was accepted';
  exception when check_violation then
    raise notice 'PASS  a debit must name the lot it consumes';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Admin deduction, routed through the same FIFO machinery
-- ---------------------------------------------------------------------------
do $$
declare v_user uuid := new_member('admin-deduct@test');
begin
  perform grant_credits(v_user, 5, 'purchase', now() + interval '30 days');
  perform consume_credits(v_user, 2, 'admin_adjustment', null, null, v_user, 'booked by phone');
  perform assert(credit_balance(v_user) = 3, 'an admin deduction reduces the balance');

  perform assert(
    exists (select 1 from public.credit_ledger
            where user_id = v_user and kind = 'admin_adjustment'
              and delta < 0 and admin_id is not null and reason is not null),
    'and is attributed to an admin with a reason');
end $$;

-- ---------------------------------------------------------------------------
-- Zero and negative quantities are rejected rather than silently doing nothing
-- ---------------------------------------------------------------------------
do $$
declare v_user uuid := new_member('guards@test');
begin
  begin
    perform grant_credits(v_user, 0, 'purchase');
    raise exception 'FAIL  granting zero credits was permitted';
  exception when others then
    if sqlerrm like '%must be positive%' then raise notice 'PASS  granting zero is refused';
    else raise; end if;
  end;

  begin
    perform consume_credits(v_user, -1);
    raise exception 'FAIL  consuming a negative quantity was permitted';
  exception when others then
    if sqlerrm like '%must be positive%' then raise notice 'PASS  consuming a negative quantity is refused';
    else raise; end if;
  end;
end $$;

drop function assert(boolean, text);
drop function new_member(text);
