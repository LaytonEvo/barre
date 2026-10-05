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
  // Listed so the number is visible and cannot be rediscovered the hard way.
  // axe found this live on /account/videos: muted body text on the mint is
  // 4.08:1. The rule is now simply that text-muted is never used on
  // bg-accent-soft — text-secondary (7.59:1) is, and reads just as quietly.
  ['ink.500 on green.200', 'muted text is barred from the mint — use ink.700 (7.59:1) there'],
]);

const PAIRS = [
  // Text on the page ground
  ['ink.900 on cream.100', '#1A1F1B', '#FAF6F0', 'body text'],
  ['ink.700 on cream.100', '#3A423B', '#FAF6F0', 'secondary text'],
  ['ink.500 on cream.100', '#626A63', '#FAF6F0', 'muted text'],
  ['ink.400 on cream.100', '#878E88', '#FAF6F0', 'disabled controls'],

  // Brand green carries headings, links and the primary action
  ['green.800 on cream.100', '#174A22', '#FAF6F0', 'display headings'],
  ['green.700 on cream.100', '#21632F', '#FAF6F0', 'links, focus ring'],
  ['white on green.700', '#FFFFFF', '#21632F', 'primary button'],
  ['white on green.800', '#FFFFFF', '#174A22', 'primary button hover'],
  ['cream.100 on green.900', '#FAF6F0', '#113217', 'inverse surface'],

  // The logo mint. Light by nature, so it is a surface and never a text colour.
  ['ink.900 on green.200 (logo mint)', '#1A1F1B', '#BBE7C4', 'brand surface text'],
  ['green.800 on green.200', '#174A22', '#BBE7C4', 'heading on brand surface'],
  // Added after axe caught a real failure on /account/videos: the muted text
  // colour is fine on cream but only reaches 4.07:1 on the mint, and this list
  // tested only ink.900 against it. A surface is not safe until every text colour
  // used on it has been checked, not just the darkest one.
  ['ink.700 on green.200', '#3A423B', '#BBE7C4', 'secondary text on brand surface'],
  ['ink.500 on green.200', '#626A63', '#BBE7C4', 'muted text on brand surface'],
  ['ink.900 on green.100', '#1A1F1B', '#D9F2DE', 'calm surface text'],

  // Warm clay accent, reserved for the booking CTA
  ['white on clay.600', '#FFFFFF', '#AE5430', 'booking CTA'],
  ['white on clay.700', '#FFFFFF', '#8F4427', 'booking CTA hover'],
  ['ink.900 on clay.200', '#1A1F1B', '#F7DED2', 'accent surface text'],

  // Status
  ['green.700 on green.100', '#21632F', '#D9F2DE', 'spaces-left badge'],
  ['warn.600 on warn.100', '#8A5A14', '#FBEBD2', 'nearly-full badge'],
  ['error.600 on error.100', '#A32C22', '#FADDDA', 'full badge'],
  ['white on error.600', '#FFFFFF', '#A32C22', 'destructive button'],
  ['info.600 on info.100', '#2B5B7A', '#DCEAF3', 'waitlist badge'],
  ['ink.700 on cream.300', '#3A423B', '#E6D9C8', 'cancelled badge'],
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
