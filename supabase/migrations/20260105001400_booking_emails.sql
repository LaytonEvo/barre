-- =============================================================================
-- M8, part 4: booking emails, driven by triggers.
--
-- Why triggers rather than a call in each Server Action: a booking can be created
-- from the member UI, from the admin register, or by a waitlist promotion running
-- inside another transaction. Enqueuing at each call site means three places to
-- remember, and the one that gets forgotten is the one nobody notices — because a
-- missing email looks exactly like an email the member deleted.
--
-- A trigger cannot be forgotten. Every row that becomes a booking produces an
-- email, whatever created it.
--
-- The notification is only ENQUEUED here, never sent: an outbound HTTP call inside
-- book_session's locked transaction would hold the session row lock open for the
-- duration of a third-party request, and acceptance test 5 exists because that
-- lock is load-bearing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- booking_email_payload(booking)
--
-- The facts an email needs about a booking, as jsonb. Shared by the triggers so
-- the shape cannot drift between a confirmation and a cancellation.
-- -----------------------------------------------------------------------------
create or replace function public.booking_email_payload(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'firstName',    p.first_name,
    'className',    coalesce(ct.name, 'Barre'),
    -- Formatted here, in UK local time, because the dispatcher has no business
    -- doing timezone arithmetic and the member reads it as a local time.
    'when',         to_char(s.starts_at at time zone 'Europe/London', 'FMDay FMDD FMMonth, HH24:MI'),
    'venueName',    coalesce(v.name, ''),
    'venueAddress', v.address_line1,
    'cancellationHours', public.setting_int('cancellation_window_hours', 24)
  )
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  left join public.class_types ct on ct.id = s.class_type_id
  left join public.venues v on v.id = s.venue_id
  left join public.profiles p on p.id = b.user_id
  where b.id = p_booking_id;
$$;

-- -----------------------------------------------------------------------------
-- A new booking.
--
-- A waitlist promotion gets a different email: "a space opened up and you're in"
-- is a different message from "you're booked", and sending the latter to somebody
-- who did not just book is confusing.
--
-- A walk-in gets nothing. Kelly registered them at the door; they are standing in
-- the room, and an email confirming a class they have already done is noise.
-- -----------------------------------------------------------------------------
create or replace function public.tg_booking_confirmation_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'booked' or new.source = 'walk_in' then
    return null;
  end if;

  perform public.enqueue_notification(
    p_user_id      => new.user_id,
    p_template     => case when new.source = 'waitlist'
                        then 'waitlist_promoted' else 'booking_confirmed' end,
    p_payload      => public.booking_email_payload(new.id),
    p_subject_type => 'booking',
    p_subject_id   => new.id);

  return null;
end;
$$;

drop trigger if exists bookings_confirmation_email on public.bookings;
create trigger bookings_confirmation_email
  after insert on public.bookings
  for each row execute function public.tg_booking_confirmation_email();

-- -----------------------------------------------------------------------------
-- A cancellation.
--
-- Keyed on the booking with a distinct template, so a member who books, cancels
-- and rebooks the same class gets all three emails — the dedupe index is scoped to
-- (template, subject), not to the booking alone.
-- -----------------------------------------------------------------------------
create or replace function public.tg_booking_cancellation_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = new.status then
    return null;
  end if;

  if new.status not in ('cancelled_in_window', 'cancelled_late') then
    return null;
  end if;

  -- When Kelly cancels the whole class, every booking is cancelled at once and
  -- the member should hear WHY, not just that their booking went. That email is
  -- sent by the session trigger below; this one stands down to avoid sending both.
  if exists (
    select 1 from public.class_sessions s
    where s.id = new.session_id and s.status = 'cancelled'
  ) then
    return null;
  end if;

  perform public.enqueue_notification(
    p_user_id      => new.user_id,
    p_template     => 'booking_cancelled',
    p_payload      => public.booking_email_payload(new.id)
                      || jsonb_build_object(
                           'creditReturned', new.status = 'cancelled_in_window'),
    p_subject_type => 'booking_cancelled',
    p_subject_id   => new.id);

  return null;
end;
$$;

drop trigger if exists bookings_cancellation_email on public.bookings;
create trigger bookings_cancellation_email
  after update of status on public.bookings
  for each row execute function public.tg_booking_cancellation_email();

-- -----------------------------------------------------------------------------
-- Kelly cancels a class.
--
-- One email per affected member, explaining what happened and what they got back.
-- Fires on the SESSION rather than per booking so the reason is available.
-- -----------------------------------------------------------------------------
create or replace function public.tg_session_cancelled_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_booking record;
begin
  if old.status = new.status or new.status <> 'cancelled' then
    return null;
  end if;

  for v_booking in
    select b.id, b.user_id
    from public.bookings b
    where b.session_id = new.id
      and b.status in ('booked', 'cancelled_in_window', 'cancelled_late')
  loop
    perform public.enqueue_notification(
      p_user_id      => v_booking.user_id,
      p_template     => 'class_cancelled',
      p_payload      => public.booking_email_payload(v_booking.id)
                        || jsonb_build_object(
                             'reason', new.cancelled_reason,
                             'remedy', public.setting_text('class_cancelled_default_remedy', 'refund')),
      p_subject_type => 'class_cancelled',
      p_subject_id   => new.id);
  end loop;

  return null;
end;
$$;

drop trigger if exists sessions_cancelled_email on public.class_sessions;
create trigger sessions_cancelled_email
  after update of status on public.class_sessions
  for each row execute function public.tg_session_cancelled_email();

revoke all on function public.booking_email_payload(uuid) from public, anon, authenticated;
