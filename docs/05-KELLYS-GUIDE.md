# Running Barre By Kelly

Everything you need to run the business from your phone. No jargon, and nothing
here needs a computer.

Log in at **yoursite.co.uk/login**, then tap **Admin** at the top.

---

## The day of a class

### Before you leave the house

Open **Admin → Today**. It shows every class today with how many people are
booked, how many are first-timers, and whether anyone has a health note you
should know about.

### At the hall

Tap the class to open the **register**. Each person has two big buttons:

- **Here** — they turned up.
- **No show** — they didn't.

Tap as people arrive. If you tap the wrong one, tap the other; nothing is locked
in.

**You don't have to finish the register.** If you forget, anyone still unmarked
30 minutes after the class starts is marked as a _possible_ no-show, and you get
48 hours to correct it. It only becomes final if you don't.

### Things on the register

- **First class** — it's their first time. Worth a hello and a word about where
  to stand.
- **Health note** — tap it to read. It stays hidden until you tap, so you're not
  showing someone's medical details to the room.
- **Waiver not signed** — they shouldn't be in the class. Ask them to sign on
  their phone before starting; it takes a minute.

### Someone turns up who isn't booked

Use **Add a walk-in** at the bottom of the register. You'll need them to have an
account.

**If they don't have one, they need to make one there and then** — it takes under
a minute on their phone. The system won't let you create it for them, and that's
deliberate: making an account means agreeing to the waiver and answering the
health questions, and you can't honestly do that on someone else's behalf. If it
ever went wrong, a waiver you ticked for them is worth nothing to your insurer.

---

## When things change

### You need to cancel a class

**Admin → Schedule**, find the class, tap **Cancel**. You'll be asked for a
reason, and told how many people are booked.

Everyone booked is refunded automatically and emailed to tell them why. You don't
need to message anyone.

### You want to change how many people fit

Same screen, tap the number and change it. You can't set it below the number
already booked — the system will stop you rather than bump someone.

If you raise it and there's a waitlist, the next person is booked in
automatically and emailed.

### Someone needs a credit back

**Admin → Members**, search their name, then **Adjust credits**.

You have to give a reason. It's not bureaucracy: in six months, "+1, machine
double-charged her" is the difference between a clear record and a mystery.

---

## Money

### What people can buy

**Admin → Settings** controls the prices and the rules. Changing a price here
changes it everywhere — the website, the checkout, the emails.

### Gift vouchers

**Admin → Growth** lists every voucher: who it's for, whether it's been sent, and
whether it's been used. That's the screen for "did my friend get it?".

Vouchers are emailed on the date the buyer chose, not when they bought it, so a
Christmas present arrives on Christmas morning.

### Discount codes

Also **Admin → Growth**. Create a code, set either a percentage or an amount off,
and optionally a limit on how many times it can be used or a date it stops
working.

Codes are typed in at checkout. **Retire** stops one working without deleting the
record of what it did.

---

## Emails

You don't send any of these. They go out on their own:

- Booking confirmed, with a calendar invite
- Reminders, 24 hours and 2 hours before
- Cancellations, and class-cancelled-by-you
- Receipts
- "How did you get on?" after someone's first class
- "We've missed you" if someone stops coming
- A review request once someone's been a few times
- Credits about to expire

**Admin → Growth** shows whether email is working and how many are queued, sent or
failed. If the "failed" number is anything other than zero, something needs
looking at.

Marketing emails only go to people who ticked the box. That's the law, not a
preference, and the system enforces it rather than relying on anyone remembering.

---

## Videos

**Admin → Videos**. Drag a file in, or tap **Choose a file** — it uploads
straight from your phone, so a 45-minute class is fine over normal broadband.

Keep the page open until it says 100%. Then it says **Processing** for a few
minutes while it's prepared, and **Ready** when it's done.

Once it's Ready, fill in the details and tap **Publish**. You can also pick a date
to publish it later.

**You can't publish before it's Ready** — that would show members a broken video.

Say honestly what equipment a video needs. Members filter by what they've got at
home, so a video that lists a ball it doesn't need is hidden from everyone without
one.

---

## Reports

**Admin → Reports**, all downloadable as spreadsheets:

- **Attendance** — who came to what
- **Revenue** — by month and product
- **Not been for a while** — people who used to come and have stopped
- **Most watched videos** — the completion rate is the useful column. A video lots
  of people start and few finish is usually too long, not unpopular.

---

## Settings worth understanding

**Admin → Settings**. Grouped by what they affect, each explained in plain words.

Some are marked **unconfirmed** — those are values that were guessed to get the
site working. They need your eye before launch. The marker is there so a guess
can't quietly become policy.

The ones most worth your attention:

- **Cancellation window** (24 hours) — cancel before this and the credit comes
  back; after, it doesn't.
- **Class size** (25) — the default for new classes.
- **Pack expiry** — how long a bought pack lasts. This is the one members
  complain about, so it's worth picking deliberately.

---

## If something looks wrong

**A member says they didn't get an email.** Check **Admin → Growth**. If it says
"failed", the address is probably wrong. If it says "skipped", it was a marketing
email and they haven't opted in — that's correct behaviour.

**A class shows the wrong number of spaces.** Check nobody's been added by hand in
the register. If it still looks wrong, it's worth reporting.

**Someone can't book.** Nearly always one of three things: no waiver signed, health
questions not answered, or no credits. Their entry in **Admin → Members** shows all
three.

**You're locked out.** Use the "email me a link" option on the login page rather
than resetting anything.

---

## What you should never need to do

- Chase anyone for a payment — Stripe handles it
- Send a booking confirmation or reminder by hand
- Work out who's on a waitlist — it promotes automatically
- Keep a separate attendance record — the register is it
- Refund anyone manually after cancelling a class — it's automatic
