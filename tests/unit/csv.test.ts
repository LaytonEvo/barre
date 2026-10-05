import { describe, expect, it } from 'vitest';
import { poundsFromPence, toCsv } from '@/lib/csv';

/**
 * These files get opened in Excel by somebody who is not a developer, so the
 * failure modes are specific: a mangled pound sign, a column that will not sum,
 * or — worst — a cell that executes.
 */
describe('toCsv', () => {
  it('writes a header row and one row per record', () => {
    const csv = toCsv(
      [{ a: 1, b: 2 }],
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
    );
    const lines = csv.replace('﻿', '').trimEnd().split('\r\n');
    expect(lines).toEqual(['A,B', '1,2']);
  });

  it('starts with a UTF-8 BOM, or Excel mangles every pound sign', () => {
    expect(toCsv([{ a: '£25' }]).startsWith('﻿')).toBe(true);
  });

  it('uses CRLF line endings', () => {
    expect(toCsv([{ a: 1 }, { a: 2 }])).toContain('\r\n');
  });

  it('quotes values containing a comma', () => {
    expect(toCsv([{ a: 'Brooks, Kelly' }])).toContain('"Brooks, Kelly"');
  });

  it('doubles embedded quotes', () => {
    expect(toCsv([{ a: 'She said "hello"' }])).toContain('"She said ""hello"""');
  });

  it('quotes values containing a newline', () => {
    expect(toCsv([{ a: 'line one\nline two' }])).toContain('"line one\nline two"');
  });

  it('writes an empty cell for null and undefined rather than the word', () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }]);
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
    expect(csv.trimEnd().endsWith(',,0')).toBe(true);
  });

  it('neutralises cells that a spreadsheet would treat as a formula', () => {
    // A member whose "name" is =HYPERLINK(...) would otherwise execute when
    // Kelly opens the export. The data comes from a public sign-up form, so
    // this is a real path, not a theoretical one.
    for (const dangerous of ['=1+1', '+1', '-1', '@SUM(A1)', '=cmd|/c calc']) {
      const csv = toCsv([{ a: dangerous }]);
      expect(csv, dangerous).toContain(`'${dangerous}`);
    }
  });

  it('still quotes a neutralised cell that also contains a comma', () => {
    expect(toCsv([{ a: '=1,2' }])).toContain(`"'=1,2"`);
  });

  it('leaves an ordinary negative number readable', () => {
    // Prefixed for safety, but the value is still visible and obviously a number.
    expect(toCsv([{ a: -5 }])).toContain("'-5");
  });

  it('derives columns from the first row when none are given', () => {
    expect(toCsv([{ name: 'Kelly', credits: 3 }])).toContain('name,credits');
  });

  it('produces just a header for an empty set, not a crash', () => {
    expect(toCsv([])).toBe('﻿\r\n');
  });
});

describe('poundsFromPence', () => {
  it('formats as a plain decimal a spreadsheet can sum', () => {
    expect(poundsFromPence(2500)).toBe('25.00');
    expect(poundsFromPence(417)).toBe('4.17');
    expect(poundsFromPence(0)).toBe('0.00');
  });

  it('does not include a currency symbol, which would make the column text', () => {
    expect(poundsFromPence(500)).not.toContain('£');
  });

  it('handles a negative, for a refund', () => {
    expect(poundsFromPence(-500)).toBe('-5.00');
  });
});
