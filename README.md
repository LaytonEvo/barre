# Barre By Kelly

Website and members' platform for Barre By Kelly, a UK barre fitness business.

> **Status: M1 complete — foundations.** Schema, RLS, auth, roles, design system and CI are
> in place. The public site is M2; booking is M5.
>
> **No business fact in this repo is real.** Section 0 of the brief was unfilled and `/brand`
> was empty, so every venue, price, class time and qualification is either a clearly-marked
> placeholder or absent. See [`docs/03-OPEN-QUESTIONS.md`](docs/03-OPEN-QUESTIONS.md).

---

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in the Supabase values below

npx supabase start                # local Postgres + auth + studio + mail catcher
npx supabase db reset             # applies migrations, then seed.sql
npm run db:types                  # regenerate lib/db/database.types.ts

npm run dev                       # http://localhost:3000
```

`supabase start` prints the API URL, anon key and service-role key. Put them in `.env.local`.

Outbound email is caught locally by Inbucket at <http://127.0.0.1:54324>, so the magic-link
and sign-up flows are testable without sending anything.

### Worth looking at first

| URL                      | Why                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `/styleguide`            | The design system, rendered live from the tokens                                                              |
| `/policies/cancellation` | Policy copy generated from the settings table — change the window in `settings` and this page changes with it |
| `/admin`                 | Lists every business rule nobody has confirmed yet                                                            |

---

## Scripts

| Command                   | What it does                                                                      |
| ------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`             | Dev server                                                                        |
| `npm run build`           | Production build (requires the four env vars)                                     |
| `npm run verify`          | Format, lint, typecheck, unit tests, contrast check — what CI runs                |
| `npm run test`            | Vitest unit tests                                                                 |
| `npm run test:db`         | Applies all migrations to a scratch database, then asserts the invariants and RLS |
| `npm run check:contrast`  | Verifies every colour pair against WCAG 2.2; **exits non-zero on a regression**   |
| `npm run db:reset`        | Re-apply migrations and seed locally                                              |
| `npm run db:types`        | Regenerate Supabase types                                                         |
| `npm run lint` / `format` | ESLint / Prettier                                                                 |

### Running the database tests without Supabase CLI

`tests/db/run.sh` works against any Postgres 16+. It applies a small shim
(`tests/db/supabase-shim.sql`) that recreates `auth.users`, `auth.uid()` and the
`anon`/`authenticated`/`service_role` roles, then runs the real migrations unmodified.

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres tests/db/run.sh
```

CI runs this against a `postgres:17` service container on every push.

---

## How it fits together

```
app/                 Next.js App Router
  login/             auth: password, magic link, Google — Server Actions + Zod
  account/           member dashboard (M1 skeleton)
  admin/             role-gated; lists unconfirmed settings
  policies/          cancellation policy renders from the settings table
  styleguide/        live design system
components/ui/       shadcn-convention primitives, semantic tokens only
components/site/     header, footer, milestone placeholders
lib/
  env.ts             Zod-validated env, split client/server so secrets cannot leak
  policy/            ALL business rules. rules.ts is pure and unit-tested
  supabase/          client / server / admin (service-role) / auth helpers
  routes.ts          the single place a redirect target is validated and cast
design/
  tokens.css         primitives -> semantic. Re-skinning changes this file only
  contrast-check.mjs WCAG verification, wired into CI
supabase/
  migrations/        schema, then RLS, then settings defaults
  seed.sql           development data, all clearly fake
tests/
  unit/              policy logic, and a guard that settings and schema agree
  db/                migrations + invariants + RLS against real Postgres
```

### Three rules this codebase holds to

**1. Business rules live in the database, not in code.** Cancellation window, penalties,
booking window, waitlist cutoff, reminder timings and rollover all come from `settings` via
`lib/policy`. There are no policy numbers in components.

The member-facing cancellation copy is _generated_ from those same rows, so the text cannot
describe behaviour the system does not have. `/policies/cancellation` is that in practice.

**2. Money is integer pence.** No float, no `numeric`, anywhere near a price.

**3. Authorisation is checked twice.** Every protected page calls `requireUser()` or
`requireRole()`, and RLS backs it in the database. `proxy.ts` redirects anonymous visitors
away from gated routes, but that is a convenience, not the boundary — a hidden nav link has
never been a security control.

### The credit ledger

`credit_ledger` is append-only, enforced by a trigger that rejects `UPDATE` and `DELETE`
even for the service role. Balances are never stored; `credit_balance()` derives them.
A mistake is corrected with a compensating `admin_adjustment` row, which must carry a reason
and an admin id — a `CHECK` constraint enforces that.

Credits are consumed soonest-expiry-first, and a refund restores the credit **with its
original expiry**, so cancelling cannot be used to extend a pack.

---

## Environment variables

See [`.env.example`](.env.example). Four are required for the app to boot; the rest become
required at the milestone that introduces them, so a fresh checkout runs.

`lib/env.ts` validates them at startup and splits client from server: importing `serverEnv`
from a client component is a build error. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely —
ESLint blocks importing `lib/supabase/admin` outside webhook, cron and seed paths.

## Testing Stripe webhooks (from M4)

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`. Fulfilment happens only in webhook
handlers, never on the Checkout redirect — users close tabs, and a redirect is not proof of
payment. Handlers are idempotent via the `stripe_events` table, because Stripe retries.

## Deployment

Not yet connected. To set it up:

1. Import the repository in Vercel; it detects Next.js with no configuration.
2. Add the environment variables from `.env.example` for Production and Preview.
3. Point the Supabase project's auth redirect URLs at the deployed domain plus
   `/auth/callback`.
4. Domain, DNS and email authentication (SPF/DKIM/DMARC for Resend) are M9.

Every push gets a preview deployment once the repository is connected.

---

## Toolchain notes

- **ESLint is pinned to 9.** `eslint-config-next@16` advertises `eslint >= 9`, but the
  `eslint-plugin-react` it bundles still calls `context.getFilename()`, which ESLint 10
  removed — linting crashes on the first file. Revisit when that plugin updates.
- **`proxy.ts`, not `middleware.ts`.** Next 16 renamed the convention.
- **`lib/db/database.types.ts` is hand-maintained** for now, covering only the tables M1
  queries. Replace it wholesale with `npm run db:types` output once you have Supabase
  running locally; CI has no database for the app job, so generated types cannot be produced
  there yet.

## Documentation

| File                                                         | Contents                                            |
| ------------------------------------------------------------ | --------------------------------------------------- |
| [`docs/00-PLAN.md`](docs/00-PLAN.md)                         | Build plan, stack, milestones, the three hard parts |
| [`docs/01-DATA-MODEL.md`](docs/01-DATA-MODEL.md)             | ERD, tables, invariants, RLS per role               |
| [`docs/02-DESIGN-DIRECTION.md`](docs/02-DESIGN-DIRECTION.md) | Palette, type, verified contrast                    |
| [`docs/03-OPEN-QUESTIONS.md`](docs/03-OPEN-QUESTIONS.md)     | **Missing inputs, grouped by what they block**      |
| `brand/README.md`                                            | Assets still needed from Kelly                      |

A plain-English admin guide for Kelly lands at M9.
