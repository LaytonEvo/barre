# Design direction (M0 proposal)

> **Important:** `/brand` was empty when I started — no logo, no cover photo, no class
> photography, no headshot, no tone notes. So **none of this palette is extracted from
> Kelly's real brand.** This is the Section 3.2 fallback, built so it can be re-skinned
> cheaply once the assets arrive.

## How the re-skin will work

Tokens are layered: primitives (raw colour scales) → semantic tokens (`--action-primary-bg`,
`--text-heading`, `--status-full-fg`). Components only ever reference semantic tokens. When
Kelly's logo lands, I change primitive values in one file and re-run the contrast check.
No component touches hex.

---

## Direction A — "Warm Studio" (recommended)

Premium boutique, warm rather than intimidating. Cream and sand ground it, a deep plum
carries the brand and all primary actions, a terracotta-blush accent takes the booking CTAs
so they never compete with navigation, sage handles calm/informational states.

**Why plum as primary rather than blush:** blush is lovely but it's weak at small sizes and
on white — it can't carry text at AA without darkening into brick. Plum reads as considered
and slightly luxe, and it's unusual in local fitness (which defaults to black, hot pink or
teal). Blush stays where it's strongest: large surfaces and the one CTA you want thumbs to find.

| Role | Token | Hex |
|---|---|---|
| Page | `--bg-page` | `#FAF4EC` cream |
| Surface | `--bg-surface` | `#FFFFFF` |
| Body text | `--text-primary` | `#1F1A1F` ink |
| Headings | `--text-heading` | `#3F2440` plum 700 |
| Primary action | `--action-primary-bg` | `#573351` plum 600 |
| Booking CTA | `--action-accent-bg` | `#B4584A` blush 600 |
| Calm/info | `--bg-calm-soft` | `#DCE3DA` sage 200 |

**Type:** **Fraunces** (display) + **Inter** (body). Fraunces is a variable old-style serif
with a softness dial — warm and characterful without tipping into wedding-invitation
territory, and it holds up at hero sizes on a phone. Inter does the rest: it has proper
tabular figures, which matters more than it sounds for a timetable where times and
"2 spaces left" counters need to line up in columns.

**Shape:** 12px radius on cards, 8px on inputs, pill only on badges and filter chips.
Rounded but not bubbly, per the brief. Shadows are plum-tinted, never neutral grey — grey
shadows on a cream page look dirty.

---

## Direction B — "Quiet Luxe" (alternative, say the word and I'll swap it)

Cooler and more restrained: greige and off-white, near-black charcoal text, a single muted
terracotta accent, no secondary hue at all. **Cormorant Garamond** + **Figtree**. Closer to
Barry's austerity; less obviously warm. Worth considering if Kelly's logo turns out to be
monochrome or high-contrast.

Both directions use identical semantic token names, so switching is a primitives swap.

---

## Accessibility: verified, not asserted

Every foreground/background pair in the system was checked against WCAG 2.2 with a script
(`design/contrast-check.mjs`, run with `npm run check:contrast` once M1 adds package.json).
Results:

| Pair | Ratio | AA text | Use |
|---|---|---|---|
| ink 900 on cream | **15.68** | pass | body |
| ink 700 on cream | **10.83** | pass | secondary |
| ink 500 on cream | **5.88** | pass | muted |
| ink 400 on cream | 3.40 | *fail* | **disabled controls only — never meaningful copy** |
| plum 700 on cream | **12.50** | pass | display headings |
| plum 600 on cream | **9.62** | pass | links, focus ring |
| white on plum 600 | **10.51** | pass | primary button |
| white on blush 600 | **4.73** | pass | booking CTA |
| white on sage 600 | **5.13** | pass | sage button |
| white on error 600 | **7.14** | pass | destructive |
| status badges (4 soft pairs) | 5.04–5.94 | pass | open / nearly full / full / waitlist |

One pair deliberately fails: `--text-disabled`. It's scoped to disabled controls, where WCAG
exempts contrast, and it's the only token not permitted in prose. Everything a member
actually reads clears 4.5:1, and most clears 7:1 (AAA).

Also committed to:

- Focus is **restyled, never removed** — 2px plum outline with 2px offset, globally in `tokens.css`.
- `prefers-reduced-motion` collapses all durations to 1ms at the token level, so no component
  has to remember.
- Tap targets ≥ 44px (`--tap-min`); booking CTAs 48px (`--cta-height`).
- Status is never colour-only — "Full", "2 left", "Waitlist" always carry text, because the
  timetable is the most colour-coded screen in the product.
- Minimum body size 16px, which also stops iOS zooming form fields on focus.

---

## Mobile-first, meant literally

Most bookings happen on a phone, mid-conversation, one-handed. So:

- Timetable is a **list** on mobile and only becomes a grid at `md`. A squeezed week-grid on
  a 390px screen is unusable, and that's the most-visited page on the site.
- Target: **3 taps** from timetable to booked for a logged-in member with credits —
  tap class → tap Book → tap Confirm. The confirm step stays because the cancellation policy
  has to be acknowledged; it's a sheet, not a page navigation.
- Primary CTA sits in the bottom third on booking screens, inside thumb reach.
- Kelly's `/admin` register is designed at 390px first, not as a shrunken desktop table —
  she'll use it standing up in a village hall with a phone in one hand.

---

## Photography

Nothing here depends on stock imagery and I won't add any. Until Kelly's photos arrive, the
styleguide and any built pages use flat token-coloured blocks at the correct aspect ratios as
obvious placeholders. **I'd rather ship visible grey boxes than stock photos of someone
else's studio** — the brief rules them out and they're the fastest way to make a local
business look generic.

When photos land: `next/image`, AVIF/WebP, responsive `sizes`, LCP hero preloaded, explicit
dimensions to avoid layout shift.

## Tone of voice

Warm, encouraging, inclusive, confident, never preachy. British English (`-ise`, "timetable",
"£"). "All levels, all bodies." Written for someone who is slightly nervous about walking
into their first class.

Copy I will *not* write without you: anything claiming a qualification, a result, a review,
or a number of members. See the open questions.
