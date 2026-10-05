import { describe, expect, it } from 'vitest';
import {
  PARQ_QUESTIONS,
  evaluateParq,
  missingAnswers,
  parqValidUntil,
  type ParqAnswers,
} from '@/lib/onboarding/parq';
import { hashWaiverBody, validateSignature, waiverTextIsIntact } from '@/lib/onboarding/waiver';
import { WAIVER_DRAFT_MARKDOWN } from '@/lib/onboarding/waiver-text';

const allNo = (): ParqAnswers =>
  Object.fromEntries(PARQ_QUESTIONS.map((q) => [q.id, false])) as ParqAnswers;

describe('waiver integrity', () => {
  it('hashes the exact bytes of the text', () => {
    const hash = hashWaiverBody('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashWaiverBody('hello')).toBe(hash);
  });

  it('notices a single changed character', () => {
    // This is the point: a version label proves nothing if the text behind it
    // was edited after people signed.
    expect(hashWaiverBody('I agree')).not.toBe(hashWaiverBody('I Agree'));
  });

  it('confirms text that still matches its recorded hash', () => {
    const hash = hashWaiverBody(WAIVER_DRAFT_MARKDOWN);
    expect(waiverTextIsIntact(WAIVER_DRAFT_MARKDOWN, hash)).toBe(true);
  });

  it('rejects text that has been altered since publication', () => {
    const hash = hashWaiverBody(WAIVER_DRAFT_MARKDOWN);
    expect(waiverTextIsIntact(`${WAIVER_DRAFT_MARKDOWN}\nAnd one more thing.`, hash)).toBe(false);
  });

  it('rejects a truncated hash rather than matching a prefix', () => {
    const hash = hashWaiverBody(WAIVER_DRAFT_MARKDOWN);
    expect(waiverTextIsIntact(WAIVER_DRAFT_MARKDOWN, hash.slice(0, 32))).toBe(false);
  });
});

describe('signature validation', () => {
  /** A PNG header plus enough bytes to look like a drawn mark. */
  const png = (bytes = 2000) =>
    'data:image/png;base64,' +
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(bytes, 7),
    ]).toString('base64');

  const valid = { typedName: 'Kelly Brooks', signatureDataUrl: png(), agreed: true };

  it('accepts a signed, typed and ticked submission', () => {
    const result = validateSignature(valid);
    expect(result.ok).toBe(true);
  });

  it('requires the agreement tick', () => {
    const result = validateSignature({ ...valid, agreed: false });
    expect(result).toMatchObject({ ok: false, field: 'agreed' });
  });

  it('requires a typed name with letters in it', () => {
    expect(validateSignature({ ...valid, typedName: '' })).toMatchObject({ field: 'typedName' });
    expect(validateSignature({ ...valid, typedName: '   ' })).toMatchObject({ field: 'typedName' });
    expect(validateSignature({ ...valid, typedName: '12345' })).toMatchObject({
      field: 'typedName',
    });
  });

  it('rejects an untouched canvas', () => {
    // A blank canvas compresses to almost nothing, so size is the signal.
    expect(validateSignature({ ...valid, signatureDataUrl: png(10) })).toMatchObject({
      field: 'signature',
    });
  });

  it('rejects a file that is not actually a PNG', () => {
    // The browser sends this, so it is untrusted: a data URL claiming to be a
    // PNG could carry anything. The magic number is checked, not the label.
    const notPng = 'data:image/png;base64,' + Buffer.alloc(2000, 0x41).toString('base64');
    expect(validateSignature({ ...valid, signatureDataUrl: notPng })).toMatchObject({
      field: 'signature',
    });
  });

  it('rejects a non-image data URL', () => {
    expect(
      validateSignature({ ...valid, signatureDataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }),
    ).toMatchObject({ field: 'signature' });
  });

  it('rejects an oversized upload', () => {
    expect(validateSignature({ ...valid, signatureDataUrl: png(600 * 1024) })).toMatchObject({
      field: 'signature',
    });
  });
});

describe('PAR-Q evaluation', () => {
  it('does not flag a clean answer set', () => {
    const result = evaluateParq({ answers: allNo(), explicitConsent: true });
    expect(result.flagged).toBe(false);
    expect(result.reviewState).toBe('not_required');
    expect(result.memberNotice).toBeNull();
  });

  it('flags any yes', () => {
    const result = evaluateParq({
      answers: { ...allNo(), bone_or_joint: true },
      explicitConsent: true,
    });
    expect(result.flagged).toBe(true);
    expect(result.flaggedQuestions).toEqual(['bone_or_joint']);
    expect(result.flagSummary).toContain('bone or joint');
    expect(result.reviewState).toBe('awaiting_review');
  });

  it('NEVER blocks booking, however serious the answer', () => {
    // A door that closes on a health answer is a door people lie to get
    // through, which is worse for everyone.
    const result = evaluateParq({
      answers: { ...allNo(), heart_condition: true, chest_pain: true, dizziness: true },
      explicitConsent: true,
    });
    expect(result.memberNotice).toContain('can still book');
    expect(JSON.stringify(result)).not.toMatch(/blocked|cannot book|not allowed/i);
  });

  it('asks the member to speak to Kelly first for the serious answers', () => {
    const result = evaluateParq({
      answers: { ...allNo(), heart_condition: true },
      explicitConsent: true,
    });
    expect(result.memberNotice).toContain('word with Kelly');
    expect(result.memberNotice).toContain('GP');
  });

  it('is gentler about a flag that only needs adapting', () => {
    const result = evaluateParq({
      answers: { ...allNo(), recent_surgery: true },
      explicitConsent: true,
    });
    expect(result.memberNotice).not.toContain('GP');
    expect(result.memberNotice).toContain('adapt');
  });

  it('flags free text even when every answer is no', () => {
    // "No to everything, but my knee was replaced in March" still matters.
    const result = evaluateParq({
      answers: allNo(),
      injuriesText: 'Knee replacement in March',
      explicitConsent: true,
    });
    expect(result.flagged).toBe(true);
    expect(result.flagSummary).toContain('notes provided');
  });

  it('ignores whitespace-only free text', () => {
    const result = evaluateParq({
      answers: allNo(),
      injuriesText: '   ',
      conditionsText: '\n',
      explicitConsent: true,
    });
    expect(result.flagged).toBe(false);
  });

  it('summarises several flags for the register', () => {
    const result = evaluateParq({
      answers: { ...allNo(), bone_or_joint: true, recent_surgery: true },
      explicitConsent: true,
    });
    expect(result.flagSummary).toBe('bone or joint problem, surgery in the last year');
  });

  it('treats pregnancy as something to discuss, not to refuse', () => {
    const result = evaluateParq({
      answers: { ...allNo(), pregnant_or_postnatal: true },
      pregnancyStatus: 'pregnant',
      pregnancyWeeks: 14,
      explicitConsent: true,
    });
    expect(result.flagged).toBe(true);
    expect(result.memberNotice).toContain('word with Kelly');
    expect(result.memberNotice).toContain('can still book');
  });
});

describe('PAR-Q completeness', () => {
  it('treats an unanswered question as missing, not as a no', () => {
    const partial = { ...allNo() };
    delete partial.dizziness;
    expect(missingAnswers(partial)).toEqual(['dizziness']);
  });

  it('accepts a fully answered set', () => {
    expect(missingAnswers(allNo())).toEqual([]);
  });

  it('rejects a non-boolean answer', () => {
    const odd = { ...allNo(), dizziness: 'maybe' as unknown as boolean };
    expect(missingAnswers(odd)).toEqual(['dizziness']);
  });
});

describe('PAR-Q validity', () => {
  it('expires twelve months after completion', () => {
    const until = parqValidUntil(new Date('2026-10-05T12:00:00Z'));
    expect(until.toISOString().slice(0, 10)).toBe('2027-10-05');
  });

  it('handles a month that has no matching day without going backwards', () => {
    // 31 March + 12 months is fine, but the naive setMonth on 31 August would
    // land in a 30-day month. Check the result is always in the future.
    for (const start of ['2026-01-31', '2026-03-31', '2026-08-31', '2026-02-29']) {
      const from = new Date(`${start}T12:00:00Z`);
      expect(parqValidUntil(from).getTime()).toBeGreaterThan(from.getTime());
    }
  });
});
