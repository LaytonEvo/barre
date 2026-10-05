# Launch checklist

Everything that has to be true before the site takes a real booking from a real
person. Ordered so the blocking items come first.

Nothing here is guesswork about what the code does — each item says what breaks if
it is skipped, and where to see it.

---

## 1. Blocking — the site does not work without these

### 1.1 Email (Resend)

**Without this nothing is emailed at all, including booking confirmations.** A
member books, hears nothing, assumes it failed, and emails Kelly. That is exactly
the manual admin the whole project exists to remove.

- [ ] Create a Resend account. The free tier (3,000/month, 100/day) is far more
      than this business will send.
- [ ] Add and verify the sending domain. This is the SPF/DKIM/DMARC work in §2 —
      do it once, here.
- [ ] Set `RESEND_API_KEY` and `EMAIL_FROM` (e.g.
      `Barre By Kelly <hello@barrebykelly.co.uk>`).
- [ ] Check `/admin/growth` — it says plainly whether email is configured, and
      shows how many notifications are queued, sent, failed or skipped.

`EMAIL_FROM` must be on the verified domain. A guessed sender fails SPF and lands
every email in spam — silently, and permanently, because reputation is slow to
recover.

### 1.2 Unsubscribe link signing

- [ ] Set `EMAIL_LINK_SECRET` to a long random string: `openssl rand -hex 32`.

Without it, win-backs and review requests are **skipped**, not sent badly: a
marketing email needs a working opt-out under PECR, so a missing secret has to
mean no marketing rather than marketing with a dead link. Transactional email is
unaffected. The skipped rows carry the reason.

### 1.3 The waiver and PAR-Q

**The single biggest launch blocker, and the only one that needs somebody other
than Kelly.**

- [ ] A legal professional and the insurer review the drafted wording. The
      questions for them are in `lib/onboarding/waiver-text.ts`
      (`WAIVER_REVIEW_NOTES`).
- [ ] Kelly publishes it from `/admin/content`. The publisher will not run without
      an explicit tick confirming that review has happened.

Until it is published, nobody can book: the waiver gate is enforced in the
database, not in the UI.

### 1.4 Stripe live mode

See §3. Until it is done, no money can be taken.

### 1.5 Scheduled jobs

- [ ] Set `CRON_SECRET` and schedule the six endpoints listed in the README
      (`### Scheduled jobs`).

`send-email` is the one that matters most: it is the only thing that sends
anything. Without it the queue grows and no member hears from the system.

---

## 1.6 Staging, and keeping it private

The site is being built as a surprise, so staging is closed by default:

- `NEXT_PUBLIC_SITE_ENV` defaults to `staging` when unset. On anything but
  `production` the site serves `Disallow: /`, a `noindex` meta tag and an empty
  sitemap. Both the robots file and the meta tag are needed: robots.txt asks a
  crawler not to fetch, the meta tag is what keeps a page out of the index when
  somebody links to it.
- `STAGING_PASSWORD` puts the whole site behind a browser password prompt. Any
  username works. `/api/*` stays open, because webhooks and cron authenticate
  themselves and cannot type a password.

Both are read at **run time**, so one build can serve either environment — the
`robots.txt` and `sitemap.xml` routes are deliberately dynamic for that reason.
A statically generated version froze to whatever the build knew, which would have
meant a staging artifact promoted to production kept serving `Disallow: /`
without anything looking wrong.

**At launch**: set `NEXT_PUBLIC_SITE_ENV=production` and clear `STAGING_PASSWORD`.
Check `https://<domain>/robots.txt` says `Allow: /` afterwards — that one line is
the difference between being found and not.

---

## 2. Domain, DNS and email authentication

Do this once, with Resend, and it covers both deliverability and §1.1.

- [ ] Point the domain at Vercel (A/CNAME as Vercel instructs).
- [ ] **SPF** — a TXT record on the sending domain authorising Resend. Resend
      gives the exact value; do not hand-write it.
- [ ] **DKIM** — the CNAME records Resend provides. This is what actually signs
      the mail; SPF alone is weak.
- [ ] **DMARC** — a TXT record at `_dmarc.<domain>`. Start at
      `v=DMARC1; p=none; rua=mailto:<an address Kelly reads>;` for the first
      couple of weeks, read the reports, then move to `p=quarantine` and
      eventually `p=reject`.

Starting at `p=reject` is the common mistake: if anything is misconfigured, every
email silently disappears and you find out from a member who never got a
confirmation.

- [ ] Confirm `NEXT_PUBLIC_SITE_URL` is the real domain. It is used in every email
      link, the sitemap and the structured data — a stale value sends members to
      the wrong place from inside their inbox.
- [ ] Google Business Profile: get the "write a review" short link and paste it
      into `/admin/settings` as `google_review_url`. Review requests queue nothing
      until it is set.

### Redirects

There is one so far — `/gift-vouchers` → `/gift`, kept because the old URL was
live long enough to be indexed. If Kelly has an existing site with pages people
link to, list those URLs and they become redirects too. Without them, every
inbound link and every bit of accumulated search ranking lands on a 404.

---

## 3. Stripe live mode

Test mode and live mode share nothing: not products, not prices, not webhook
secrets, not promo codes.

- [ ] Complete Stripe's account activation (business details, bank account).
- [ ] Switch the dashboard to **live** and create a fresh restricted API key.
- [ ] Set `STRIPE_SECRET_KEY` to the live key in Vercel **production only**.
      Preview deployments should keep test keys, or a preview build will take real
      money.
- [ ] Run `npm run stripe:sync` against production to create the live products and
      prices. Prices are immutable in Stripe: changing one means creating a new
      price, which the sync handles.
- [ ] Create the live webhook endpoint at `https://<domain>/api/stripe/webhook`,
      subscribed to: `checkout.session.completed`, `invoice.paid`,
      `invoice.payment_failed`, `customer.subscription.created`,
      `customer.subscription.updated`, `customer.subscription.deleted`,
      `charge.refunded`.
- [ ] Set `STRIPE_WEBHOOK_SECRET` to the **live** endpoint's signing secret. The
      test-mode secret will reject every live event, and the symptom is that money
      is taken and nothing is fulfilled.
- [ ] Confirm the Customer Portal is configured in live mode (cancellation,
      payment-method updates), or `/account/billing` sends members to a dead page.
- [ ] Take one real payment with a real card, then refund it. The purchase should
      appear in `/admin/members`, and the credits on the member's account.

**Fulfilment happens only in the webhook.** A successful redirect back to the site
grants nothing — deliberately, since a return URL can be forged. So a broken
webhook presents as "I paid and got nothing", and testing one real payment is the
only way to know it works.

---

## 4. Security review

Run the audit:

```bash
npm run audit:security
```

It checks, against the live database:

- RLS is enabled on every table in `public`;
- every table either has a policy or is deliberately service-role-only (and the
  list of those is named, not counted);
- every `SECURITY DEFINER` function pins `search_path`;
- no `SECURITY DEFINER` function is executable by `anon`;
- every view's security mode is the intended one.

That last check exists because of a real bug: `session_availability` was
`security_invoker = true`, so it counted bookings under the caller's own RLS and
reported every class as empty however full it was.

Also by hand before launch:

- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is set only in Vercel's server
      environment, never as `NEXT_PUBLIC_*`.
- [ ] Confirm the two public write paths (contact form, newsletter) are rate
      limited — `/admin/settings` shows the limits.
- [ ] Rotate any key that has been pasted into a chat, a ticket or an email.

---

## 5. Data protection

- [ ] **ICO registration.** Kelly processes health data (special category) and
      will almost certainly need to pay the data protection fee. There are
      criminal penalties for not registering when required. This is the compliance
      item most likely to be missed.
- [ ] Privacy policy completed with the real controller name and address, and
      retention periods Kelly is comfortable with.
- [ ] Confirm the retention period for signed waivers with the insurer — it drives
      what erasure keeps and what it deletes.

---

## 6. Before the first real class

- [ ] Kelly has an admin account, and has read `docs/05-KELLYS-GUIDE.md`.
- [ ] The nine unconfirmed settings have been reviewed (`/admin/settings` marks
      them).
- [ ] A test booking has been made and cancelled end to end, by a real person on a
      real phone, with a real email arriving.
- [ ] Venue photographs added — the "Where we are" cards are text-only, and "what
      does the hall look like" is a real question for a first-timer.
