-- =============================================================================
-- Demo data for a staging deployment.
--
-- The admin side cannot be reviewed against nothing. With an empty database the
-- dashboard is zeros, every register is blank and the reports have nothing to
-- report — which hides exactly the problems worth finding: a register with
-- twenty names on a phone, a member list that needs sorting, a report whose
-- columns do not line up once the numbers have four digits.
--
-- Defining this function does nothing on its own. It has to be called, and it
-- refuses to run anywhere that looks like a real business:
--
--   select * from public.seed_demo_data();
--
-- Members are matched by the reserved .test TLD, which can never resolve, so a
-- demo account can never receive mail however badly something is configured.
-- =============================================================================

create or replace function public.seed_demo_data()
returns table (what text, rows integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_waiver    uuid;
  v_demo      integer;
  v_real      integer;
  v_sessions  integer;
  v_booked    integer := 0;
  v_hist      integer := 0;
  v_member    record;
  v_session   record;
  v_i         integer := 0;
begin
  -- --- Refuse to run on anything with real people in it ----------------------
  select count(*) into v_real
  from public.profiles
  where email not like '%@barrebykelly.test';

  select count(*) into v_demo
  from public.profiles
  where email like '%@barrebykelly.test';

  if v_demo = 0 then
    raise exception
      'No demo accounts found. Create them first — addresses must end @barrebykelly.test.';
  end if;

  -- A real member with a booking means this is somebody's live business.
  if exists (
    select 1 from public.bookings b
    join public.profiles p on p.id = b.user_id
    where p.email not like '%@barrebykelly.test'
  ) then
    raise exception
      'Refusing to seed: this database has bookings by real members. Demo data belongs on staging only.';
  end if;

  select id into v_waiver from public.waiver_versions where is_current limit 1;
  if v_waiver is null then
    raise exception 'No current waiver version, so nobody can be onboarded.';
  end if;

  -- --- Onboard every demo member --------------------------------------------
  -- Both gates, because book_session checks them and a member who cannot book
  -- is no use for filling a register.
  insert into public.waiver_signatures
    (user_id, waiver_version_id, typed_name, signature_image_path, signed_at)
  select p.id,
         v_waiver,
         coalesce(p.first_name || ' ' || p.last_name, 'Demo Member'),
         'demo/' || p.id || '.png',
         now() - (random() * interval '120 days')
  from public.profiles p
  where p.email like '%@barrebykelly.test'
    and not exists (select 1 from public.waiver_signatures w where w.user_id = p.id);

  insert into public.health_questionnaires
    (user_id, questionnaire_version, answers, flagged, explicit_consent_at, valid_until)
  select p.id,
         'v1',
         '{"demo": true}'::jsonb,
         false,
         now() - interval '30 days',
         now() + interval '11 months'
  from public.profiles p
  where p.email like '%@barrebykelly.test'
    and not exists (select 1 from public.health_questionnaires h where h.user_id = p.id);

  -- Credits, so they can actually book. Varied so the member list is not uniform.
  for v_member in
    select p.id from public.profiles p
    where p.email like '%@barrebykelly.test'
      and public.credit_balance(p.id) = 0
    order by p.id
  loop
    v_i := v_i + 1;
    perform public.grant_credits(
      v_member.id,
      (array[1, 5, 5, 10, 10, 12])[1 + (v_i % 6)],
      'purchase'::public.ledger_kind,
      now() + interval '90 days',
      null, null, null, null,
      'Demo data');
  end loop;

  -- --- History, so the reports have something to report ----------------------
  -- Past sessions do not exist yet: generation only runs forward. These are
  -- copies of the real timetable shifted backwards, so they carry the right
  -- class type, venue and capacity.
  insert into public.class_sessions
    (class_type_id, venue_id, instructor_id, starts_at, ends_at, capacity, status)
  select s.class_type_id, s.venue_id, s.instructor_id,
         s.starts_at - interval '8 weeks',
         s.ends_at   - interval '8 weeks',
         s.capacity, 'scheduled'
  from public.class_sessions s
  where s.starts_at > now()
    and not exists (
      select 1 from public.class_sessions p
      where p.starts_at = s.starts_at - interval '8 weeks'
        and p.venue_id = s.venue_id)
  limit 12;

  get diagnostics v_sessions = row_count;

  -- Attendance on those past classes. Roughly one in nine does not turn up,
  -- which is about right for a class people have paid for but not much.
  for v_session in
    select id, starts_at from public.class_sessions
    where starts_at < now() order by starts_at
  loop
    insert into public.bookings
      (session_id, user_id, status, source, entitlement_kind, booked_at, checked_in_at)
    select v_session.id,
           p.id,
           case when random() < 0.11 then 'no_show'::public.booking_status
                else 'attended'::public.booking_status end,
           'member'::public.booking_source,
           'credit',
           v_session.starts_at - interval '3 days',
           v_session.starts_at
    from public.profiles p
    where p.email like '%@barrebykelly.test'
      and random() < 0.55
      and not exists (
        select 1 from public.bookings b
        where b.session_id = v_session.id and b.user_id = p.id);

    get diagnostics v_i = row_count;
    v_hist := v_hist + v_i;
  end loop;

  -- --- Upcoming bookings, so the registers are not empty ---------------------
  -- Through book_session rather than an insert, so capacity, credits and the
  -- ledger all behave exactly as they would for a member.
  for v_session in
    select id from public.class_sessions
    where starts_at > now()
      and starts_at < now() + make_interval(days => public.setting_int('booking_window_days', 14))
    order by starts_at
  loop
    for v_member in
      select p.id from public.profiles p
      where p.email like '%@barrebykelly.test'
        and public.credit_balance(p.id) > 0
      order by random() limit 9
    loop
      begin
        perform public.book_session(v_session.id, v_member.id);
        v_booked := v_booked + 1;
      exception when others then
        -- Full, already booked, out of credit: all normal outcomes when filling
        -- a timetable at random, and none of them a reason to abandon the seed.
        null;
      end;
    end loop;
  end loop;

  -- --- Enquiries -------------------------------------------------------------
  insert into public.enquiries (kind, name, email, phone, message, status, created_at)
  select * from (values
    ('contact'::public.enquiry_kind, 'Hannah Price', 'hannah.price@barrebykelly.test'::citext,
     '07700 900101', 'Hi Kelly, is the Monday class suitable if I have not done barre before? Thank you.',
     'new'::public.enquiry_status, now() - interval '2 days'),
    ('contact', 'Marie Doyle', 'marie.doyle@barrebykelly.test', '07700 900102',
     'Do you run anything on a Saturday morning? I work weekdays.',
     'new', now() - interval '5 days'),
    ('contact', 'Sophie Grant', 'sophie.grant@barrebykelly.test', null,
     'I am 14 weeks pregnant and my midwife says low impact is fine. Would I be able to join?',
     'in_progress', now() - interval '9 days'),
    ('contact', 'Ruth Bennett', 'ruth.bennett@barrebykelly.test', '07700 900104',
     'Can I buy a block of classes as a gift for my sister?',
     'closed', now() - interval '21 days')
  ) as v(kind, name, email, phone, message, status, created_at)
  where not exists (select 1 from public.enquiries);

  -- --- Nothing may try to email a .test address ------------------------------
  -- Creating the accounts queued a welcome for each. Those addresses cannot
  -- receive, so every one would fail, retry and fill the queue with noise.
  delete from public.notifications n
  using public.profiles p
  where p.id = n.user_id
    and p.email like '%@barrebykelly.test'
    and n.status in ('queued', 'failed');

  return query
    select 'demo members'::text, v_demo
    union all select 'past sessions created', v_sessions
    union all select 'historical bookings', v_hist
    union all select 'upcoming bookings', v_booked
    union all select 'real members (untouched)', v_real;
end;
$$;

comment on function public.seed_demo_data() is
  'Fills a STAGING database with believable members, bookings, attendance and enquiries. Refuses to run where a real member has a booking. Operates only on accounts at the reserved .test TLD.';

revoke all on function public.seed_demo_data() from public, anon, authenticated;
