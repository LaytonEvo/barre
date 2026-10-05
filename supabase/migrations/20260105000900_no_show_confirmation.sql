-- -----------------------------------------------------------------------------
-- Resolving pending no-shows.
--
-- docs/03 §F1 argued for a pending no-show rather than the brief's straight
-- auto-mark: an automated mark will occasionally punish somebody Kelly simply
-- forgot to check in, and that member has no way to prove otherwise. That design
-- was accepted, and `auto_mark_no_shows` duly writes `no_show_pending`.
--
-- What was missing is the other half of the promise. "Kelly confirms it, or it
-- auto-confirms after 48 hours" needs something to do the auto-confirming, and
-- nothing did — so every pending no-show stayed pending for ever. The record
-- was indefinitely provisional, which is the opposite of the zero-admin
-- outcome the brief asks for: a state that only ever resolves by hand is manual
-- admin wearing a different hat.
--
-- Note this was never a money bug. `forfeit_credit` is passive — the credit was
-- debited at booking and a no-show simply never gets it back — so a pending row
-- costs the member nothing extra and the penalty does not hinge on this flip.
-- It is the attendance record, and the honesty of Kelly's own reports, that
-- needed it.
-- -----------------------------------------------------------------------------

insert into public.settings (key, value, description, confirmed) values
  ('no_show_confirm_after_hours', '48',
   'Hours after a class that an unconfirmed pending no-show becomes a confirmed one. Long enough that Kelly can correct a forgotten check-in, short enough that the record settles. Recommended and accepted 2026-10-05 — see docs/03 §F1.',
   true)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- confirm_pending_no_shows()
--
-- Promotes pending no-shows that nobody disputed within the window. Kelly
-- overriding one is an ordinary `mark_attendance` call to 'attended', which
-- takes the row out of this job's reach, so there is no race to lose: whoever
-- acts first wins and the other finds nothing to do.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_pending_no_shows()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hours integer := public.setting_int('no_show_confirm_after_hours', 48);
  v_count integer;
begin
  with confirmed as (
    update public.bookings b
      set status = 'no_show'::public.booking_status
      from public.class_sessions s
      where s.id = b.session_id
        and b.status = 'no_show_pending'
        and s.starts_at + make_interval(hours => v_hours) <= now()
      returning b.id
  )
  select count(*) into v_count from confirmed;

  -- One audit row for the batch, not one per booking. The individual statuses
  -- are already on the bookings; what is worth recording is that the system,
  -- rather than Kelly, decided these.
  if v_count > 0 then
    -- actor_id resolves to auth.uid(), which is NULL here because no person is
    -- logged in. A null actor is exactly right: it reads as "the system did
    -- this", which is the distinction Kelly needs when reviewing the log.
    perform public.write_audit(
      'auto_confirm_no_shows',
      'bookings',
      null::uuid,
      null,
      jsonb_build_object('count', v_count, 'after_hours', v_hours)
    );
  end if;

  return v_count;
end;
$$;

comment on function public.confirm_pending_no_shows() is
  'Promotes undisputed pending no-shows to confirmed after no_show_confirm_after_hours. Called nightly; see app/api/cron/attendance.';

revoke all on function public.confirm_pending_no_shows() from public, anon, authenticated;
