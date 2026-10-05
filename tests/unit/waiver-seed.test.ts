import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashWaiverBody } from '@/lib/onboarding/waiver';
import {
  WAIVER_DRAFT_MARKDOWN,
  WAIVER_DRAFT_VERSION,
  WAIVER_REVIEW_NOTES,
} from '@/lib/onboarding/waiver-text';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8');

/**
 * The seed and the TypeScript source hold the same waiver text in two places.
 * If they drift, the app's integrity check rejects the seeded row and nobody
 * can sign anything — a failure that would only show up when somebody tried.
 */
describe('seeded waiver', () => {
  const seed = read('supabase/seed.sql');

  it('contains the same text as lib/onboarding/waiver-text.ts', () => {
    // Compared after normalising whitespace, since SQL dollar-quoting preserves
    // the body but the surrounding indentation differs.
    const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();
    expect(normalise(seed)).toContain(normalise(WAIVER_DRAFT_MARKDOWN));
  });

  it('seeds the version label the source declares', () => {
    expect(seed).toContain(`'${WAIVER_DRAFT_VERSION}'`);
  });

  it('computes the hash in SQL rather than hard-coding one that could go stale', () => {
    expect(seed).toContain('encode(digest(');
  });

  it('produces a stable hash', () => {
    // Pinned so an accidental edit to the waiver is visible in a diff rather
    // than silently invalidating every signature made against the old text.
    expect(hashWaiverBody(WAIVER_DRAFT_MARKDOWN)).toBe(
      '07045a16ef3f5db470316765525e03e25afe09b6484cb1b045d727399ef4e321',
    );
  });
});

describe('the draft says it is a draft', () => {
  it('is marked unreviewed on its face, where a member would see it', () => {
    // This text is going in front of people. If it ever reaches production
    // unreviewed, it should be obvious to everyone including the member.
    expect(WAIVER_DRAFT_MARKDOWN).toMatch(/DRAFT/);
    expect(WAIVER_DRAFT_MARKDOWN.toLowerCase()).toContain('not yet reviewed');
  });

  it('carries the questions for the insurer alongside it', () => {
    expect(WAIVER_REVIEW_NOTES.length).toBeGreaterThan(3);
    expect(WAIVER_REVIEW_NOTES.join(' ')).toMatch(/insurer/i);
  });

  it('does not limit liability for death or personal injury', () => {
    // Such a term is void under the Unfair Contract Terms Act 1977, and a
    // waiver that tries it invites a court to look hard at the rest.
    expect(WAIVER_DRAFT_MARKDOWN).toContain('death or personal injury');
    expect(WAIVER_DRAFT_MARKDOWN).toContain('cannot be limited by law');
  });
});
