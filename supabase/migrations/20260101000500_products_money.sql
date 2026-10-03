-- =============================================================================
-- Products, purchases, the credit ledger, memberships, vouchers.
--
-- All money is integer pence. No float, no numeric, anywhere near a price.
-- =============================================================================

create table public.products (
  id                   uuid primary key default gen_random_uuid(),
  kind                 public.product_kind not null,
  name                 text not null,
  slug                 text not null unique,
  description          text,
  price_pence          integer not null check (price_pence >= 0),
  currency             text not null default 'GBP',

  -- Packs and credit memberships
  credits              integer check (credits is null or credits > 0),
  validity_days        integer check (validity_days is null or validity_days > 0),

  -- Memberships
  billing_interval     text check (billing_interval in ('month', 'year')),
  credits_per_period   integer check (credits_per_period is null or credits_per_period > 0),
  rollover_cap         integer check (rollover_cap is null or rollover_cap >= 0),
  is_unlimited         boolean not null default false,
  max_bookings_per_day integer check (max_bookings_per_day is null or max_bookings_per_day > 0),

  includes_on_demand   boolean not null default false,

  -- Intro offer can be a single class or "X days unlimited"
  intro_days_unlimited integer check (intro_days_unlimited is null or intro_days_unlimited > 0),

  stripe_product_id    text unique,
  stripe_price_id      text unique,

  active               boolean not null default true,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Each kind only makes sense with certain columns populated. Enforcing this
  -- here means the admin UI cannot create a pack with no credits.
  constraint products_pack_has_credits
    check (kind <> 'pack' or (credits is not null and validity_days is not null)),
  constraint products_membership_has_interval
    check (kind <> 'membership' or billing_interval is not null),
  constraint products_membership_credits_or_unlimited
    check (kind <> 'membership' or (is_unlimited or credits_per_period is not null)),
  constraint products_unlimited_has_daily_guard
    check (not is_unlimited or max_bookings_per_day is not null)
);

create index products_active_kind_idx on public.products (kind, sort_order) where active;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.tg_set_updated_at();

comment on constraint products_unlimited_has_daily_guard on public.products is
  'An unlimited membership without a per-day cap lets one member hold every space on the timetable.';

-- -----------------------------------------------------------------------------
-- Stripe webhook idempotency.
--
-- Stripe retries, and will deliver the same event more than once. Inserting the
-- event id first and letting the unique violation stop the handler is what makes
-- fulfilment safe to replay. Invariant 6.
-- -----------------------------------------------------------------------------
create table public.stripe_events (
  id            text primary key,       -- Stripe's own event id
  type          text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text
);

create index stripe_events_unprocessed_idx on public.stripe_events (received_at)
  where processed_at is null;

create table public.purchases (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references public.profiles (id) on delete restrict,
  product_id                 uuid not null references public.products (id) on delete restrict,

  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text unique,
  stripe_invoice_id          text unique,

  amount_pence               integer not null check (amount_pence >= 0),
  discount_pence             integer not null default 0 check (discount_pence >= 0),
  promo_code                 text,
  voucher_id                 uuid,  -- FK added after vouchers exists

  status                     public.purchase_status not null default 'pending',
  purchased_at               timestamptz,
  refunded_at                timestamptz,
  refunded_pence             integer not null default 0 check (refunded_pence >= 0),

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index purchases_user_idx on public.purchases (user_id, created_at desc);

create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.tg_set_updated_at();

comment on column public.purchases.user_id is
  'ON DELETE RESTRICT: erasure anonymises the profile; purchase history survives for accounting.';

-- -----------------------------------------------------------------------------
-- THE CREDIT LEDGER.
--
-- Append-only, trigger-enforced. Balances are never stored, always derived.
-- A mistake is corrected by an admin_adjustment row, never by an UPDATE.
-- Invariant 2.
-- -----------------------------------------------------------------------------
create table public.credit_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete restrict,

  -- Positive grants credit, negative consumes it. Never zero.
  delta          integer not null check (delta <> 0),
  kind           public.ledger_kind not null,
  reason         text,

  -- NULL means never expires (e.g. an admin goodwill credit).
  expires_at     timestamptz,

  -- Provenance. Which of these is set depends on kind.
  purchase_id    uuid references public.purchases (id) on delete restrict,
  membership_id  uuid,  -- FK added after memberships exists
  session_id     uuid references public.class_sessions (id) on delete restrict,
  booking_id     uuid,  -- FK added after bookings exists
  voucher_id     uuid,  -- FK added after vouchers exists

  -- Links a debit back to the grant it consumed, so FIFO is auditable.
  source_entry_id uuid references public.credit_ledger (id),

  admin_id       uuid references public.profiles (id),

  created_at     timestamptz not null default now(),

  -- An admin moving someone's balance must say why and be identifiable.
  constraint credit_ledger_admin_adjustment_is_attributed
    check (kind <> 'admin_adjustment' or (admin_id is not null and reason is not null))
);

create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
-- Supports both balance derivation and FIFO selection of the next credit to spend.
create index credit_ledger_user_expiry_idx
  on public.credit_ledger (user_id, expires_at nulls last)
  where delta > 0;
create index credit_ledger_booking_idx on public.credit_ledger (booking_id)
  where booking_id is not null;

create trigger credit_ledger_no_update
  before update on public.credit_ledger
  for each row execute function public.tg_append_only();
create trigger credit_ledger_no_delete
  before delete on public.credit_ledger
  for each row execute function public.tg_append_only();

comment on table public.credit_ledger is
  'Append-only. Balance = sum(delta) over unexpired rows. Never add a cached balance column.';
comment on column public.credit_ledger.source_entry_id is
  'For debits: the grant row this credit came from. Makes FIFO consumption auditable and lets a refund restore the original expiry date.';

-- -----------------------------------------------------------------------------
-- Memberships
-- -----------------------------------------------------------------------------
create table public.memberships (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles (id) on delete restrict,
  product_id             uuid not null references public.products (id) on delete restrict,
  stripe_subscription_id text not null unique,
  status                 public.membership_status not null,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,

  -- Set when payment fails. Booking is blocked once this passes; dunning emails
  -- go out in between.
  grace_until            timestamptz,

  cancelled_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index memberships_user_idx on public.memberships (user_id, status);
-- A member may hold at most one live subscription at a time.
create unique index memberships_one_live_per_user_idx
  on public.memberships (user_id)
  where status in ('trialing', 'active', 'past_due', 'paused');

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.tg_set_updated_at();

alter table public.credit_ledger
  add constraint credit_ledger_membership_fk
  foreign key (membership_id) references public.memberships (id) on delete restrict;

-- -----------------------------------------------------------------------------
-- Gift vouchers
-- -----------------------------------------------------------------------------
create table public.vouchers (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  kind               public.voucher_kind not null,

  value_pence        integer check (value_pence is null or value_pence > 0),
  product_id         uuid references public.products (id) on delete restrict,

  purchaser_user_id  uuid references public.profiles (id) on delete set null,
  purchase_id        uuid references public.purchases (id) on delete set null,

  recipient_name     text,
  recipient_email    citext not null,
  message            text,

  -- Cron sends on this date; sent_at stops a double send.
  send_at            timestamptz not null,
  sent_at            timestamptz,

  redeemed_by        uuid references public.profiles (id) on delete set null,
  redeemed_at        timestamptz,
  expires_at         timestamptz not null,

  created_at         timestamptz not null default now(),

  constraint vouchers_monetary_has_value
    check (kind <> 'monetary' or value_pence is not null),
  constraint vouchers_pack_has_product
    check (kind <> 'pack' or product_id is not null)
);

create index vouchers_due_to_send_idx on public.vouchers (send_at) where sent_at is null;

alter table public.purchases
  add constraint purchases_voucher_fk
  foreign key (voucher_id) references public.vouchers (id) on delete set null;

alter table public.credit_ledger
  add constraint credit_ledger_voucher_fk
  foreign key (voucher_id) references public.vouchers (id) on delete restrict;

-- -----------------------------------------------------------------------------
-- Promo codes. Stripe Coupons do the work; this mirrors them for admin display.
-- -----------------------------------------------------------------------------
create table public.promo_codes (
  id                        uuid primary key default gen_random_uuid(),
  code                      text not null unique,
  stripe_promotion_code_id  text unique,
  stripe_coupon_id          text,
  description               text,
  percent_off               integer check (percent_off is null or percent_off between 1 and 100),
  amount_off_pence          integer check (amount_off_pence is null or amount_off_pence > 0),
  max_redemptions           integer,
  times_redeemed            integer not null default 0,
  restricted_product_ids    uuid[] not null default '{}',
  expires_at                timestamptz,
  active                    boolean not null default true,
  created_at                timestamptz not null default now(),
  constraint promo_codes_has_a_discount
    check (percent_off is not null or amount_off_pence is not null)
);

-- -----------------------------------------------------------------------------
-- Intro-offer eligibility.
--
-- Three independent unique indexes, so a second attempt is blocked whether the
-- person reuses their email, their phone, or just their card. This is what
-- acceptance test 2 exercises.
-- -----------------------------------------------------------------------------
create table public.intro_offer_claims (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete restrict,
  product_id        uuid not null references public.products (id) on delete restrict,
  email_normalised  citext not null,
  phone_normalised  text,
  card_fingerprint  text,
  purchase_id       uuid references public.purchases (id) on delete set null,
  claimed_at        timestamptz not null default now()
);

create unique index intro_offer_claims_user_idx  on public.intro_offer_claims (user_id);
create unique index intro_offer_claims_email_idx on public.intro_offer_claims (email_normalised);
create unique index intro_offer_claims_phone_idx on public.intro_offer_claims (phone_normalised)
  where phone_normalised is not null;
create unique index intro_offer_claims_card_idx  on public.intro_offer_claims (card_fingerprint)
  where card_fingerprint is not null;

comment on table public.intro_offer_claims is
  'One row per person who has used an intro offer. The card_fingerprint index can catch a shared household card — docs/03 Q B4 asks whether that should block or merely flag.';
