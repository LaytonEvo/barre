# Open questions and missing inputs

**Section 0 of the brief is entirely unfilled and `/brand` was empty.** Per your working rule
("never invent business facts"), I have invented nothing — no venue, price, class time,
qualification or review appears anywhere in this repo.

Questions are grouped by when they actually block me, so you can answer the top section now
and the rest later.

---

## A. Blocks M2 (public site) — I need these before any page has real content

| #   | Decision / question                                                                                                 | Status                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Which town / area?**                                                                                              | Every local-SEO decision depends on it: page titles, `LocalBusiness` JSON-LD, "barre classes [town]" targeting, the map embeds. This is the single highest-value missing input — without it M2's SEO work is guesswork. |
| A2  | **Kelly's surname**, and how she wants to be credited                                                               | `/about`, `Person` JSON-LD, email signatures                                                                                                                                                                            |
| A3  | **Venues** — name, full address + postcode, parking, access notes (entrance, changing, toilets), capacity, for each | `/locations/[slug]` pages are one per venue and are a main local-SEO asset. Capacity also drives the booking engine.                                                                                                    |
| A4  | **Timetable** — day, time, duration, class type, venue for each of the 3 classes                                    | Becomes `schedule_templates`; the live timetable can't render without it                                                                                                                                                |
| A5  | **Class types** — how many distinct ones, and names                                                                 | `/classes/[slug]` pages                                                                                                                                                                                                 |
| A6  | **Contact email, phone, Instagram handle, domain**                                                                  | Footer, contact page, email `from:` address, DNS setup                                                                                                                                                                  |
| A7  | **Kelly's qualifications** (exact wording)                                                                          | `/about`. I won't paraphrase or guess a certification — stating a qualification someone doesn't hold is a real problem, not a copy nit.                                                                                 |
| A8  | **Brand assets** into `/brand` — see `brand/README.md` for the shopping list                                        | Palette is currently a fallback, not Kelly's. Photos replace placeholder blocks.                                                                                                                                        |
| A9  | **Google Business Profile** — does it exist, and are there reviews?                                                 | `/` renders an empty reviews state until real ones exist. I will not write testimonials.                                                                                                                                |

## B. Blocks M4 (payments)

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
