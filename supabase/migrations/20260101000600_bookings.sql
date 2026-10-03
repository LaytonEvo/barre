-- =============================================================================
-- Bookings, waitlist, and the derived views the app reads.
--
-- The booking RPC itself (book_session) lands in M5 with its concurrency test.
-- This migration establishes the tables, the guards, and the balance function
-- that the RPC will build on.
-- =============================================================================

create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.class_sessions (id) on delete restrict,
  user_id          uuid not null references public.profiles (id) on delete restrict,

  status           public.booking_status not null default 'booked',
  source           public.booking_source not null default 'member',

  -- What paid for this booking: a credit, an active membership, or a one-off
  -- payment at checkout.
  entitlement_kind text not null check (entitlement_kind in ('credit', 'membership', 'payment')),
  ledger_entry_id  uuid references public.credit_ledger (id) on delete restrict,
  purchase_id      uuid references public.purchases (id) on delete set null,

  booked_at        timestamptz not null default now(),
  cancelled_at     timestamptz,
  checked_in_at    timestamptz,
  marked_by        uuid references public.profiles (id),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint bookings_credit_has_ledger_entry
    check (entitlement_kind <> 'credit' or ledger_entry_id is not null)
);

-- Belt and braces against the same member holding two places in one class.
-- The capacity guard is the row lock in book_session; this guards the other
-- failure mode, which a lock does not cover. Invariant 1.
create unique index bookings_one_active_per_member_idx
  on public.bookings (session_id, user_id)
  where status in ('booked', 'attended', 'no_show_pending', 'no_show');

create index bookings_session_idx on public.bookings (session_id);
create index bookings_user_idx on public.bookings (user_id, booked_at desc);
create index bookings_active_session_idx on public.bookings (session_id)
  where status in ('booked', 'attended', 'no_show_pending', 'no_show');

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.tg_set_updated_at();

alter table public.credit_ledger
  add constraint credit_ledger_booking_fk
  foreign key (booking_id) references public.bookings (id) on delete restrict;

-- -----------------------------------------------------------------------------
-- Waitlist.
--
-- Position is derived from joined_at rather than stored, so it self-heals when
-- somebody leaves. Leaving is always free.
-- -----------------------------------------------------------------------------
create table public.waitlist_entries (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.class_sessions (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  status        public.waitlist_status not null default 'waiting',
  joined_at     timestamptz not null default now(),
  promoted_at   timestamptz,
  notified_at   timestamptz,
  left_at       timestamptz,
  booking_id    uuid references public.bookings (id) on delete set null
);

create unique index waitlist_one_active_per_member_idx
  on public.waitlist_entries (session_id, user_id)
  where status in ('waiting', 'notified');

create index waitlist_queue_idx on public.waitlist_entries (session_id, joined_at)
  where status = 'waiting';

-- -----------------------------------------------------------------------------
-- Credit balance, derived.
--
-- There is no balance column anywhere in this schema. This function and the
-- view below are the only ways to ask the question.
-- -----------------------------------------------------------------------------
create or replace function public.credit_balance(p_user_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(sum(delta), 0)::integer
  from public.credit_ledger
  where user_id = p_user_id
    and (expires_at is null or expires_at > now());
$$;

comment on function public.credit_balance is
  'The only way to read a balance. Invariant 3: derived from the ledger, never stored.';

-- Unexpired grants with how much of each has been consumed, soonest expiry
-- first. The booking RPC walks this to pick the credit to spend (FIFO).
create or replace view public.credit_lots
with (security_invoker = true)
as
select
  g.id             as entry_id,
  g.user_id,
  g.expires_at,
  g.delta          as granted,
  coalesce(c.consumed, 0) as consumed,
  g.delta - coalesce(c.consumed, 0) as remaining
from public.credit_ledger g
left join (
  select source_entry_id, -sum(delta) as consumed
  from public.credit_ledger
  where delta < 0 and source_entry_id is not null
  group by source_entry_id
) c on c.source_entry_id = g.id
where g.delta > 0
  and (g.expires_at is null or g.expires_at > now())
  and g.delta - coalesce(c.consumed, 0) > 0;

comment on view public.credit_lots is
  'FIFO source of truth for which credit to spend next. Order by expires_at nulls last.';

-- -----------------------------------------------------------------------------
-- Public timetable view.
--
-- Exposes spaces_left without exposing who is booked. This is what the
-- anonymous timetable reads, so it must never leak member identity.
-- -----------------------------------------------------------------------------
create or replace view public.session_availability
with (security_invoker = true)
as
select
  s.id as session_id,
  s.capacity,
  count(b.id) filter (
    where b.status in ('booked', 'attended', 'no_show_pending', 'no_show')
  )::integer as booked_count,
  greatest(
    s.capacity - count(b.id) filter (
      where b.status in ('booked', 'attended', 'no_show_pending', 'no_show')
    ),
    0
  )::integer as spaces_left,
  count(w.id) filter (where w.status = 'waiting')::integer as waitlist_count
from public.class_sessions s
left join public.bookings b on b.session_id = s.id
left join public.waitlist_entries w on w.session_id = s.id
group by s.id, s.capacity;

comment on view public.session_availability is
  'Read path for spaces-left. Aggregate only: never exposes which members are booked.';
