import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMAIL_COLORS } from '@/lib/email/brand';

/**
 * Email clients have no CSS custom properties, so lib/email/brand.ts holds literal
 * copies of the design tokens. Copies drift. This reads the real stylesheet and
 * asserts each one still matches, so a palette change that forgets the emails
 * fails here rather than shipping an email in last season's green.
 */
const tokens = readFileSync(new URL('../../design/tokens.css', import.meta.url), 'utf8');

function token(name: string): string {
  const match = tokens.match(new RegExp(`--c-${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  const value = match?.[1];
  if (!value) throw new Error(`Token --c-${name} not found in design/tokens.css`);
  return value.toLowerCase();
}

describe('email colours mirror the design tokens', () => {
  const pairs: [keyof typeof EMAIL_COLORS, string][] = [
    ['background', 'cream-100'],
    ['surface', 'white'],
    ['border', 'cream-300'],
    ['text', 'ink-900'],
    ['muted', 'ink-500'],
    ['heading', 'green-800'],
    ['primary', 'green-700'],
    ['accent', 'clay-600'],
    ['mint', 'green-200'],
  ];

  for (const [key, name] of pairs) {
    it(`${key} matches --c-${name}`, () => {
      expect(EMAIL_COLORS[key].toLowerCase()).toBe(token(name));
    });
  }

  it('keeps Kelly’s logo mint exactly as she supplied it', () => {
    // The brand colour. If this ever changes, it was a mistake.
    expect(EMAIL_COLORS.mint.toLowerCase()).toBe('#bbe7c4');
  });
});
