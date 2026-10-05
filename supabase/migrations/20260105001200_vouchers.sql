-- =============================================================================
-- M8, part 2: gift vouchers.
--
-- ACCEPTANCE TEST 14: voucher bought -> recipient emailed on the scheduled date
-- -> redeemed for credit.
--
-- The schema landed at M1. This adds the behaviour, plus one column that fixes a
-- fairness problem in the original design.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Why vouchers need their own credits column.
--
-- The ledger counts CLASSES, not money, so a £50 monetary voucher has to become
-- some number of classes. Doing that conversion at redemption would mean a price
-- rise between Christmas and February silently shrinks the gift — somebody paid
-- for ten classes and the recipient gets eight. That is the kind of thing people
-- are rightly annoyed about, and it is invisible until it happens.
--
-- So the count is fixed when the voucher is BOUGHT, at the price in force then,
-- and stored. The gift is a number of classes from the moment it is paid for, the
-- email can say so plainly, and a later price change cannot touch it.
-- -----------------------------------------------------------------------------
alter table public.vouchers
  add column if not exists credits integer check (credits is null or credits > 0),
  add column if not exists credit_expiry_days integer;

comment on column public.vouchers.credits is
  'Classes this voucher is worth, fixed at purchase. For a monetary voucher this is value_pence converted at the price in force when it was bought, so a later price rise cannot shrink the gift.';

-- -----------------------------------------------------------------------------
-- generate_voucher_code()
--
-- Read aloud over the phone and typed in by somebody who was given it on paper,
-- so the alphabet omits every pair that looks alike: no O/0, no I/1, no S/5,
-- no Z/2, no B/8. What is left is unambiguous in most fonts and in handwriting.
--
-- 26 characters over 8 positions is ~2.1e11 combinations. Guessing one is not a
-- practical attack, and redemption requires the code to be unredeemed anyway.
-- -----------------------------------------------------------------------------
create or replace function public.generate_voucher_code()
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_alphabet constant text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_code     text;
  v_attempt  integer := 0;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    v_code := 'BARRE-' || substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);

    exit when not exists (select 1 from public.vouchers where code = v_code);

    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      -- Twenty collisions means something is badly wrong (an exhausted keyspace,
      -- or a broken random source). Failing is better than looping for ever.
      raise exception 'could not generate a unique voucher code' using errcode = 'P0001';
    end if;
  end loop;

  return v_code;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_voucher(...)
--
-- Called from the Stripe webhook once the gift is paid for. Service role only:
-- a voucher that exists without a payment behind it is free money.
-- -----------------------------------------------------------------------------
create or replace function public.create_voucher(
  p_kind            public.voucher_kind,
  p_recipient_email citext,
  p_recipient_name  text,
  p_message         text,
  p_send_at         timestamptz,
  p_purchaser_id    uuid,
  p_purchase_id     uuid,
  p_value_pence     integer default null,
  p_product_id      uuid default null
)
returns table (voucher_id uuid, code text, credits integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code         text := public.generate_voucher_code();
  v_credits      integer;
  v_expiry_days  integer;
  v_class_price  integer;
  v_expires_at   timestamptz;
  v_id           uuid;
begin
  if p_kind = 'pack' then
    if p_product_id is null then
      raise exception 'product_required' using errcode = 'P0001';
    end if;
    -- Qualified, because `credits` is also an OUT column of this function and an
    -- unqualified reference is ambiguous between the two.
    select pr.credits, pr.validity_days into v_credits, v_expiry_days
    from public.products pr where pr.id = p_product_id;
    if v_credits is null then
      raise exception 'product_grants_no_credits' using errcode = 'P0001';
    end if;
  else
    if coalesce(p_value_pence, 0) <= 0 then
      raise exception 'value_required' using errcode = 'P0001';
    end if;

    -- The single-class price in force right now. This is the conversion that gets
    -- frozen; see the note at the top of this file.
    select pr.price_pence into v_class_price
    from public.products pr
    where pr.kind = 'drop_in' and pr.price_pence > 0
    order by pr.sort_order
    limit 1;

    if coalesce(v_class_price, 0) <= 0 then
      -- No single-class price is set, so there is no honest conversion to make.
      -- Refusing beats inventing a rate and short-changing somebody.
      raise exception 'no_class_price_set' using errcode = 'P0001';
    end if;

    -- Rounded DOWN, then floored at one class. Rounding up would hand out value
    -- nobody paid for; returning zero classes for a £3 voucher would be a gift
    -- that does nothing.
    v_credits := greatest(1, floor(p_value_pence::numeric / v_class_price)::integer);
  end if;

  -- Vouchers outlive packs: this is a present, and somebody may well be given one
  -- in December for a new year they do not start until March.
  v_expires_at := now() + interval '18 months';

  insert into public.vouchers
    (code, kind, value_pence, product_id, purchaser_user_id, purchase_id,
     recipient_name, recipient_email, message, send_at, expires_at,
     credits, credit_expiry_days)
  values
    (v_code, p_kind, p_value_pence, p_product_id, p_purchaser_id, p_purchase_id,
     nullif(trim(coalesce(p_recipient_name, '')), ''), p_recipient_email,
     nullif(trim(coalesce(p_message, '')), ''),
     greatest(p_send_at, now()), v_expires_at,
     v_credits, v_expiry_days)
  returning id into v_id;

  return query select v_id, v_code, v_credits, v_expires_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- redeem_voucher(code)
--
-- Runs as the signed-in member. Row-locked, because two taps on a slow connection
-- are two concurrent attempts at the same code, and the second must lose.
-- -----------------------------------------------------------------------------
create or replace function public.redeem_voucher(p_code text)
returns table (credits integer, description text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_voucher record;
  v_expires timestamptz;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- Normalised, because it will be typed in by hand from a printed card: case,
  -- stray spaces, and the hyphens left out altogether.
  select * into v_voucher
  from public.vouchers
  where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
     or replace(code, '-', '') = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
  for update;

  if not found then
    raise exception 'voucher_not_found' using errcode = 'P0001';
  end if;

  if v_voucher.redeemed_at is not null then
    -- Named distinctly from not_found so the UI can say "this has already been
    -- used" — which is what somebody re-reading an old email needs to hear.
    raise exception 'voucher_already_redeemed' using errcode = 'P0001';
  end if;

  if v_voucher.expires_at <= now() then
    raise exception 'voucher_expired' using errcode = 'P0001';
  end if;

  if v_voucher.credits is null or v_voucher.credits <= 0 then
    raise exception 'voucher_has_no_value' using errcode = 'P0001';
  end if;

  update public.vouchers
    set redeemed_by = v_user, redeemed_at = now()
    where id = v_voucher.id;

  -- The credits' own expiry runs from REDEMPTION, not from purchase. A pack
  -- voucher opened eleven months later should still give its full window; the
  -- 18-month voucher expiry is what stops it being held for ever.
  v_expires := case
                 when v_voucher.credit_expiry_days is not null
                 then now() + make_interval(days => v_voucher.credit_expiry_days)
                 else null
               end;

  -- Named arguments deliberately: grant_credits takes purchase_id, membership_id,
  -- voucher_id and admin_id in a row, and positionally it is far too easy to land
  -- a reason string in one of them.
  perform public.grant_credits(
    p_user_id    => v_user,
    p_quantity   => v_voucher.credits,
    p_kind       => 'voucher_redeem',
    p_expires_at => v_expires,
    p_voucher_id => v_voucher.id,
    p_reason     => 'Gift voucher ' || v_voucher.code);

  return query
  select v_voucher.credits,
         case when v_voucher.credits = 1 then '1 class' else v_voucher.credits || ' classes' end;
end;
$$;

-- -----------------------------------------------------------------------------
-- vouchers_due_to_send()
--
-- The cron reads this, emails each one, then calls mark_voucher_sent. Split in
-- two so a send that fails does not mark the voucher as delivered.
-- -----------------------------------------------------------------------------
create or replace function public.vouchers_due_to_send()
returns table (
  id              uuid,
  code            text,
  recipient_email citext,
  recipient_name  text,
  purchaser_name  text,
  message         text,
  credits         integer,
  expires_at      timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    v.id, v.code, v.recipient_email, v.recipient_name,
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    v.message, v.credits, v.expires_at
  from public.vouchers v
  left join public.profiles p on p.id = v.purchaser_user_id
  where v.sent_at is null
    and v.send_at <= now()
    and v.expires_at > now()
  order by v.send_at
  limit 100;
$$;

create or replace function public.mark_voucher_sent(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.vouchers set sent_at = now() where id = p_id and sent_at is null;
$$;

-- -----------------------------------------------------------------------------
-- admin_vouchers() — so Kelly can answer "did my friend get it?"
-- -----------------------------------------------------------------------------
create or replace function public.admin_vouchers()
returns table (
  id              uuid,
  code            text,
  kind            public.voucher_kind,
  credits         integer,
  value_pence     integer,
  recipient_email citext,
  purchaser_email citext,
  send_at         timestamptz,
  sent_at         timestamptz,
  redeemed_at     timestamptz,
  expires_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select v.id, v.code, v.kind, v.credits, v.value_pence, v.recipient_email,
         p.email, v.send_at, v.sent_at, v.redeemed_at, v.expires_at
  from public.vouchers v
  left join public.profiles p on p.id = v.purchaser_user_id
  order by v.created_at desc
  limit 200;
end;
$$;

grant execute on function public.redeem_voucher(text) to authenticated;
grant execute on function public.admin_vouchers() to authenticated;

revoke all on function public.create_voucher(public.voucher_kind, citext, text, text, timestamptz, uuid, uuid, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.vouchers_due_to_send() from public, anon, authenticated;
revoke all on function public.mark_voucher_sent(uuid) from public, anon, authenticated;
revoke all on function public.generate_voucher_code() from public, anon, authenticated;
