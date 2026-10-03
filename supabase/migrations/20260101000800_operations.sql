-- =============================================================================
-- Operations: settings, notifications, enquiries, audit log, editable content.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings: the single home for every business rule.
--
-- No magic numbers in components (working rule 3). lib/policy reads this table
-- and the member-facing policy copy is rendered from the same rows the
-- enforcement logic reads, so the text cannot drift from the behaviour.
-- Invariant 9.
-- -----------------------------------------------------------------------------
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  description text,

  -- False means "this is a placeholder default, nobody has confirmed it".
  -- The admin settings screen surfaces unconfirmed rows so the TODO is visible
  -- in the product rather than buried in a markdown file.
  confirmed   boolean not null default false,

  updated_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.tg_set_updated_at();

comment on table public.settings is
  'Business rules live here, not in code. lib/policy is the only reader.';

-- -----------------------------------------------------------------------------
-- Notifications.
--
-- Also the dedupe guard: the unique index means an overlapping cron run cannot
-- send the same 24h reminder twice.
-- -----------------------------------------------------------------------------
create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles (id) on delete cascade,
  to_email            citext,
  to_phone            text,
  channel             public.notification_channel not null default 'email',
  template            text not null,
  payload             jsonb not null default '{}',

  -- What this notification is about: a booking, a session, a voucher. Part of
  -- the dedupe key.
  subject_type        text,
  subject_id          uuid,

  scheduled_for       timestamptz not null default now(),
  sent_at             timestamptz,
  status              public.notification_status not null default 'queued',
  provider_message_id text,
  error               text,
  attempts            integer not null default 0,

  created_at          timestamptz not null default now()
);

create unique index notifications_dedupe_idx
  on public.notifications (user_id, template, subject_type, subject_id)
  where subject_id is not null and status <> 'failed';

create index notifications_due_idx on public.notifications (scheduled_for)
  where status = 'queued';

comment on index public.notifications_dedupe_idx is
  'Stops a second cron run re-sending the same reminder. Failed rows are excluded so a genuine retry is possible.';

create table public.enquiries (
  id          uuid primary key default gen_random_uuid(),
  kind        public.enquiry_kind not null default 'contact',
  name        text not null,
  email       citext not null,
  phone       text,
  message     text not null,
  status      public.enquiry_status not null default 'new',
  assigned_to uuid references public.profiles (id) on delete set null,
  admin_note  text,
  source_ip   inet,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index enquiries_status_idx on public.enquiries (status, created_at desc);

create trigger enquiries_set_updated_at
  before update on public.enquiries
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit log: every admin mutation (brief §10).
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.tg_append_only();

-- -----------------------------------------------------------------------------
-- Editable content
-- -----------------------------------------------------------------------------
create table public.faqs (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  answer     text not null,
  category   text,
  sort_order integer not null default 0,
  published  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger faqs_set_updated_at
  before update on public.faqs
  for each row execute function public.tg_set_updated_at();

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  body       text not null,
  link_href  text,
  link_label text,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  active     boolean not null default false,
  created_at timestamptz not null default now()
);

-- Imported Google reviews only. Never seeded with invented testimonials: the
-- homepage renders an empty state until real ones exist (brief §4).
create table public.reviews (
  id                uuid primary key default gen_random_uuid(),
  author_name       text not null,
  rating            integer not null check (rating between 1 and 5),
  body              text,
  reviewed_at       timestamptz,
  source            text not null default 'google',
  source_review_id  text unique,
  published         boolean not null default true,
  created_at        timestamptz not null default now()
);

comment on table public.reviews is
  'Imported from Google only. Fabricating a testimonial here would be a lie to customers — the seed script deliberately leaves this empty.';

create table public.newsletter_subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null unique,
  user_id     uuid references public.profiles (id) on delete set null,
  consent_at  timestamptz not null default now(),
  source      text,
  unsubscribed_at timestamptz,
  provider_id text,
  synced_at   timestamptz,
  created_at  timestamptz not null default now()
);
