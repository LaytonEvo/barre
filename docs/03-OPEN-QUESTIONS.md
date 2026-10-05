# Open questions and missing inputs

**Section 0 of the brief is entirely unfilled and `/brand` was empty.** Per your working rule
("never invent business facts"), I have invented nothing — no venue, price, class time,
qualification or review appears anywhere in this repo.

Questions are grouped by when they actually block me, so you can answer the top section now
and the rest later.

---

## A. Blocks M2 (public site) — mostly answered 2026-10-05

| #      | Input                                       | Status                                                                                                                                                                                                       |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~A1~~ | Town                                        | **Ringwood**, with St Leonards and St Ives as the villages the venues sit in. Stored in `settings.primary_town`.                                                                                             |
| A2     | Kelly's surname and how she wants crediting | Still needed — `/about` and the `Person` structured data are short without it.                                                                                                                               |
| ~~A3~~ | Venues                                      | **St Leonards & St Ives Village Hall**, Braeside Road, St Leonards, Ringwood BH24 2PH. **St Ives Primary School**, Sandy Lane, Ringwood BH24 2LE. Postcodes verified against each venue's own public record. |
| ~~A4~~ | Timetable                                   | Mon 18:30 and 19:30 at the village hall; Thu 19:15 at the school. All 55 minutes.                                                                                                                            |
| ~~A5~~ | Class types                                 | One 55-minute class, stored as "Barre". If Kelly runs distinct formats, each becomes a row and its own page.                                                                                                 |
| A6     | Contact email, phone, Instagram, domain     | Still needed. The footer and `/contact` hide these rows rather than printing placeholders.                                                                                                                   |
| A7     | Kelly's qualifications, exact wording       | Still needed. Never inferred — `buildInstructor` omits `hasCredential` entirely while the list is empty, and a test pins that.                                                                               |
| A8     | Brand assets into `/brand`                  | Still needed. Photo slots render honest empty states; no stock photography.                                                                                                                                  |
| A9     | Google Business Profile and reviews         | Still needed. The homepage renders an empty reviews state.                                                                                                                                                   |

### ~~Venue capacity~~ — set to 25 (2026-10-05)

Layton set both halls to **25 for now**. Changeable in three places, by design:

| Where                         | Effect                                            |
| ----------------------------- | ------------------------------------------------- |
| `venues.default_capacity`     | The suggestion when adding a new weekly slot      |
| `schedule_templates.capacity` | Applies to sessions generated from now on         |
| `class_sessions.capacity`     | One specific class, e.g. a smaller room that week |

Editing a template does **not** retro-fit sessions that already exist. The migration updated
future sessions explicitly, and the admin schedule screen at M6 will ask whether a change should
apply to already-generated classes. Past sessions are never touched — a class's capacity is part
of its record, being what the register was measured against.

Still worth Kelly confirming what each hall actually holds, since 25 in a village hall doing
barre (which needs floor space per person) may be optimistic.

### New: county

Both venues share a BH24 postcode with Ringwood as the post town, but the civil parish of
St Leonards and St Ives is in Dorset. `county` is set to Dorset for the village hall and
Hampshire for the school, which is geographically right but may not be how Kelly describes the
area to locals. It affects the `addressRegion` in the structured data, so worth a glance.

## B. Blocks M4 (payments)

### B1 is now the single biggest blocker

The pack _structure_ is confirmed — buy 5 get 1 free, buy 10 get 2 free — but both derive from
the **single-class price**, which is not. Until that arrives the packs exist in the database as
`active = false` and `/pricing` shows the structure with "price to be confirmed". An unpriced
product must never be purchasable, and £0 is not a safe placeholder to let someone check out
with.

### B4a (new): a free first class cannot be card-fingerprinted

Making the first class free has a consequence worth knowing. With nothing to pay there is no
Stripe payment, so **no card fingerprint is ever captured** — the strongest intro-offer check in
the brief simply has nothing to match on. Enforcement falls back to account, email and phone,
all of which are cheap to fake with a second address.

`intro_offer_block_on_card_fingerprint` is therefore set to false, because leaving it true would
imply a protection that does not exist.

Three ways to close it, in increasing order of friction:

1. **Accept the leakage.** Kelly teaches a 16-person class and will recognise a repeat face. For
   a business this size, the honour system plus her own memory may genuinely be enough.
2. **Capture a card without charging it.** Stripe can save a card for £0 via a setup intent. This
   gives a fingerprint to deduplicate against and makes later booking one tap, at the cost of
   asking for card details for a free class — which will put some people off.
3. **Verify the phone number.** Costs a few pence per SMS and adds a step, but makes a duplicate
   account meaningfully harder than a second email address.

My recommendation is (1) for now and revisit if it is ever actually abused. Worth your call.

| #   | Decision / question                                                                                                                                                                             | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| B1  | **Pricing**: drop-in, intro offer (and is it "first class £X" or "X days unlimited"?), pack sizes + prices + expiry days, membership tiers (name, monthly price, credits), on-demand-only price |
| B2  | **Is Kelly VAT-registered?** If not, I build the inc-VAT toggle but leave it off                                                                                                                |
| B3  | **Stripe account** — existing or new? I'll need test keys to build against, live keys only at M9                                                                                                |
| B4  | **Intro-offer strictness.** Card-fingerprint blocking is the strongest check but it can catch a genuine second person sharing a household card. Block, or flag for Kelly to review?             |
| B5  | Do **pack holders** get video library access, and if so how much? (Section 9 says configurable — what's the default?)                                                                           |

## C. Blocks M5 (booking rules)

| #   | Decision / question                                                                                   | Status |
| --- | ----------------------------------------------------------------------------------------------------- | ------ |
| C1  | **Cancellation window** in hours                                                                      |
| C2  | **Late-cancel penalty**: credit forfeited, and/or a £ fee for members?                                |
| C3  | **No-show penalty** — same as late cancel, or different?                                              |
| C4  | **Booking window** — how far ahead classes open (days)                                                |
| C5  | **Waitlist cutoff** — stop auto-promoting how many hours before class?                                |
| C6  | **Unlimited membership guard** — max bookings per day?                                                |
| C7  | **Membership credit rollover** — expire at period end, or roll over capped at X?                      |
| C8  | When Kelly cancels a class, drop-in payers choose refund or credit. Should the **default** be refund? |

## D. Decisions — settled at M1

Layton approved M0 without redirecting these, so D1–D3 were taken as recommended and are now
implemented. The rest still stand.

| #      | Decision / question                                                 | Status                                                                                                                                      |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~D1~~ | Design direction A or B                                             | **Settled: A, Warm Studio.** Implemented in `design/tokens.css`.                                                                            |
| ~~D2~~ | Vercel Cron vs Supabase `pg_cron`                                   | **Settled: `pg_cron`.** No extra cost, and the jobs are database-centric. Vercel Hobby only fires daily, which cannot do a 2-hour reminder. |
| ~~D3~~ | Plausible vs GA4                                                    | **Settled: Plausible.** `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is wired; the consent banner lands at M2.                                            |
| D4     | **Sentry** — free tier is fine, but confirm you want it             | Open. Recommend yes, free tier.                                                                                                             |
| D5     | **Mux costs per minute stored and streamed.** Confirm before M7.    | Open, but M7 is far enough out to revisit.                                                                                                  |
| D6     | Should `/admin` have a Layton account distinct from Kelly's?        | Open. Recommend two admin accounts, so the audit log distinguishes you.                                                                     |
| D7     | **SMS** — build the Twilio adapter at M8 behind a flag, or skip it? | Open. Recommend building it behind the flag, left off: SMS is a per-message cost Kelly may not want.                                        |

---

## E. Things Kelly must provide (not technical)

1. **Waiver text.** I'll draft something sensible, clearly marked **"DRAFT — to be reviewed
   against Kelly's insurance policy and by a legal professional"**. It must not go live
   unreviewed. Her insurer very likely has required wording.
2. **PAR-Q wording** — same caveat. The standard PAR-Q+ is a reasonable base.
3. **Privacy policy facts** — the data controller name and address, and retention periods she's
   comfortable with. I'll draft the structure and processor list.
4. **ICO registration.** ⚠️ Kelly is processing health data (special category) and will almost
   certainly need to pay the ICO data protection fee (£52/yr for most small businesses, and
   there are criminal penalties for not registering when required). **Please have her check
   this — it's the compliance item most likely to be missed.**
5. **Photos and a headshot.** The single biggest visual-quality lever on the whole site.
6. **Tone notes** — favourite phrases she uses in posts, and colours she dislikes.

---

## F. Two things in the brief I'd push back on slightly

1. **Automatic no-show marking 30 minutes after class start** (§6.3). If this carries a
   financial penalty, an automated mark will occasionally punish someone Kelly simply forgot
   to check in — and the member has no way to prove otherwise. I'd suggest the auto-mark
   creates a _pending_ no-show that Kelly confirms from the Today view, with the penalty
   applying on confirmation. Still zero routine admin (one tap, or it auto-confirms after
   48h), but a mistake is recoverable. Happy to build it as specified if you'd rather.
2. **Google review request after the 3rd attended class** (§11). Fine, but worth knowing
   Google's policy prohibits _incentivised_ or gated review requests. A plain "we'd love a
   review" email is compliant; anything offering a credit for one is not. I'll keep it plain.

---

## G. What I have NOT done, deliberately

- Not written any application code (M0 is plan-and-design; you approve before M1).
- Not invented a town, venue, price, class time, qualification, review or member count.
- Not added stock photography.
- Not installed any dependency or created `package.json` — that's M1's first commit.
