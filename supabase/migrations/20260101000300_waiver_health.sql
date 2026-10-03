-- =============================================================================
-- Waiver versioning and the PAR-Q health questionnaire.
--
-- Both are legally sensitive. The waiver is the evidence Kelly's insurer will
-- ask for; the health questionnaire is UK GDPR special category data.
-- =============================================================================

create table public.waiver_versions (
  id            uuid primary key default gen_random_uuid(),
  version_label text not null unique,
  body_markdown text not null,

  -- Hash of the exact text agreed. Lets us prove, years later, precisely what
  -- a member signed even if the markdown is later edited by mistake.
  body_sha256   text not null,

  is_current    boolean not null default false,
  published_at  timestamptz,
  published_by  uuid references public.profiles (id),
  created_at    timestamptz not null default now()
);

-- At most one current version, enforced in the database rather than in code.
create unique index waiver_versions_one_current_idx
  on public.waiver_versions ((true)) where is_current;

create table public.waiver_signatures (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete restrict,
  waiver_version_id   uuid not null references public.waiver_versions (id) on delete restrict,
  typed_name          text not null,
  signature_image_path text not null,
  pdf_path            text,
  signed_at           timestamptz not null default now(),
  ip_address          inet,
  user_agent          text
);

create index waiver_signatures_user_idx on public.waiver_signatures (user_id, signed_at desc);
create unique index waiver_signatures_user_version_idx
  on public.waiver_signatures (user_id, waiver_version_id);

-- Immutable. Every historical signature is kept; publishing a new waiver
-- version forces a re-sign rather than overwriting.
create trigger waiver_signatures_no_update
  before update on public.waiver_signatures
  for each row execute function public.tg_append_only();
create trigger waiver_signatures_no_delete
  before delete on public.waiver_signatures
  for each row execute function public.tg_append_only();

comment on table public.waiver_signatures is
  'Append-only legal record. ON DELETE RESTRICT on user_id: erasure anonymises the profile but must not remove the signature before its retention period expires.';

-- -----------------------------------------------------------------------------
-- PAR-Q.
--
-- Answers are jsonb so the question set can change without a migration, with
-- questionnaire_version recording which set was answered.
-- -----------------------------------------------------------------------------
create table public.health_questionnaires (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  questionnaire_version text not null,
  answers               jsonb not null,

  -- Any "yes" sets flagged. This flags for Kelly to review; it never blocks a
  -- booking automatically (brief §5).
  flagged               boolean not null default false,
  flag_summary          text,

  injuries_text         text,
  conditions_text       text,
  pregnancy_status      text,
  pregnancy_weeks       integer,
  recent_surgery        boolean not null default false,

  -- Special category data needs explicit consent, recorded separately from the
  -- account's general terms acceptance.
  explicit_consent_at   timestamptz not null,

  review_state          public.parq_review_state not null default 'not_required',
  reviewed_by           uuid references public.profiles (id),
  reviewed_at           timestamptz,
  review_note           text,

  completed_at          timestamptz not null default now(),

  -- Drives the 12-month re-prompt (brief §8).
  valid_until           timestamptz not null,

  created_at            timestamptz not null default now()
);

create index health_questionnaires_user_idx
  on public.health_questionnaires (user_id, completed_at desc);
create index health_questionnaires_flagged_idx
  on public.health_questionnaires (flagged, review_state)
  where flagged and review_state <> 'reviewed';

comment on table public.health_questionnaires is
  'UK GDPR special category (health) data. RLS grants read access to the owning member and to staff only. Retention and erasure are documented in the privacy policy.';

-- -----------------------------------------------------------------------------
-- Onboarding gate, as one queryable view.
--
-- The booking RPC (M5) reads this rather than re-deriving the rules, so the
-- gate has exactly one definition.
-- -----------------------------------------------------------------------------
create or replace view public.member_onboarding_status
with (security_invoker = true)
as
select
  p.id as user_id,
  exists (
    select 1
    from public.waiver_signatures ws
    join public.waiver_versions wv on wv.id = ws.waiver_version_id
    where ws.user_id = p.id and wv.is_current
  ) as current_waiver_signed,
  exists (
    select 1 from public.health_questionnaires hq
    where hq.user_id = p.id and hq.valid_until > now()
  ) as parq_valid,
  (
    select max(hq.completed_at) from public.health_questionnaires hq
    where hq.user_id = p.id
  ) as parq_completed_at
from public.profiles p;

comment on view public.member_onboarding_status is
  'Single definition of the pre-booking gate. security_invoker so the caller''s RLS applies.';
