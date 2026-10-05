# Barre By Kelly

Website and members' platform for Barre By Kelly, a UK barre fitness business.

> **Status: M2 in progress — public site.** Real venues, timetable and town are in; the pages,
> SEO and structured data are built. Booking is M5, payments M4.
>
> **What is real:** both venues with verified postcodes, the three weekly class times, Ringwood as
> the search town, the free first class and £5 thereafter, the 24-hour cancellation window, Kelly
> Brooks and her bio, and her logo and photography — the palette is derived from the logo mint.
>
> **What is still outstanding:** Kelly's qualifications, contact details, photographs of either
> village hall, and real Google reviews. See [`docs/03-OPEN-QUESTIONS.md`](docs/03-OPEN-QUESTIONS.md).

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
public/images/       Kelly's photography, EXIF stripped
design/
  tokens.css         primitives -> semantic. Re-skinned to her logo in this file alone
  contrast-check.mjs WCAG verification, wired into CI
supabase/
  migrations/        schema, then RLS, then settings defaults
  seed.sql           development data, all clearly fake
tests/
  unit/              policy, pricing, time, structured data, image manifest
  components/        real renders of the timetable card, week nav, filters, UI
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

### The booking engine

`book_session()` runs as one transaction holding a `FOR UPDATE` lock on the session row. Without
it, two requests both read "9 of 10 booked", both decide there is room, and both insert.

`tests/db/concurrency.sh` fires 20 genuinely parallel connections at a 10-space class and asserts
exactly 10 succeed. It synchronises inside Postgres rather than in the shell — every connection
sleeps until a shared wall-clock instant — because a busy-wait starves the CPU enough that the
processes stop overlapping, which would turn it into a serial test that always passes. The test
was checked by removing the lock: all 20 then book, and the suite fails.

**No gate is re-checked in TypeScript.** Waiver, PAR-Q, booking window, capacity and entitlement
are all decided in the database, because a check in the action layer is one an attacker skips by
calling the RPC directly. `lib/booking/errors.ts` only turns machine tokens into sentences.

A credit booking and its ledger entry each need the other's id, which a `CHECK` cannot express —
Postgres `CHECK` constraints are never deferrable. It is a deferred constraint trigger instead,
and it re-reads the row at commit rather than trusting `NEW`, because deferring changes when a
trigger runs, not what it sees.

### The credit ledger

`credit_ledger` is append-only, enforced by a trigger that rejects `UPDATE` and `DELETE` even
for the service role. Balances are never stored; `credit_balance()` derives them.

It uses **per-lot accounting**: a positive row is a lot, every negative row names the lot it
consumes (a `CHECK` enforces that), and the balance is what remains in lots that have not
expired. The obvious definition — `sum(delta)` filtered by expiry — is wrong, and was: a grant
carries an expiry while the debits that consume it do not, so once the grant expired its debits
stayed in the sum and a member who bought a 5-pack, used two and let the rest lapse ended up
with a balance of **minus two**.

That also means expiry needs no cron to be correct. The nightly job writes the audit row that
explains where credits went; a missed run can never let somebody book with dead credits.

Credits are consumed soonest-expiry-first (a never-expiring credit goes last, being the one that
cannot be lost by waiting), and a refund restores the credit **with its original expiry**, so
cancelling cannot be used to extend a pack. Every path has a test in `tests/db/ledger.sql`.

### The admin portal

`/admin` is Kelly's half of the product. Two roles reach it and they are not the same: `admin`
sees everything, `instructor` sees today's classes and the register for sessions they are teaching
and nothing more. **The boundary lives in the database**, not in which links the nav renders — a
cover teacher who guesses a URL still gets nothing, and `tests/db/admin.sql` asserts both halves.

Every admin mutation goes through a `SECURITY DEFINER` function that writes to `audit_log`, an
append-only record of who changed what, from which value to which. `admin_adjust_credits` requires
a reason string; an adjustment nobody explained is indistinguishable from an accident later.

The register assumes a phone held in one hand in a cold hall: large tap targets, optimistic
state, and flagged health answers behind one deliberate tap rather than on display in a room full
of people.

Walk-ins attach to an existing account and the form will not create one, because that would mean
accepting a waiver and a health declaration on someone's behalf — worthless to an insurer and
false in the record.

### The video library

Members-only, and the "only" is load-bearing. Three independent things have to hold:

1. **Assets are created with a `signed` playback policy.** A public one would be a URL no amount of
   application code could take back.
2. **Playback needs a short-lived JWT** signed with a private key held only on the server, so there
   is no shareable URL — by the time one is passed on, it has expired. Mux checks a separate
   audience for the stream, the thumbnail and the storyboard, so three tokens are minted per video.
3. **The playback id leaves the database through `video_playback_grant()` and nowhere else**, and
   only for somebody `can_watch_videos()` allows. It is `SECURITY DEFINER` with an explicit check
   rather than a plain select under RLS, because the RLS policy on `videos` deliberately lets any
   member read metadata — the library is an upsell — so a policy alone would hand the id to
   everyone who can see the shelf.

`tests/unit/mux-playback.test.ts` verifies the signing against a locally generated RSA key, so no
Mux account is needed to know the tokens are right. `tests/db/videos.sql` is acceptance test 10, run
as a real `authenticated` role: a non-member is refused, a member streams.

Entitlement is a live membership that includes on-demand, an on-demand subscription, or — behind the
`pack_holders_get_video_access` setting — a pack holder with credits. "Live" comes from
`live_membership()`, which `book_session` also uses, so the two cannot come to disagree about
whether a `past_due` card still counts.

Uploads go from the browser straight to Mux and never through this server; the webhook is the only
thing that learns the result, and it stores a playback id **only** if its policy is `signed`.

---

## Environment variables

See [`.env.example`](.env.example). Four are required for the app to boot; the rest become
required at the milestone that introduces them, so a fresh checkout runs.

`lib/env.ts` validates them at startup and splits client from server: importing `serverEnv`
from a client component is a build error. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely —
ESLint blocks importing `lib/supabase/admin` outside webhook, cron and seed paths.

## Payments

```bash
npm run stripe:sync      # push products and prices to Stripe
npm run stripe:listen    # forward webhooks to the dev server
```

`stripe listen` prints a `whsec_…` on startup — put it in `STRIPE_WEBHOOK_SECRET`. It changes
every time you restart the listener.

**Fulfilment happens only in the webhook.** Not on the Checkout redirect: members close tabs,
and a redirect URL can be typed by hand, so neither is proof of payment. The webhook verifies
Stripe's signature against the raw body, claims the event id in `stripe_events` _before_
fulfilling (so a retry loses on the primary key rather than granting twice), and returns 500 on
a failed handler so Stripe retries rather than silently dropping a paid purchase.

**The free first class never touches Stripe.** A £0 Checkout Session cannot be completed, so
`grantIntroOffer` grants the credit directly after an eligibility check. The consequence is that
there is no card fingerprint to deduplicate against — eligibility rests on account, email and
phone. See `docs/03-OPEN-QUESTIONS.md` question B4a.

**Stripe Prices are immutable.** Changing a price creates a new Price and repoints the product,
deactivating the old one rather than deleting it, so historical receipts keep resolving to what
was actually charged.

## Deployment

Not yet connected. To set it up:

1. Import the repository in Vercel; it detects Next.js with no configuration.
2. Add the environment variables from `.env.example` for Production and Preview.
3. Point the Supabase project's auth redirect URLs at the deployed domain plus
   `/auth/callback`.
4. **Schedule the two nightly jobs** (below) — nothing runs them automatically yet.
5. Domain, DNS and email authentication (SPF/DKIM/DMARC for Resend) are M9.

Every push gets a preview deployment once the repository is connected.

### Scheduled jobs

Two endpoints need a nightly trigger, both authenticated with `CRON_SECRET`:

| Endpoint                   | When  | What it does                                                     |
| -------------------------- | ----- | ---------------------------------------------------------------- |
| `/api/cron/attendance`     | 02:00 | Auto-marks unchecked-in bookings, then confirms pending no-shows |
| `/api/cron/expire-credits` | 02:30 | Writes the audit rows explaining expired credits                 |

They are scheduled with Supabase **pg_cron**, not Vercel Cron, for one concrete
reason: Vercel Cron issues a `GET`, and both of these mutate data. Keeping them
`POST`-only means a crawler, a prefetch or an accidental browser visit cannot
mark a hall full of members absent.

```sql
select cron.schedule('attendance', '0 2 * * *', $$
  select net.http_post(
    url     := 'https://<domain>/api/cron/attendance',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
  );
$$);
```

Neither job is load-bearing for correctness. Credit expiry only writes the
explanation — `credit_balance` already ignores expired lots by date, so a missed
run can never let somebody book on dead credits. Attendance fails in the safe
direction too: if it does not run, bookings stay `booked` and nobody is marked
absent by a job that never happened.

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
