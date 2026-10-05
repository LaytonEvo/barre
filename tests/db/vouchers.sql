-- =============================================================================
-- Gift vouchers.
--
-- ACCEPTANCE TEST 14: voucher bought -> recipient emailed on the scheduled date
-- -> redeemed for credit.
-- =============================================================================
\set ON_ERROR_STOP on

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

create or replace function a_member(p_email text)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_user, p_email);
  update public.profiles set first_name = split_part(p_email,'@',1), last_name = 'Giver'
    where id = v_user;
  return v_user;
end $$;

-- ---------------------------------------------------------------------------
-- Code generation
-- ---------------------------------------------------------------------------
do $$
declare v_code text; v_codes text[] := '{}'; i integer;
begin
  for i in 1..50 loop
    v_code := public.generate_voucher_code();
    v_codes := v_codes || v_code;
  end loop;

  perform assert(
    (select count(distinct c) from unnest(v_codes) c) = 50,
    '50 generated codes are all different');

  perform assert(v_code ~ '^BARRE-[ACDEFGHJKLMNPQRTUVWXY34679]{4}-[ACDEFGHJKLMNPQRTUVWXY34679]{4}$',
    'codes match the documented shape');

  -- Read aloud and written on a card, so lookalike characters are excluded.
  perform assert(
    not exists (select 1 from unnest(v_codes) c where substring(c from 7) ~ '[O0I1S5Z2B8]'),
    'codes contain no character that could be misread as another');
end $$;

-- ---------------------------------------------------------------------------
-- Buying a voucher
-- ---------------------------------------------------------------------------
create temporary table v_fixture as
select
  a_member('voucher-buyer@test')     as buyer,
  a_member('voucher-recipient@test') as recipient;
grant select on v_fixture to authenticated;

do $$
declare
  f         record;
  v_pack    uuid;
  v_row     record;
  v_price   integer;
begin
  select * into f from v_fixture;

  -- A single-class price has to exist for a monetary voucher to convert.
  select price_pence into v_price from public.products
    where kind = 'drop_in' and price_pence > 0 limit 1;
  perform assert(v_price > 0, 'a single-class price is set, so monetary vouchers can convert');

  -- --- A pack voucher ------------------------------------------------------
  select id into v_pack from public.products where kind = 'pack' order by sort_order limit 1;

  select * into v_row from public.create_voucher(
    'pack', 'gift@test', 'Sam', 'Happy birthday!',
    now(), f.buyer, null, null, v_pack);

  perform assert(v_row.code like 'BARRE-%', 'buying a pack voucher produces a code');
  perform assert(
    v_row.credits = (select credits from public.products where id = v_pack),
    'and it carries the pack''s full number of classes');

  -- --- A monetary voucher --------------------------------------------------
  select * into v_row from public.create_voucher(
    'monetary', 'gift2@test', null, null, now(), f.buyer, null, v_price * 4, null);

  perform assert(v_row.credits = 4,
    'a monetary voucher converts to classes at the price in force when bought');

  -- Rounded down, never up: handing out value nobody paid for is worse than
  -- rounding against the gift.
  select * into v_row from public.create_voucher(
    'monetary', 'gift3@test', null, null, now(), f.buyer, null, (v_price * 2) + (v_price / 2)::integer, null);
  perform assert(v_row.credits = 2, 'a part-class remainder rounds down');

  -- But a tiny voucher is still worth something rather than nothing.
  select * into v_row from public.create_voucher(
    'monetary', 'gift4@test', null, null, now(), f.buyer, null, 1, null);
  perform assert(v_row.credits = 1, 'a voucher below one class price is still worth one class');

  -- Vouchers outlive packs: a Christmas present for a new year somebody starts
  -- in March.
  perform assert(v_row.expires_at > now() + interval '12 months',
    'a voucher is valid for well over a year');

  -- --- Refusals ------------------------------------------------------------
  begin
    perform public.create_voucher('monetary', 'x@test', null, null, now(), f.buyer, null, 0, null);
    perform assert(false, 'a zero-value monetary voucher was created');
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'value_required', 'a monetary voucher must have a value');
  end;

  begin
    perform public.create_voucher('pack', 'x@test', null, null, now(), f.buyer, null, null, null);
    perform assert(false, 'a pack voucher without a product was created');
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'product_required', 'a pack voucher must name a product');
  end;
end $$;

-- ---------------------------------------------------------------------------
-- A price rise must not shrink a gift already bought
-- ---------------------------------------------------------------------------
do $$
declare
  f        record;
  v_row    record;
  v_before integer;
  v_after  integer;
  v_id     uuid;
begin
  select * into f from v_fixture;
  select price_pence into v_before from public.products
    where kind = 'drop_in' and price_pence > 0 limit 1;

  select * into v_row from public.create_voucher(
    'monetary', 'pricerise@test', null, null, now(), f.buyer, null, v_before * 10, null);
  v_id := v_row.voucher_id;
  perform assert(v_row.credits = 10, 'a £50-at-£5 voucher is ten classes when bought');

  -- Kelly doubles the class price.
  update public.products set price_pence = v_before * 2
    where kind = 'drop_in' and price_pence > 0;

  select credits into v_after from public.vouchers where id = v_id;
  perform assert(v_after = 10,
    'ACCEPTANCE: doubling the class price does NOT shrink a voucher already paid for');

  -- Put it back so later suites see the real price.
  update public.products set price_pence = v_before
    where kind = 'drop_in' and price_pence = v_before * 2;
end $$;

-- ---------------------------------------------------------------------------
-- Sending on the scheduled date
-- ---------------------------------------------------------------------------
do $$
declare
  f      record;
  v_now  record;
  v_soon record;
  v_id   uuid;
begin
  select * into f from v_fixture;

  -- One to send today, one scheduled for Christmas.
  select * into v_now from public.create_voucher(
    'monetary', 'sendnow@test', 'Now', null, now(), f.buyer, null, 2500, null);
  select * into v_soon from public.create_voucher(
    'monetary', 'sendlater@test', 'Later', null, now() + interval '30 days',
    f.buyer, null, 2500, null);

  perform assert(
    exists (select 1 from public.vouchers_due_to_send() where id = v_now.voucher_id),
    'a voucher due today appears in the send queue');

  perform assert(
    not exists (select 1 from public.vouchers_due_to_send() where id = v_soon.voucher_id),
    'ACCEPTANCE TEST 14: one scheduled for later does NOT, so it arrives on the right day');

  -- The queue carries everything the email needs, so the cron does no joins.
  perform assert(
    (select purchaser_name from public.vouchers_due_to_send() where id = v_now.voucher_id)
      is not null,
    'the queue includes the buyer''s name, so the gift email can say who it is from');

  perform public.mark_voucher_sent(v_now.voucher_id);
  perform assert(
    not exists (select 1 from public.vouchers_due_to_send() where id = v_now.voucher_id),
    'marking it sent takes it off the queue');

  -- Idempotent: a second cron run that overlaps must not re-send.
  perform public.mark_voucher_sent(v_now.voucher_id);
  perform assert(
    (select count(*) from public.vouchers where id = v_now.voucher_id and sent_at is not null) = 1,
    'marking it sent twice is harmless');

  -- A send date in the past is clamped forward rather than being sent "late".
  select * into v_now from public.create_voucher(
    'monetary', 'backdated@test', null, null, now() - interval '10 days',
    f.buyer, null, 2500, null);
  perform assert(
    (select send_at >= now() - interval '1 minute' from public.vouchers where id = v_now.voucher_id),
    'a send date in the past is treated as "now" rather than silently skipped');
end $$;

-- ---------------------------------------------------------------------------
-- Redeeming — as a real authenticated member
-- ---------------------------------------------------------------------------
create temporary table redeem_fixture as
select
  (select recipient from v_fixture) as recipient,
  (select code from public.create_voucher(
      'monetary', 'redeem@test', 'Sam', null, now(),
      (select buyer from v_fixture), null, 2500, null)) as code;
grant select on redeem_fixture to authenticated;

begin;
  set local role authenticated;
  do $$
  declare f record; v_row record; v_before integer; v_after integer;
  begin
    select * into f from redeem_fixture;
    perform set_config('request.jwt.claim.sub', f.recipient::text, true);
    perform assert(current_user = 'authenticated', 'role switch took effect (not superuser)');

    v_before := public.credit_balance(f.recipient);

    select * into v_row from public.redeem_voucher(f.code);
    v_after := public.credit_balance(f.recipient);

    perform assert(v_after = v_before + v_row.credits,
      'ACCEPTANCE TEST 14: redeeming a voucher adds its classes to the balance');
    perform assert(v_row.description like '%classes%',
      'and describes what was added, for the confirmation message');

    -- Typed in from a printed card: lower case, spaces, hyphens left out.
    begin
      perform public.redeem_voucher(f.code);
      perform assert(false, 'a voucher was redeemed twice');
    exception when sqlstate 'P0001' then
      perform assert(sqlerrm = 'voucher_already_redeemed',
        'a second redemption is refused, and says so distinctly');
    end;

    begin
      perform public.redeem_voucher('BARRE-XXXX-XXXX');
      perform assert(false, 'an unknown code was accepted');
    exception when sqlstate 'P0001' then
      perform assert(sqlerrm = 'voucher_not_found', 'an unknown code is refused');
    end;
  end $$;
commit;

-- Forgiving input, and the ledger entry.
do $$
declare
  v_member uuid;
  v_code   text;
  v_row    record;
begin
  v_member := a_member('lenient@test');

  select code into v_code from public.create_voucher(
    'monetary', 'lenient-gift@test', null, null, now(),
    (select buyer from v_fixture), null, 2500, null);

  perform set_config('request.jwt.claim.sub', v_member::text, true);

  -- Lower case, no hyphens, surrounding spaces: all of these are how a real
  -- person types a code off a card.
  select * into v_row from public.redeem_voucher('  ' || lower(replace(v_code, '-', '')) || ' ');
  perform assert(v_row.credits > 0,
    'a code typed in lower case with no hyphens still works');

  perform assert(
    exists (
      select 1 from public.credit_ledger
      where user_id = v_member and kind = 'voucher_redeem' and voucher_id is not null),
    'the ledger entry records WHICH voucher the credits came from');

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- An expired voucher
do $$
declare v_member uuid; v_code text; v_id uuid;
begin
  v_member := a_member('expired-voucher@test');
  select voucher_id, code into v_id, v_code from public.create_voucher(
    'monetary', 'expired-gift@test', null, null, now(),
    (select buyer from v_fixture), null, 2500, null);

  update public.vouchers set expires_at = now() - interval '1 day' where id = v_id;

  perform set_config('request.jwt.claim.sub', v_member::text, true);
  begin
    perform public.redeem_voucher(v_code);
    perform assert(false, 'an expired voucher was redeemed');
  exception when sqlstate 'P0001' then
    perform assert(sqlerrm = 'voucher_expired', 'an expired voucher is refused');
  end;

  perform assert(
    not exists (select 1 from public.vouchers_due_to_send() where id = v_id),
    'and an expired voucher is never emailed');

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- A member cannot read somebody else's voucher, or forge one
begin;
  set local role authenticated;
  do $$
  declare v_count integer;
  begin
    perform set_config('request.jwt.claim.sub', (select recipient from v_fixture)::text, true);

    begin
      perform public.create_voucher('monetary', 'free@test', null, null, now(), null, null, 100000, null);
      perform assert(false, 'a member created a voucher with no payment behind it');
    exception when insufficient_privilege then
      perform assert(true, 'a member cannot mint a voucher — that would be free money');
    end;

    begin
      select count(*) into v_count from public.admin_vouchers();
      perform assert(false, 'a member read the voucher list');
    exception when sqlstate 'P0001' then
      perform assert(sqlerrm = 'not_allowed', 'a member cannot list everybody''s vouchers');
    end;
  end $$;
commit;

drop function assert(boolean, text);
drop function a_member(text);
