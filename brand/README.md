# /brand — Kelly's assets

**Supplied 2026-10-05, logo re-exported 2026-10-06.** `logo.png` plus 14 photographs, originals kept in `photos/`.

The 2026-10-06 export is the same artwork — a pixel diff against the original is
flat, with a maximum difference of 3/255, which is resampling noise — but at
2000px and, for the first time, with a genuine alpha channel. The first export
was RGB with no transparency, so everything derived from it carried an opaque
white plate: a white square behind the mark on the cream header, and a white
letterbox across the dark-green favicon with the mark clipped top and bottom.
Both are fixed by the re-export rather than by anything in the CSS.

| File                    | Used for                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `logo.png`              | 2000×2000 PNG with a real alpha channel. The mark is a soft mint, **#BBE7C4**, hue 132° — the whole palette derives from it. Header, favicon. |
| `photos/*-original.jpg` | Untouched originals. The web copies live in `public/images/`, EXIF stripped and capped at 1600px.                                             |

## What the photos cover

- **Outdoor lifestyle** (9 images) — Kelly in fields, by water, in woodland. Warm dry grass and low sun, which is why the palette keeps warm creams rather than cool greys.
- **Studio at a barre** (4 images) — the clearest "this is what it actually is" pictures. Two are black and white.
- **A real class** (1 image) — several people working at the barre together. Rare and valuable; it does more to answer "what is it like" than any amount of copy.

## Still needed

- **Photographs of the two village halls.** Nothing in the set shows either venue — the studio shots are a dance studio with a proper ballet barre, not St Leonards or St Ives. The venue pages keep an honest empty state until there is something real to show.
- **A vector logo** (`.svg`), if the original designer has one. The PNG is high enough resolution for the web, but a vector makes print and very large displays cleaner.
- **A monogram-only lockup.** The full circle is a horseshoe of letterforms around `BBK`, and below roughly 48px the ring reads as texture rather than words. The header already compensates by setting the name as live text beside the mark, and the favicon is legible enough as a shape, but a `BBK`-only variant would be the honest answer for small sizes.

## If the logo is ever redrawn

The palette is derived, not hand-picked: `design/tokens.css` keeps `#BBE7C4` unmodified as `green-200` and builds the rest of the scale at the same hue. Changing the brand colour means changing the primitives in that one file and re-running `npm run check:contrast`. No component holds a hex value.

**One thing to know about the mint:** at 1.37:1 against white it cannot carry text or act as a button — it fails every accessibility threshold by a wide margin. It is used as a _surface_ (large blocks with dark text on it), and darker steps of the same hue carry headings, links and buttons. That is a deliberate choice, not a dilution of the brand.
