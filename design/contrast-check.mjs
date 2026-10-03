#!/usr/bin/env node
/**
 * Verifies every foreground/background pair in the design system against
 * WCAG 2.2 contrast minima.
 *
 * Exits non-zero if any pair fails that is not on the explicit allowlist, so a
 * token change that quietly breaks accessibility fails CI instead of shipping.
 *
 *   node design/contrast-check.mjs
 */

const AA_TEXT = 4.5;
const AA_LARGE = 3;
const AAA_TEXT = 7;

/**
 * Pairs that are permitted to fall below AA, with the reason.
 * WCAG 2.2 exempts disabled controls from contrast requirements. Nothing is
 * added here without a reason that survives review.
 */
const ALLOWED_BELOW_AA = new Map([
  ['ink.400 on cream.100', 'disabled controls only — barred from prose by convention and review'],
]);

const PAIRS = [
  ['ink.900 on cream.100', '#1F1A1F', '#FAF4EC', 'body text'],
  ['ink.700 on cream.100', '#3D353D', '#FAF4EC', 'secondary text'],
  ['ink.500 on cream.100', '#655C64', '#FAF4EC', 'muted text'],
  ['ink.400 on cream.100', '#8B828A', '#FAF4EC', 'disabled controls'],
  ['plum.600 on cream.100', '#573351', '#FAF4EC', 'links, focus ring'],
  ['plum.700 on cream.100', '#3F2440', '#FAF4EC', 'display headings'],
  ['white on plum.600', '#FFFFFF', '#573351', 'primary button'],
  ['white on plum.500', '#FFFFFF', '#6E4360', 'primary button hover'],
  ['white on blush.600', '#FFFFFF', '#B4584A', 'booking CTA'],
  ['ink.900 on blush.200', '#1F1A1F', '#F7DAD4', 'accent surface text'],
  ['ink.900 on sage.200', '#1F1A1F', '#DCE3DA', 'calm surface text'],
  ['white on sage.600', '#FFFFFF', '#5E7360', 'sage button'],
  ['sage.700 on cream.100', '#46573F', '#FAF4EC', 'sage text on cream'],
  ['white on success.600', '#FFFFFF', '#2F6B4F', 'success badge'],
  ['success.600 on success.100', '#2F6B4F', '#DFF0E6', 'spaces-left badge'],
  ['warn.600 on warn.100', '#8A5A14', '#FBEBD2', 'nearly-full badge'],
  ['error.600 on error.100', '#A32C22', '#FADDDA', 'full badge'],
  ['white on error.600', '#FFFFFF', '#A32C22', 'destructive button'],
  ['info.600 on info.100', '#2B5B7A', '#DCEAF3', 'waitlist badge'],
  ['ink.700 on cream.300', '#3D353D', '#EADBC8', 'cancelled badge'],
];

const channels = (hex) => {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

const linearise = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const luminance = (hex) => {
  const [r, g, b] = channels(hex).map(linearise);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

const pad = (s, n) => String(s).padEnd(n);
const verdict = (ok) => (ok ? 'pass' : 'FAIL');

let unexpectedFailures = 0;
let allowedFailures = 0;

console.log(
  `${pad('pair', 28)}${pad('ratio', 8)}${pad('AA', 6)}${pad('AA-lg', 7)}${pad('AAA', 6)}use`,
);
console.log('-'.repeat(86));

for (const [name, fg, bg, use] of PAIRS) {
  const r = ratio(fg, bg);
  const passesAA = r >= AA_TEXT;
  const allowed = ALLOWED_BELOW_AA.has(name);

  if (!passesAA) {
    if (allowed) allowedFailures += 1;
    else unexpectedFailures += 1;
  }

  console.log(
    pad(name, 28) +
      pad(r.toFixed(2), 8) +
      pad(verdict(passesAA), 6) +
      pad(verdict(r >= AA_LARGE), 7) +
      pad(r >= AAA_TEXT ? 'pass' : '–', 6) +
      use,
  );
}

console.log('-'.repeat(86));

for (const [name, reason] of ALLOWED_BELOW_AA) {
  console.log(`allowed below AA: ${name} — ${reason}`);
}

if (unexpectedFailures > 0) {
  console.error(
    `\n${unexpectedFailures} pair(s) fail WCAG AA (${AA_TEXT}:1) and are not on the allowlist.\n` +
      'Darken the foreground or lighten the surface in design/tokens.css, or add an\n' +
      'entry to ALLOWED_BELOW_AA with a reason that holds up in review.',
  );
  process.exit(1);
}

console.log(
  `\nAll ${PAIRS.length - allowedFailures} in-scope pairs meet WCAG AA. ` +
    `${allowedFailures} allowlisted exception(s).`,
);
