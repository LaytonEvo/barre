# Barre By Kelly

Website and members' platform for Barre By Kelly, a UK barre fitness business.

> **Status: M0 — plan and design only. No application code yet.**
> Awaiting Layton's approval before M1 (Foundations) begins.

## What's here

| Path | What it is |
|---|---|
| `docs/00-PLAN.md` | Build plan, stack, milestone order, the three hard parts |
| `docs/01-DATA-MODEL.md` | ERD, every table, invariants, RLS sketch |
| `docs/02-DESIGN-DIRECTION.md` | Palette rationale, type pairing, verified contrast, mobile-first decisions |
| `docs/03-OPEN-QUESTIONS.md` | **Read this one** — missing inputs, grouped by what they block |
| `design/tokens.css` | Design tokens (primitives → semantic) |
| `design/tokens.json` | Same primitives, machine-readable for the Tailwind theme at M1 |
| `design/styleguide.html` | One-page style guide. Becomes the `/styleguide` route at M1 |
| `design/contrast-check.mjs` | Verifies every colour pair against WCAG 2.2 |
| `brand/` | Empty — waiting on Kelly's assets, see `brand/README.md` |

## Checking the contrast figures

```bash
node design/contrast-check.mjs
```

Prints every foreground/background pair with its measured ratio and AA/AAA verdict. One pair
(`--text-disabled`) fails by design; see `docs/02-DESIGN-DIRECTION.md`.

## Coming at M1

`package.json`, `.env.example`, Supabase migrations, seed script, CI, and the setup
instructions that belong in this README (local dev, Stripe CLI webhook testing, deploy).
