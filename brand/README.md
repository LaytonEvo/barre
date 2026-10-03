# /brand — assets needed

**Currently empty.** Everything in `design/` is the Section 3.2 fallback direction, not
Kelly's real brand. Drop these in and the palette gets re-derived:

| File                                 | Notes                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logo.svg` (preferred) or `logo.png` | Highest resolution available. Ask the original designer for the vector if one exists — it makes favicons, OG images and print all easier.                                                                   |
| `cover.jpg`                          | The Facebook cover photo                                                                                                                                                                                    |
| `photos/`                            | 15–30 of the best class, studio and Kelly photos. **Mix landscape and portrait** — the hero needs landscape, the mobile cards need portrait. Originals, not Facebook-compressed downloads, if she has them. |
| `kelly-headshot.jpg`                 | For `/about` and `Person` JSON-LD                                                                                                                                                                           |
| `notes.md`                           | Tone ("warm, encouraging, no judgement"), phrases she actually uses in posts, colours she likes **and dislikes**                                                                                            |

## On photo quality

Facebook recompresses uploads fairly aggressively. If Kelly has the originals on her phone
or camera roll, those are worth chasing — photography is the single biggest visual-quality
lever on the whole site, well ahead of any styling decision.

## What happens when these land

1. Palette extracted from the logo and photos, replacing the primitives in
   `design/tokens.css`. Semantic token names don't change, so no component is touched.
2. `node design/contrast-check.mjs` re-run; any pair below 4.5:1 adjusted before use.
3. Placeholder blocks replaced with real images (`next/image`, AVIF/WebP, responsive sizes).
