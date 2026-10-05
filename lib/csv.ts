/**
 * CSV for the admin reports.
 *
 * Hand-rolled because the format is small and the edge cases are specific:
 * commas, quotes and newlines inside values all need handling, and Excel needs
 * a BOM or it mangles anything non-ASCII — which in the UK means every pound
 * sign and every name with an accent in it.
 */

export type CsvValue = string | number | boolean | null | undefined;

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);

  // A leading =, +, - or @ is interpreted as a formula by Excel and Sheets, so
  // a value like "=1+1" or a name starting with "-" becomes executable. Prefix
  // with an apostrophe to neutralise it.
  const risky = /^[=+\-@\t\r]/.test(text);
  const prepared = risky ? `'${text}` : text;

  if (/["\n\r,]/.test(prepared)) {
    return `"${prepared.replace(/"/g, '""')}"`;
  }
  return prepared;
}

export function toCsv(
  rows: Record<string, CsvValue>[],
  columns?: { key: string; label: string }[],
): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]).map((key) => ({ key, label: key })) : []);

  const lines = [
    cols.map((col) => escapeCell(col.label)).join(','),
    ...rows.map((row) => cols.map((col) => escapeCell(row[col.key])).join(',')),
  ];

  // CRLF and a UTF-8 BOM: between them, Excel opens the file correctly on both
  // Windows and macOS.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Pence to a plain decimal, for a spreadsheet to sum. */
export const poundsFromPence = (pence: number): string => (pence / 100).toFixed(2);
