# Changelog

## [Unreleased]

### M1 — Foundations

**Database.** Ten migrations covering the whole data model: people and roles, waiver
versioning and PAR-Q, schedule templates and sessions, products, the credit ledger,
memberships, vouchers, bookings and waitlists, the video library, and operations
(settings, notifications, enquiries, audit log, content).

- RLS enabled and forced on every table, with deny-by-default: two tables
  (`stripe_events`, `session_generation_runs`) deliberately have no authenticated policy.
- `credit_ledger` and `waiver_signatures` are append-only, trigger-enforced.
- Roles live in their own table with no write policy, closing the self-promotion route a
  `role` column on `profiles` would have opened.
- Health data is admin/instructor-only, enforced in RLS rather than in the UI.
- `credit_balance()` and the `credit_lots` view derive balances and FIFO order; no cached
  balance column exists anywhere.
- Partial unique indexes make session generation idempotent, prevent double-booking, and
  block a repeat intro offer by account, email, phone or card fingerprint independently.

**Verified against real Postgres, not assumed.** `tests/db/run.sh` applies every migration
from scratch and then asserts 35 invariants plus 23 RLS checks, including that a member
cannot read another member's PAR-Q data — tested by switching to the `authenticated` role,
with an assertion that the role switch itself took effect. Wired into CI against a
`postgres:17` service container.

Two bugs this caught before they shipped:

- `has_role()` was declared in the foundations migration but queries `user_roles`, created in
  the next one. A `language sql` body is validated at `CREATE` time, so the migration chain
  failed on a clean database. The role helpers now sit after the table they read.
- The RLS suite's `SET LOCAL role` was outside a transaction block, so it silently did
  nothing and every check ran as superuser. Each persona is now wrapped in
  `BEGIN`/`COMMIT`, with `current_user` asserted so a false pass is impossible.

**Auth.** Email + password, magic link and Google, as Server Actions validated with Zod.
Login failures are deliberately vague so the form cannot be used to enumerate registered
addresses. `next=` redirect targets are validated in one place (`lib/routes.ts`), which
closes the open-redirect and protocol-relative variants. Marketing consent is separate from
account creation and unticked by default.

**Policy module.** `lib/policy` is the only reader of the `settings` table and the only home
for business rules. `rules.ts` is pure and covered by 26 unit tests, including the window
boundary (which resolves in the member's favour — an off-by-one that charges someone is worse
than one that does not). `/policies/cancellation` renders its copy from those same settings,
so the policy text cannot drift from the logic that enforces it.

A further test asserts the settings migration and the policy schema contain exactly the same
keys, because those two files are edited at different times and a mismatch would otherwise
surface as a runtime error on a page load.

**Settings carry a `confirmed` flag.** Every placeholder business rule is seeded as
unconfirmed and listed in `/admin`, so the outstanding decisions are visible in the product
rather than only in a markdown file.

**Design system.** Tokens bridged into Tailwind v4 via `@theme inline`; components reference
semantic tokens only, so re-skinning to Kelly's real palette is a one-file change.
`npm run check:contrast` now exits non-zero on a regression, with a single allowlisted
exception (`--text-disabled`, scoped to disabled controls).

**App shell.** Header, footer, skip link, and honest placeholders for all fourteen M2 routes
so the navigation never dead-ends in a 404 — each stating which input it is waiting on.
Account and admin pages prove the auth, role and RLS chain end to end.

**CI.** Two jobs: format, lint, typecheck, unit tests, contrast and build; plus the database
suite against real Postgres.

**Toolchain.** ESLint pinned to 9 (`eslint-config-next@16` bundles an `eslint-plugin-react`
that calls the `context.getFilename()` ESLint 10 removed). `middleware.ts` renamed to
`proxy.ts` for Next 16.

### M0 — Plan & design

- Build plan with stack confirmation, milestone order and rationale for the three high-risk
  areas: booking concurrency, the credit ledger, webhook fulfilment.
- Data model: ERD, table-by-table spec, ten named invariants, RLS sketch per role.
- Design direction "Warm Studio" (plus an alternative), with every colour pair verified
  against WCAG 2.2 by script rather than estimated.
- Design tokens in two layers (primitives → semantic).
- One-page style guide: palette, type specimen, buttons, status badges, mobile timetable card.
- Open-questions log. Section 0 of the brief was unfilled and `/brand` was empty, so no
  business fact has been invented anywhere in this repo.
