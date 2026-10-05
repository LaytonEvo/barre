-- =============================================================================
-- Capacity 25, single class £5. Supplied by Layton 2026-10-05.
--
-- Both are working figures, chosen to get the site usable, and both are meant to
-- change. Where to change them later:
--
--   CAPACITY lives in three places, deliberately:
--     venues.default_capacity        - the suggestion when adding a new template
--     schedule_templates.capacity    - applies to sessions generated from now on
--     class_sessions.capacity        - one specific class, e.g. a smaller hall
--   Editing a template does NOT retro-fit sessions that already exist, which is
--   why this migration updates future sessions explicitly. The admin schedule
--   screen at M6 does the same thing, and asks whether to apply the change to
--   already-generated classes.
--
--   PRICE lives in products.price_pence, in integer pence. From M4 it also has a
--   stripe_price_id. Stripe Prices are immutable, so changing a price means
--   creating a new Stripe Price and pointing the row at it — the admin products
--   screen handles that, and past purchases keep referring to the old one so
--   historical receipts stay correct.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Capacity: 16 -> 25
-- -----------------------------------------------------------------------------
update public.venues
  set default_capacity = 25
  where slug in ('st-leonards-village-hall', 'st-ives-primary-school');

update public.schedule_templates
  set capacity = 25
  where capacity = 16;

-- Future sessions only. A past class's capacity is part of its record — it is
-- what the register was measured against — so history is left alone.
update public.class_sessions
  set capacity = 25
  where starts_at > now()
    and status = 'scheduled'
    and capacity = 16;

comment on column public.venues.default_capacity is
  'Working figure of 25, set by Layton 2026-10-05. Editable per venue, per template and per session. Not a hard limit on the hall — Kelly can lower it for a specific class.';

-- -----------------------------------------------------------------------------
-- Pricing.
--
-- Single class £5. The packs derive from it, exactly as described:
--   buy 5 get 1 free  ->  6 credits for 5 x £5 = £25   (£4.17 a class)
--   buy 10 get 2 free -> 12 credits for 10 x £5 = £50  (£4.17 a class)
--
-- Both packs now have a price, so both become purchasable. Until this migration
-- they were deliberately inactive: a product with no price must never be
-- checkout-able.
-- -----------------------------------------------------------------------------
update public.products set
  price_pence = 500,
  description = 'One class, pay as you go.',
  active      = true
  where slug = 'single-class';

update public.products set
  price_pence = 2500,   -- 5 x £5
  description = 'Six classes for the price of five.',
  active      = true
  where slug = 'pack-5-plus-1';

update public.products set
  price_pence = 5000,   -- 10 x £5
  description = 'Twelve classes for the price of ten.',
  active      = true
  where slug = 'pack-10-plus-2';

-- Sanity check: a pack must never cost more per class than paying each time, and
-- the arithmetic above must actually hold. Cheap to assert, and it would catch a
-- fat-fingered price change in a later migration.
do $$
declare
  v_single integer;
  v_bad    text;
begin
  select price_pence into v_single from public.products where slug = 'single-class';

  select string_agg(slug, ', ') into v_bad
  from public.products
  where kind = 'pack' and active
    and credits is not null
    and (price_pence::numeric / credits) >= v_single;

  if v_bad is not null then
    raise exception
      'Pack(s) % cost at least as much per class as a single class (%p). Check the pricing.',
      v_bad, v_single;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Pack expiry is still a guess.
--
-- 180 days for six classes and 365 for twelve is generous and roughly standard,
-- but Kelly has not said. Recorded here so it stays visible rather than becoming
-- invisible fact.
-- -----------------------------------------------------------------------------
insert into public.settings (key, value, description, confirmed) values
  ('pack_expiry_days_note',
   '{"pack-5-plus-1": 180, "pack-10-plus-2": 365}',
   'Pack validity periods are a sensible default, not Kelly''s decision. Change products.validity_days once she has said. Tracked as question B1a.',
   false)
on conflict (key) do nothing;
