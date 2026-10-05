-- =============================================================================
-- Fixing class reminders, which could never have worked.
--
-- `/api/cron/queue-reminders` was written at M5, before any email template
-- existed, and it queued rows with the payload `{booking_id, hours_before}`.
-- The reminder template that arrived at M8 needs className, when, venueName,
-- hoursBefore and cancellationHours — so every reminder would have failed to
-- render, been retried three times, and been marked failed.
--
-- Nobody would ever have received a class reminder, and the only visible symptom
-- would have been a growing pile of failed rows that somebody had to go and look
-- at. The queue/dispatch split is what made this survivable: the rows would have
-- been sitting there, not lost.
--
-- Moving the whole job into SQL fixes it and removes the reason it broke. The
-- payload now comes from `booking_email_payload`, the same function the booking
-- triggers use, so a reminder cannot drift away from a confirmation again. It also
-- replaces a loop that ran a query per session and another per booking.
-- =============================================================================

create or replace function public.queue_class_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offsets integer[];
  v_hours   integer;
  v_booking record;
  v_queued  integer := 0;
  v_id      uuid;
begin
  -- `reminder_offsets_hours` is an array ([24, 2]), like credit_expiry_warning_days.
  select coalesce(
    (
      select array_agg(offset_text::integer)
      from public.settings s
      cross join lateral jsonb_array_elements_text(s.value) as offset_text
      where s.key = 'reminder_offsets_hours'
        and jsonb_typeof(s.value) = 'array'
    ),
    array[24, 2]
  ) into v_offsets;

  foreach v_hours in array v_offsets loop
    -- A window either side of the offset, because the job runs periodically rather
    -- than continuously. The dedupe index is what makes overlapping windows safe:
    -- the same reminder cannot be queued twice however often this runs.
    for v_booking in
      select b.id, b.user_id
      from public.bookings b
      join public.class_sessions s on s.id = b.session_id
      where b.status = 'booked'
        and s.status = 'scheduled'
        and s.starts_at between now() + make_interval(hours => v_hours) - interval '30 minutes'
                            and now() + make_interval(hours => v_hours) + interval '30 minutes'
    loop
      v_id := public.enqueue_notification(
        p_user_id      => v_booking.user_id,
        p_template     => 'reminder_' || v_hours || 'h',
        -- The SAME payload builder the confirmation uses, plus which reminder this
        -- is. This is the whole point of the rewrite.
        p_payload      => public.booking_email_payload(v_booking.id)
                          || jsonb_build_object('hoursBefore', v_hours),
        p_subject_type => 'reminder_' || v_hours || 'h',
        p_subject_id   => v_booking.id);

      if v_id is not null then
        v_queued := v_queued + 1;
      end if;
    end loop;
  end loop;

  return v_queued;
end;
$$;

comment on function public.queue_class_reminders() is
  'Queues 24h/2h class reminders. Offsets come from the reminder_offsets_hours setting; the payload comes from booking_email_payload so a reminder cannot drift from a confirmation.';

revoke all on function public.queue_class_reminders() from public, anon, authenticated;
