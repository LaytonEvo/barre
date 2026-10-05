-- =============================================================================
-- M8, part 3: the automations (brief §11).
--
-- Four jobs that decide WHO should get an email. The deciding is here rather than
-- in TypeScript for the usual reason — it is a query, and a query that picks who
-- gets emailed should be inspectable and testable without a mail provider.
--
-- Each returns candidates; the cron enqueues them. The dedupe index on
-- notifications is what stops a daily job emailing the same person every day: the
-- subject id is the thing the email is about, so a second attempt loses on the
-- index rather than relying on this SQL to remember.
-- =============================================================================

insert into public.settings (key, value, description, confirmed) values
  ('follow_up_after_first_class_hours', '20',
   'Hours after a first class before asking how they got on. 20 means the morning after an evening class, when they can feel it but it is still fresh.',
   true),
  ('win_back_after_days', '35',
   'Days since a member last attended before a win-back email. Longer than the at-risk report (21 days) on purpose: at-risk is for Kelly to look at, this one actually emails somebody.',
   true),
  ('review_request_after_classes', '3',
   'Attended classes before asking for a review. Three means they know what the class is like.',
   true),
  -- Unconfirmed, and empty, because only Kelly can supply it. While it is empty
  -- the review automation queues NOTHING — the cron reports that it skipped, so
  -- an empty run is distinguishable from a broken one.
  ('google_review_url', '""',
   'The "write a review" link from Kelly''s Google Business Profile. Review requests are not sent at all until this is set. PLACEHOLDER - see docs/03.',
   false)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- due_first_class_follow_ups()
--
-- Somebody whose FIRST attended class was long enough ago to ache but recently
-- enough to be worth asking about. Capped at four days so a backlog after an
-- outage does not email somebody about a class they went to last week.
-- -----------------------------------------------------------------------------
create or replace function public.due_first_class_follow_ups()
returns table (
  user_id      uuid,
  booking_id   uuid,
  first_name   text,
  class_name   text,
  credits_left integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with first_attendance as (
    select
      b.user_id,
      min(s.starts_at) as attended_at,
      (array_agg(b.id order by s.starts_at))[1] as booking_id
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    where b.status = 'attended'
    group by b.user_id
  )
  select
    p.id,
    fa.booking_id,
    p.first_name,
    coalesce(ct.name, 'your class'),
    public.credit_balance(p.id)
  from first_attendance fa
  join public.profiles p on p.id = fa.user_id
  join public.bookings b on b.id = fa.booking_id
  join public.class_sessions s on s.id = b.session_id
  left join public.class_types ct on ct.id = s.class_type_id
  where p.anonymised_at is null
    and fa.attended_at
        <= now() - make_interval(hours => public.setting_int('follow_up_after_first_class_hours', 20))
    and fa.attended_at > now() - interval '4 days'
  limit 200;
$$;

-- -----------------------------------------------------------------------------
-- due_win_backs()
--
-- MARKETING. Consent is checked here as well as in the dispatcher, because a
-- query that returns people who have not consented is a query somebody will later
-- reuse without noticing.
--
-- Deliberately excludes anyone with an upcoming booking: they have not drifted
-- away, they just have not been for a few weeks.
-- -----------------------------------------------------------------------------
create or replace function public.due_win_backs()
returns table (
  user_id      uuid,
  first_name   text,
  weeks_away   integer,
  credits_left integer,
  last_class   timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with last_attendance as (
    select b.user_id, max(s.starts_at) as attended_at
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    where b.status = 'attended'
    group by b.user_id
  )
  select
    p.id,
    p.first_name,
    greatest(1, (extract(day from now() - la.attended_at) / 7)::integer),
    public.credit_balance(p.id),
    la.attended_at
  from last_attendance la
  join public.profiles p on p.id = la.user_id
  where p.anonymised_at is null
    and p.marketing_consent
    and la.attended_at
        <= now() - make_interval(days => public.setting_int('win_back_after_days', 35))
    -- Somebody with a class booked has not gone anywhere.
    and not exists (
      select 1 from public.bookings b2
      join public.class_sessions s2 on s2.id = b2.session_id
      where b2.user_id = p.id
        and public.booking_holds_a_place(b2.status)
        and s2.starts_at > now()
    )
  limit 200;
$$;

-- -----------------------------------------------------------------------------
-- due_review_requests()
--
-- MARKETING. Asked once, after enough classes that the member has a view worth
-- reading. The subject id is the member, so the dedupe index makes "once" true
-- without a flag column.
-- -----------------------------------------------------------------------------
create or replace function public.due_review_requests()
returns table (
  user_id    uuid,
  first_name text,
  attended   integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.first_name, count(b.id)::integer
  from public.profiles p
  join public.bookings b on b.user_id = p.id and b.status = 'attended'
  where p.anonymised_at is null
    and p.marketing_consent
  group by p.id, p.first_name
  having count(b.id) >= public.setting_int('review_request_after_classes', 3)
  limit 200;
$$;

-- -----------------------------------------------------------------------------
-- widest_expiry_warning_days()
--
-- `credit_expiry_warning_days` holds an ARRAY of offsets ([7, 1] by default), not
-- a single number — reading it with setting_int fails outright, which is how this
-- was found. The widest offset is what decides who is in scope for a warning at
-- all; the dedupe index keyed on the lot turns the later offset into a second
-- distinct email rather than a repeat of the first.
-- -----------------------------------------------------------------------------
create or replace function public.widest_expiry_warning_days()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      -- Aliased `offset_text`, not `value`: `settings` has its own `value`
      -- column and the unqualified reference is ambiguous between the two.
      select max(offset_text::integer)
      from public.settings s
      cross join lateral jsonb_array_elements_text(s.value) as offset_text
      where s.key = 'credit_expiry_warning_days'
        and jsonb_typeof(s.value) = 'array'
    ),
    7
  );
$$;

-- -----------------------------------------------------------------------------
-- due_credit_expiry_warnings()
--
-- Per LOT, not per member: somebody can hold two packs expiring on different
-- dates, and one warning mentioning the nearer one would quietly mislead them
-- about the other.
--
-- A lot is "unspent" by the same per-lot accounting the balance uses: the grant
-- minus the debits that name it. Reusing that definition matters, because a
-- warning about credits the member has already used is worse than no warning.
-- -----------------------------------------------------------------------------
create or replace function public.due_credit_expiry_warnings()
returns table (
  user_id    uuid,
  lot_id     uuid,
  credits    integer,
  expires_at timestamptz,
  days_left  integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with lots as (
    select
      l.id,
      l.user_id,
      l.expires_at,
      -- The same arithmetic credit_balance uses, deliberately: a lot's grant minus
      -- the debits that name it. Any other definition risks warning somebody
      -- about credits they already spent.
      l.delta - coalesce((
        select -sum(spend.delta)
        from public.credit_ledger spend
        where spend.source_entry_id = l.id and spend.delta < 0
      ), 0) as remaining
    from public.credit_ledger l
    where l.delta > 0
      and l.expires_at is not null
      and l.expires_at > now()
  )
  select
    lots.user_id,
    lots.id,
    lots.remaining::integer,
    lots.expires_at,
    greatest(0, extract(day from lots.expires_at - now())::integer)
  from lots
  join public.profiles p on p.id = lots.user_id
  where lots.remaining > 0
    and p.anonymised_at is null
    -- `credit_expiry_warning_days` is an ARRAY of offsets ([7, 1] by default),
    -- not a single number, so both warnings come from one setting. Reading it
    -- with setting_int fails outright, which is how this was caught.
    --
    -- The widest offset decides who is in scope; the dedupe index keyed on the
    -- lot is what makes the SECOND warning a second email rather than a repeat,
    -- because the notification carries the days-left figure that differs between
    -- them.
    and lots.expires_at <= now() + make_interval(days => public.widest_expiry_warning_days())
  limit 200;
$$;

revoke all on function public.widest_expiry_warning_days() from public, anon, authenticated;
revoke all on function public.due_first_class_follow_ups() from public, anon, authenticated;
revoke all on function public.due_win_backs() from public, anon, authenticated;
revoke all on function public.due_review_requests() from public, anon, authenticated;
revoke all on function public.due_credit_expiry_warnings() from public, anon, authenticated;
