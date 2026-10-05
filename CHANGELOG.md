# Changelog

## [Unreleased]

### M8 — Growth and polish

The emails, the gift vouchers, the promo codes and the automations. Also the point at
which the system stops being silent: `notifications` has been a queue since M1 and
nothing has ever drained it, so until now a member who booked a class got no
confirmation.

**ACCEPTANCE TEST 14 passes**: a voucher bought, emailed to its recipient on the
scheduled date and not before, and redeemed for credit.

**Sixteen email templates**, each with a plain-text part — not a nicety: a multipart
email without one scores worse with spam filters, and some recipients read it
instead of the HTML. Every template renders in a test with a real payload, and the
test fails if a new one is added without one.

**Everything is queued; one job sends.** Nothing in the app calls Resend directly.
That indirection buys three things: who gets an email is decided once in SQL and can
be inspected before anything leaves the building; a booking confirmation cannot be
forgotten by a caller, because it is a trigger; and nothing sends inside
`book_session`, where an outbound HTTP call would hold the session row lock open for
the length of a third-party request — and acceptance test 5 exists because that lock
is load-bearing.

**Booking emails are triggers rather than calls**, deliberately. A booking can be
created from the member UI, the admin register, or a waitlist promotion inside
another transaction. Three call sites means one that gets forgotten, and a missing
email looks exactly like one the member deleted. The tests insert bookings directly —
the crudest possible caller — and still expect the email.

A walk-in gets no confirmation (they are standing in the room), a waitlist promotion
gets "a space opened up" rather than "you're booked", and nobody gets both a
class-cancelled and a booking-cancelled email for the same event.

**The queue cannot double-send.** A `sending` state sits between `queued` and `sent`,
claimed with `for update skip locked`, so two overlapping cron runs take different
rows. A row stranded in `sending` by a crashed dispatcher goes back on the queue after
15 minutes — comfortably longer than any send, so recovery cannot race a slow
dispatcher and cause the thing it exists to prevent. Three attempts five minutes
apart, then it fails visibly with the provider's reason kept.

**Marketing consent is enforced twice and is the one thing that cannot be got wrong.**
The selection query excludes anyone without consent and the dispatcher checks again.
Each template declares whether it is marketing, so the rule is data rather than
something each caller remembers — and the classification is argued, not assumed:
asking somebody whether a class they paid for hurt them is service email, a win-back
to somebody who has stopped coming is marketing.

**No unsubscribe secret means no marketing email.** Under PECR a marketing email needs
a working opt-out, so a missing `EMAIL_LINK_SECRET` makes the dispatcher skip those
rows rather than send them with a dead link. Links are an HMAC over the member id:
nothing stored, nothing to expire, and not forgeable, so a crawler following links
cannot unsubscribe anybody. Unsubscribing turns off marketing only — reminders for
classes somebody has booked keep working, because switching those off would mean
turning up to a class that was not happening.

**Gift vouchers fix a fairness problem in the original schema.** The ledger counts
classes, not money, so a £50 voucher has to become some number of classes. Converting
at redemption would mean a price rise between Christmas and February silently shrinks
the gift — paid for ten, gets eight. The count is now fixed when the voucher is
**bought**, at the price in force then, and a test doubles the class price afterwards
to prove the gift does not shrink.

Codes are read aloud and typed off a card, so the alphabet omits every lookalike pair
(no O/0, I/1, S/5, Z/2, B/8) and redemption accepts lower case, missing hyphens and
stray spaces. Redemption is row-locked, because two taps on a slow connection are two
concurrent attempts at the same code.

**Four automations**, each keyed so "once" is true without a flag column: the
first-class follow-up on the booking, the win-back and review request on the member,
the expiry warning on the **credit lot** — because somebody holding two packs with
different expiry dates has two different things to be told about, and one warning
naming the nearer date would mislead them about the other.

**Promo codes are Stripe's.** The discount is applied by Checkout, not recalculated
here: two implementations of "£5 off a £25 pack" would eventually disagree, and the
one the customer's card believes is Stripe's.

**SMS is behind two switches**, both of which must be on — the `feature_sms_enabled`
setting and Twilio credentials — because they answer different questions. UK mobiles
are normalised to E.164 and a landline is refused rather than texted, since a text to
a landline fails silently and is still billed.

Four bugs the tests caught, all mine:

- `credit_expiry_warning_days` is an **array** (`[7, 1]`), not a number. Reading it
  with `setting_int` fails outright, which is how it surfaced; the whole warning
  window had to be rederived from the array.
- `grant_credits` takes `purchase_id`, `membership_id`, `voucher_id` and `admin_id` in
  a row, and I passed a reason string positionally into `membership_id` — a text value
  into a uuid parameter. Every call in that file is now by name.
- An **empty** `EMAIL_LINK_SECRET` reported itself as configured, so a deployment with
  the variable present but blank would have signed every unsubscribe link with an
  empty key. Empty now counts as absent.
- An em dash in the waitlist SMS forced the whole message into UCS-2, cutting the
  per-segment limit from 160 characters to 70 and doubling what every one of those
  texts costs. A test now rejects any non-ASCII character in an SMS body.

**Found two gaps while reviewing M8 before moving on, and fixed both.**

The first was a real defect. `/api/cron/queue-reminders` was written at M5, before any
template existed, and queued the payload `{booking_id, hours_before}`. The reminder
template needs the class, the time, the venue and the cancellation window — so **every
class reminder would have failed to render**, been retried three times and been marked
failed. Nobody would ever have received one, and the only symptom would have been a
growing pile of failed rows somebody had to go and look at.

The job is now in SQL and builds its payload from `booking_email_payload`, the same
function the confirmation email uses, so a reminder cannot drift away from a
confirmation again. A test asserts every field the template requires is present — the
check that was missing. (The queue/dispatch split is what made this survivable rather
than silent: the rows would have been sitting there, not lost.)

The second was the most consequential untested function in the milestone:
`dispatchEmails` decides whether marketing reaches somebody who has not consented, and
nothing exercised it. It now has 17 tests against a stubbed provider, including that a
win-back to a non-consenting member is skipped with a reason, that transactional email
still goes to the same member, that an erased member is never emailed whatever is
queued, and that one unrenderable row does not abandon the rest of the batch. Verified
by removing the consent check and watching the right test fail.

349 unit and component tests (was 272), 355 database checks (was 263), 66 routes.

### M7 — Video library

Barre in the front room, for the weeks somebody cannot get to a Monday class. This is the retention
half of the brief, and the whole of it turns on one question: can a person who has not paid for it
get something playable? **ACCEPTANCE TEST 10 says no, and is tested both ways** — a non-member is
refused a playback id, an entitled member gets one and streams.

**The library is visible to members who cannot watch it, deliberately.** Metadata stays readable; a
shelf of thirty classes is a better argument for adding on-demand access than a locked door is. What
is gated is anything playable. The two halves are separate tests, because conflating them is how you
end up with a library nobody can browse or a gate that is not one.

**Nothing playable exists without a signed token.** Mux assets are created with a `signed` playback
policy, and playback needs a short-lived JWT signed with a private key that never leaves the server.
So there is no URL to leak: by the time one is passed on it has expired. Three tokens are minted per
video — Mux checks a separate audience for the stream, the thumbnail and the storyboard — and all of
it is tested against a locally generated RSA key, so the signing is verified without a Mux account.

**One definition of a live membership, now shared.** `book_session` had the predicate inline;
video entitlement needed the same one. Rather than copy it, it is extracted as `live_membership()`
and both use it, because the two disagreeing about whether a `past_due` card still counts is a bug
that surfaces as one member complaining about one half of the product.

**The equipment filter asks what you have, not what to search for.** Picking "mat" returns videos
needing a mat _or less_ — never one that also wants weights you do not own. It is a subset test, and
the UI says "what have you got to hand?" so the semantic is visible rather than surprising. The
alternative reading returns a list of things the member cannot actually do.

**Progress is saved on a timer and on tab-hide**, not on `timeupdate` — which fires four times a
second and would mean a Server Action call per 250ms. Positions are clamped to the duration in the
database, so a bad seek cannot store a resume point past the end, and completion is sticky, because
re-watching a video should not quietly undo a programme's progress.

**Uploads go from Kelly's phone straight to Mux**, never through this server: a 45-minute class
through a serverless function is a timeout, not a feature. `XMLHttpRequest` rather than `fetch`,
because fetch has no upload-progress event and a button that says nothing for eleven minutes on
rural broadband is a button that gets pressed twice.

**A video cannot be published before Mux can play it** — a database CHECK, not a UI check, so a
scheduled release cannot put a member in front of a dead player. The admin action reports it as a
sentence rather than a constraint name.

**The webhook refuses a public playback id.** An asset can carry several; taking the first would
store a public one if it were ever present, silently turning a members-only video into a permanent
open URL with nothing in the UI looking wrong. The test that covers it puts the public id _first_ in
the list, because `ids[0]` would otherwise pass every other test in the file.

Also: continue-watching (ignoring anything under 30 seconds in, so a mis-tap does not litter the
shelf), favourites, "new this week", a most-watched report with completion rates and CSV export, and
`/admin/videos` for upload, details, scheduling and unpublishing.

**Fixed a second hole in the test harness, worse than the first.** `run.sh` applied migrations
through a pipeline ending in `|| true`, so a migration could fail with a hard `ERROR` and the suite
still printed "All database checks passed" — a broken function stayed invisible until some later test
happened to call it. My first fix read `PIPESTATUS` after that `|| true`, which resets it, so it
reported success too; psql's status is now captured directly. Verified by breaking a migration on
purpose and watching the run fail and name the file.

**One thing I tried and backed out:** revoking `select` on `mux_playback_id` as defence in depth.
`revoke select (col) on videos from authenticated` is accepted without error and does nothing — a
table-level grant covers every column, and carving one out means granting the rest by hand and
remembering to grant every future column. The migration now says so, and says why leaving it readable
is sound: the id is opaque without a signed token, and the case that would make it dangerous is
closed in the webhook instead.

272 unit and component tests (was 232), 263 database checks (was 216), 58 routes building clean.

### M6 — Admin and instructor portal

The half of the product Kelly actually lives in. Everything that previously required a developer
with database access is now a page she can reach on her phone between classes.

**The register is built for a cold village hall, not a desk.** Thumb-sized Here / No-show buttons
that respond immediately and reconcile with the server afterwards, because a tap that appears to
do nothing gets tapped again. First-timers carry a badge, so Kelly knows who to greet and who
needs the beginner's explanation before the music starts. A flagged health answer shows as a
discreet marker that expands on tap — the detail is one deliberate action away rather than on
display in a room full of people, which is the right default for special category data.

**Walk-ins are registered against an existing account, and the form refuses to create one.** It
would mean accepting a waiver and a health declaration on somebody's behalf, which is worth
nothing to an insurer and is a lie in the record. Instead it asks the person to sign up on their
phone there and then, which takes under a minute and produces evidence that holds.

**A cover teacher is not an administrator.** The instructor role gets today's classes and the
register for sessions they are teaching, and nothing else — no member list, no credit ledger, no
revenue. That boundary is enforced in the database, not in the navigation, and
`tests/db/admin.sql` asserts each half of it: the register they can reach, and the four things
they cannot.

**Every state change that touches money or capacity is audited** to an append-only table — who,
when, what the value was before, what it is now. `admin_adjust_credits` will not run without a
reason, because an unexplained adjustment is indistinguishable from a mistake six months later.

**Cancelling a class tells you the cost before you commit**: the confirmation names how many
people are booked and that all of them will be refunded in full, then does exactly that
(ACCEPTANCE TEST 7). Capacity can be raised and lowered, but never below the number already
booked — and raising it immediately books whoever is next on the waitlist, verified in test.

**Settings are editable, which is what made "nothing hard-coded" true rather than aspirational.**
The 25-space capacity, the £5 class price, the 24-hour cancellation window and the rest are rows
Kelly can change, grouped by what they affect rather than by column name, each showing the
business consequence in plain words. The ones I filled in with assumptions are marked
"unconfirmed" until she ticks them off, so a placeholder cannot quietly become a fact.

**Reports export as CSV** — attendance, revenue, and an at-risk list of members who used to come
and have stopped. Cells that a spreadsheet would execute (`=`, `+`, `-`, `@`) are neutralised,
because the names in those files come from a public sign-up form and the person opening them is
not thinking about formula injection.

**The content page is how the launch blocker gets cleared.** The waiver publisher will not publish
without an explicit confirmation that the wording has been checked against the insurance policy
and reviewed by a legal professional — a tick Kelly can only honestly give after that has
happened.

**Closed a hole I had left in my own design.** `docs/03 §F1` argued against the brief's straight
auto-marking of no-shows: an automated mark occasionally punishes somebody Kelly simply forgot to
check in, and that member cannot prove otherwise. The agreed design was a _pending_ no-show that
Kelly confirms, or that auto-confirms after 48 hours. The first half was built at M5; nothing ever
did the auto-confirming, so pending no-shows stayed pending for ever — a record permanently
provisional, which is manual admin wearing a different hat.

Now `confirm_pending_no_shows()` settles undisputed ones after a settings-driven window, Kelly's
correction always beats the job (verified by a test that fails when the guard is removed), and the
register shows a pending no-show as a question — "Marked absent — confirm?" — rather than as
settled, so the one row that still wants a human does not get scrolled past.

Never a money bug: `forfeit_credit` is passive, so a pending row cost nobody anything. It was the
attendance record, and the honesty of Kelly's own reports, that needed it.

**Both nightly jobs now have somewhere to be called from**, and the README says how to schedule
them. They stay `POST`-only and run from pg_cron rather than Vercel Cron, because Vercel Cron
issues a `GET` and a prefetch or a crawler should not be able to mark a hall full of members
absent.

**Fixed a flaw in the test harness itself**: `run.sh` filtered output to lines matching
`PASS|FAIL`, which silently swallowed real psql `ERROR` lines — a suite could abort and show
nothing but its last success. It now surfaces `ERROR`, `DETAIL` and `CONTEXT`. Found by hitting it.

232 unit and component tests (was 217), 216 database checks (was 177), 53 routes building clean.

### M3 — Onboarding

Booking now works end to end: the gate M5 enforces has a flow behind it.

**Waiver signing**, with the evidence an insurer would actually ask for. The signature row is
written **before** the PDF, deliberately: the row is the legal record and the PDF is a rendering
of it, so a formatting error cannot lose a signature somebody genuinely made.

The record stores a SHA-256 of the exact text agreed, and the text is re-verified against that
hash at sign time — if a published version has been altered since, signing is refused rather than
recording an attestation to something nobody agreed to. A version label alone proves nothing.

**ACCEPTANCE TEST 13 passes**: publishing a new waiver version invalidates every existing
signature for the booking gate while keeping the historical signatures, because those are the
record of what each member agreed to at the time.

**The signature image is treated as untrusted input.** It arrives from the browser as a data URL,
so the prefix is checked, the base64 decoded server-side, the PNG magic number verified, and the
size bounded at both ends — an untouched canvas compresses to almost nothing, and a 500KB
"signature" is not one.

**Health questionnaire**, nine questions following the PAR-Q+ shape. Radio buttons rather than
checkboxes, because an unticked box is ambiguous — it could mean "no" or "I did not read this" —
and a missing answer is treated as missing, never as a no. Free text counts as a flag too:
somebody who answers no to everything but writes "knee replacement in March" has told us
something that matters.

A "yes" **flags and never blocks**, which is both what the brief asks for and the safer design: a
door that closes on a health answer is a door people lie to get through. A test asserts the
response never contains "cannot book".

**Private storage**, verified. Both buckets are non-public, so there is no guessable URL; reads go
through 60-second signed URLs. The storage policies are tested as a real authenticated role — a
member sees only their own signature, and writing into another member's folder is refused.

**Privacy controls**: export everything as JSON, and erasure that deletes health data outright
while anonymising bookings and purchases (accounting records HMRC expects to exist) and keeping
the signed waiver for its retention period. Each of those three outcomes has its own test, and a
member cannot export or erase anybody else's record.

**The PDF is verified by reading it back** — inflating the Flate-compressed content streams and
decoding the hex-encoded text — so the assertions check what a person opening the file would see
rather than passing vacuously. Writing that extractor surfaced a bug in it: `indexOf('stream')`
also matches inside `endstream`, so it had been silently skipping every other stream.

⚠️ **The waiver and PAR-Q text are DRAFT and must be reviewed against Kelly's insurance policy
before launch.** `npm run waiver:publish-draft` refuses to run against a non-local database.
Questions for the insurer are carried alongside the draft in `WAIVER_REVIEW_NOTES`.

217 unit and component tests (was 176), 177 database checks (was 146).

### M5 — Booking engine

**ACCEPTANCE TEST 5 passes: 20 simultaneous bookings at a 10-space class produce exactly 10
bookings, 10 "class is full", and 10 credit debits.** `tests/db/concurrency.sh` fires twenty real
parallel connections — synchronised inside Postgres on a shared wall-clock instant, because a
shell FIFO is fragile about which reader wakes and a busy-wait starves the CPU enough that the
processes stop overlapping, which would quietly turn it into a serial test that passes whether or
not the locking works.

**The test was then verified to fail.** With `FOR UPDATE` removed from the session lookup, all 20
attempts book a 10-space class and the suite exits non-zero. A concurrency test that cannot fail
is worth nothing.

**A structural problem solved properly.** A credit booking needs its ledger entry's id and the
ledger entry needs the booking's — each row wants the other's key. The existing `CHECK` could not
express "true by the end of the transaction", because Postgres `CHECK` constraints are never
deferrable. It is now a deferred constraint trigger, which re-reads the row at commit rather than
trusting `NEW`: deferring delays _when_ a trigger runs, not _what it sees_, so checking `NEW`
would have rejected every credit booking.

**Functions**: `book_session` (row-locked, with every gate — waiver, PAR-Q, booking window,
duplicate, capacity, entitlement — checked server-side), `cancel_booking`, `join_waitlist`,
`leave_waitlist`, `promote_from_waitlist`, `cancel_session`, `mark_attendance`,
`auto_mark_no_shows`.

52 tests in `tests/db/booking.sql`, including acceptance test 6 (a cancellation auto-books the
first waiting member and consumes their credit) and acceptance test 7 (Kelly cancels a class and
every attendee is refunded automatically). Also: the cancellation boundary resolves in the
member's favour, cancelling twice cannot mint a credit, a member without credits is skipped rather
than stalling the waitlist, nobody is auto-booked inside the cutoff, and a no-show still counts
against capacity because the class was full on the night.

**No gate is re-checked in TypeScript.** A check in the action layer is a check an attacker skips
by calling the RPC directly, so the actions only translate the database's machine tokens
(`session_full`) into sentences. Unrecognised failures become a generic apology rather than
leaking Postgres' own wording, which a test pins.

**Calendar invitations** hand-built rather than pulled from a library: CRLF endings, escaping, and
folding at 75 **octets** — counted in bytes, because a venue name with a pound sign is multi-byte
in UTF-8 and splitting mid-character produces a file some clients reject outright. Calendar
clients fail silently, so these are tested.

**Also**: `/account/bookings` with policy-aware cancellation warnings generated by the same pure
function the policy page renders from, the reminder-queueing cron (sending is M8), and live
booking on the timetable.

Two type bugs the database tests caught: a `CASE` over string literals is `text`, and assigning it
to an enum column is an error rather than an implicit coercion. And one brittle test of my own —
an RLS assertion pinned to an absolute row count broke once earlier suites started creating their
own members; it now compares against the real total, which is what it always meant.

176 unit and component tests (was 153), 146 database checks (was 90).

### M4 — Payments & credits

**Fixed a real bug in `credit_balance` before anything depended on it.** The old definition was
`sum(delta)` filtered by expiry, which looks right and is not: a grant carries an expiry, the
debits that consume it do not. Once the grant expired its debits stayed in the sum, so a member
who bought a 5-pack, used two classes and let the rest lapse ended up with a balance of **minus
two**. Reproduced against a real database before the fix was written.

The ledger now uses per-lot accounting — a positive row is a lot, every negative row names the
lot it consumes (enforced by a `CHECK`, so an unattributed debit cannot exist), and the balance
is what remains in unexpired lots. A useful consequence: **expiry needs no cron to be correct**.
The nightly job writes the audit row explaining where credits went; a missed run can never let
somebody book with dead credits. A job the system's correctness depends on is a job that will
eventually take the system down.

**Ledger functions**: `grant_credits`, `consume_credits` (FIFO, row-locked so two bookings cannot
race for the last credit), `refund_booking_credits` and `expire_credits`. 29 tests in
`tests/db/ledger.sql` covering every path, including the regression above, that a refund keeps the
**original** expiry so cancelling cannot extend a pack, that a never-expiring credit is spent last
(being the one that cannot be lost by waiting), and that both expiry and refunds are idempotent.

**Stripe**: client, product/price sync, Checkout, Customer Portal, and the webhook.

Three things make fulfilment safe, and each has a test: the signature is verified against the raw
body; the event id is claimed in `stripe_events` **before** anything is fulfilled, so a retry loses
on the primary key rather than granting twice; and a failed handler returns 500 so Stripe retries
rather than a paid purchase silently vanishing. Nothing outside the webhook grants credits — a
Checkout redirect is not proof of payment, and the success page can be reached by typing the URL.

**Stripe Prices are immutable**, so a price change creates a new Price and deactivates the old one
rather than deleting it: a receipt from last month must keep resolving to what was actually paid.

**The free first class never touches Stripe**, because a £0 Checkout Session cannot be completed.
Eligibility is claimed by _inserting_ the row rather than checking first, so two simultaneous
requests cannot both pass a "have you claimed?" query — one loses on the unique index.

Also: `/account/billing` with the full credit history and purchases, buy buttons on `/pricing`, and
the expiry cron behind a shared secret.

The ESLint guard on the service-role client earned its keep — it caught the new Stripe and credits
modules importing it. They are legitimate callers, so the allowlist now names them explicitly with
the reason for each, rather than the rule being weakened.

153 unit and component tests (was 136), 90 database checks (was 62).

### M2 — Public site (complete, bar what needs staging)

**Components are now actually rendered in tests**, which closes the gap I had been flagging every
turn: no Docker here means no local Supabase, so the pages have never been opened in a browser.
Rendering the components for real with `renderToStaticMarkup` is the closest substitute, and it
exercises genuine logic rather than just proving things compile — that a full class swaps Book for
the waitlist, that a cancelled one offers no action at all, that Earlier is disabled on the current
week, that the active filter carries `aria-current` and not merely a colour, that every button
clears 44px and keeps a visible focus style.

Writing them immediately caught two mistakes in my own assertions, both worth recording: the UTC
instant legitimately appears in the `<time>` element's machine-readable attribute while the visible
text is UK local, so text and attributes have to be asserted separately; and React 19 emits
`dateTime` rather than lowercasing it the way it does `className`, which is harmless since HTML
attribute names are case-insensitive, but would have made the test fail on a React upgrade for no
real reason.

**Newsletter sign-up** on the homepage, storing `consent_at` — the timestamp is the point, being
what UK GDPR and PECR require us to be able to show. A duplicate address returns success rather
than "already subscribed", which would leak who is on the list to anyone who cared to probe.

**Announcement banner**, scheduled by `starts_at` / `ends_at` in the database rather than by
somebody remembering to switch it off. A banner about a cancelled class is actively harmful the day
after. Renders nothing at all when there is none, so the header reserves no empty space.

**Cookie policy** written from what the site actually does, not from a template: the Supabase auth
cookies, the single consent key, and Plausible, which is never requested unless consent is granted.

136 unit and component tests (was 101), 62 database checks, 30 routes.

**Kelly's brand assets arrived (2026-10-05), and the palette is now hers.**

The logo mark is a soft mint, **#BBE7C4**, hue 132°. That exact value is kept unmodified as
`green-200` and the rest of the scale is generated at the same hue, so the palette is derived
rather than hand-picked. The fallback plum and blush are gone.

One thing the mint forces: at **1.37:1 against white** it cannot carry text or act as a button —
it fails every threshold by a wide margin. So it is used as a _surface_, in large blocks with dark
text on it (12.22:1), while darker steps of the same hue carry headings (9.57:1), links (6.75:1)
and the primary button (7.27:1). A warm clay accent, picked to match the straw tones in the
photography, is reserved for the Book button so it is the one thing on a screen that is not green.
All 20 pairs pass WCAG AA.

Re-skinning touched `design/tokens.css` and nothing else — which is what the primitives/semantic
split was built for, and the first real test of it.

**Photography.** 14 images: outdoor lifestyle, studio work at a barre, and one genuine class shot.
EXIF stripped (phone and camera files can carry GPS), capped at 1600px, originals kept in
`brand/photos/`. `lib/images.ts` is a typed manifest carrying real dimensions — so nothing shifts
as images load — and deliberate alt text, with decorative uses passing `alt=""` at the call site
rather than making a screen reader repeat the caption beside it.

Wired into the homepage hero and gallery, `/about`, `/classes`, and `/new-here` (the class photo,
which answers "what is it actually like" better than any copy). A favicon inverted onto deep brand
green, because the mint on a pale ground is invisible at 16px, and an Open Graph card from the hero.

**Kelly Brooks**, with her bio stored verbatim.

Two things found by checking rather than by the build, which was green throughout:

- The migration renamed her slug to `kelly-brooks`, but `/about` still queried `slug = 'kelly'` and
  would have silently shown the placeholder. It now queries by sort order, which also stops the
  page assuming a single named instructor.
- Image paths live in SQL where TypeScript cannot see them, so a test now walks the migration and
  asserts every referenced file exists. A missing image is otherwise invisible — Next emits a
  broken `<img>` and the build passes.

**Flagged, not silently fixed:** the bio says the class is "based at St Leonards & St Ives Village
Hall" and mentions the 6:30 and 7:30 classes, but does not mention Thursday at St Ives Primary
School. Her words are left as written rather than edited; the timetable and locations pages carry
both venues, so nobody is misled, but it is worth her adding a line.

**Still missing:** photographs of either village hall — every image is Kelly outdoors or in a dance
studio, so the venue pages keep their honest empty state.

101 unit tests (was 80).

**Capacity 25 and a £5 class (2026-10-05).** Both are working figures Layton set to get the site
usable, and both are meant to move.

Capacity lives in three places on purpose — the venue default, the weekly template, and the
individual session — because Kelly needs to be able to cap one specific class without changing the
slot. Editing a template does not retro-fit sessions that already exist, so the migration updated
future sessions explicitly and left past ones alone: a class's capacity is part of its record,
being what the register was measured against.

Pricing derives the packs from the single class: six for £25 and twelve for £50, both £4.17 a
class, a 17% saving. The per-class figures and the saving badge on `/pricing` are computed from
the single-class price rather than stored, so they cannot contradict the price printed beside
them. 14 tests cover that arithmetic, including that an unpriced pack never renders "£0 a class"
and that a badly-priced one shows no saving rather than a negative one.

Two new database invariants, checked on every run rather than once at migration time: no active
pack costs as much per class as paying each time, and nothing except the free first class is
active at £0. Both were verified to actually fail when violated.

Pack expiry (180 and 365 days) remains a guess and is recorded as such.

**Real business data.** Layton supplied the venues, timetable, town and the free first class on
2026-10-05, so `20260105000200_business_data.sql` replaces the DEMO fixtures with production
configuration. Both postcodes were verified against each venue's own public record rather than
assumed: St Leonards & St Ives Village Hall, Braeside Road, BH24 2PH, and St Ives Primary School,
Sandy Lane, BH24 2LE. Unconfirmed settings dropped from 19 to 8.

**Session generation**, pulled forward from M5 because the timetable needs real sessions. One
function used by both the seed script and the future cron job, so dev and production cannot
generate differently. Verified that a weekly 18:30 class stays 18:30 either side of the
25 October clock change — it moves from 17:30 UTC to 18:30 UTC, which is the whole point of
converting wall-clock times in the venue's timezone instead of adding 168 hours.

**Pages**: homepage with live next classes, the timetable (list on mobile, filterable by venue,
week navigation as real shareable URLs with no client state), `/locations` and a page per venue,
`/classes` and a page per class type, `/pricing`, `/new-here`, `/faq`, `/about`, `/contact` and
`/private-and-events`. 27 routes build, with the venue and class pages prerendered.

**SEO**: per-page titles and descriptions carrying local intent, `sitemap.xml` and `robots.txt`
generated from the database, and structured data for the business, each venue, every upcoming
session, the FAQs, each class and Kelly.

The JSON-LD builders are pure functions in `lib/seo/structured-data.ts` with 19 tests, because
malformed structured data and false prices are both visible to customers in search results. Two
properties the tests pin: `geo` is omitted entirely while coordinates are unknown, since a wrong
pin is worse than none when somebody drives to it; and `hasCredential` is omitted while Kelly's
qualifications are unsupplied, so the markup can never claim a certification she has not stated.

**A free first class cannot be card-fingerprinted.** Making the intro offer free means no Stripe
payment, so no card fingerprint is ever captured and the strongest intro-offer check in the brief
has nothing to match on. `intro_offer_block_on_card_fingerprint` is set to false rather than left
true implying a protection that does not exist. Options are written up in docs/03 question B4a.

**Packs are deliberately inactive.** The structure is confirmed (buy 5 get 1 free, buy 10 get 2
free) but both derive from the single-class price, which is not. An unpriced product must never be
purchasable, so `/pricing` shows the structure and says the price is to be confirmed.

**Venue capacity is a placeholder of 16** for both halls and marked unconfirmed. It is the one
number where guessing has physical consequences, so the timetable says so on the page.

**Cookie consent** before any analytics request, as UK PECR expects. Consent is read through
`useSyncExternalStore` rather than mirrored into state in an effect, which removes a cascading
render and means a choice made in another tab is reflected without a reload.

**A request-free Supabase client** (`lib/supabase/public.ts`) for code that runs with no HTTP
request — `generateStaticParams` and `sitemap.ts`, where `cookies()` is unavailable. It uses the
anon key, so RLS still applies in full; it is emphatically not the service-role client.

Also fixed: unit tests depended on a developer's `.env.local` and would have failed in CI. The
test environment is now pinned in `vitest.config.ts`, which also makes canonical-URL assertions
meaningful.

66 unit tests (up from 28), 58 database checks, 27 routes building.

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
