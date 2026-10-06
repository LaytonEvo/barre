-- =============================================================================
-- Rate limit for password reset requests.
--
-- Password reset is a public write path that sends email to an address the
-- requester names, so it is the one flow where an abuser gets to make the site
-- mail a stranger. Capped per IP like the other public writes, and the same
-- global backstop applies on top, because x-forwarded-for can be spoofed.
--
-- Three an hour: a person who has genuinely forgotten retries once or twice and
-- then checks their spam folder.
-- =============================================================================

insert into public.settings (key, value, description, confirmed) values
  ('rate_limit_password_reset_per_hour', '3',
   'Password reset emails triggered from one IP per hour. Low because this flow makes the site send mail to an address someone else typed.',
   true)
on conflict (key) do nothing;
