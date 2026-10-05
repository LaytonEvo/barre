import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { buildWaiverPdf } from '@/lib/onboarding/pdf';
import { hashWaiverBody } from '@/lib/onboarding/waiver';
import { WAIVER_DRAFT_MARKDOWN } from '@/lib/onboarding/waiver-text';

/**
 * This PDF is what Kelly would hand an insurer after a claim. If it cannot be
 * produced, or is missing the evidence, that is a real-world problem rather
 * than a bug — so it gets generated for real and read back.
 */

/**
 * Pull the readable text out of a PDF.
 *
 * Two layers get in the way of simply searching the bytes, and both would make
 * a "the hash is in the document" assertion silently vacuous:
 *
 *   1. pdf-lib Flate-compresses its content streams.
 *   2. Inside them, text is written as hex strings — <4261727265> rather than
 *      (Barre) — so even decompressed it does not read as words.
 *
 * Inflating and then decoding the hex gives what a person opening the file
 * would actually see.
 */
function pdfText(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  const out: string[] = [];
  let index = 0;

  for (;;) {
    const start = buffer.indexOf('stream', index);
    if (start === -1) break;
    const end = buffer.indexOf('endstream', start);
    if (end === -1) break;

    // Skip the EOL that must follow the `stream` keyword.
    let from = start + 'stream'.length;
    if (buffer[from] === 0x0d) from += 1;
    if (buffer[from] === 0x0a) from += 1;

    try {
      const content = inflateSync(buffer.subarray(from, end)).toString('latin1');
      // Decode the hex-string text-showing operators.
      for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        const hex = match[1]!;
        out.push(Buffer.from(hex, 'hex').toString('latin1'));
      }
    } catch {
      // Not a Flate stream (an embedded image, say). Nothing to read.
    }
    // Past the whole `endstream` keyword, not just one byte: `endstream`
    // itself contains `stream`, so advancing by one made the next search match
    // inside it and silently skip every other stream.
    index = end + 'endstream'.length;
  }

  // Joined with spaces: each Tj is its own laid-out line, and the test should
  // not depend on where the wrapper happened to break a sentence.
  return out.join(' ');
}

/** A small valid PNG, so the embed is exercised rather than mocked. */
async function signaturePng(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  void doc;
  // 1x1 transparent PNG, base64.
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

const baseInput = async () => ({
  memberName: 'Test Member',
  memberEmail: 'member@example.test',
  typedName: 'Test Member',
  signaturePng: await signaturePng(),
  signedAt: new Date('2026-10-05T18:30:00Z'),
  ipAddress: '203.0.113.4',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  versionLabel: 'DRAFT-0.2',
  bodyMarkdown: WAIVER_DRAFT_MARKDOWN,
  bodySha256: hashWaiverBody(WAIVER_DRAFT_MARKDOWN),
});

describe('buildWaiverPdf', () => {
  it('produces a real, parseable PDF', async () => {
    const bytes = await buildWaiverPdf(await baseInput());
    expect(bytes.length).toBeGreaterThan(1000);
    // %PDF- magic number.
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('spills onto more than one page rather than clipping a long waiver', async () => {
    const input = await baseInput();
    const long = { ...input, bodyMarkdown: `${WAIVER_DRAFT_MARKDOWN}\n`.repeat(6) };
    const reloaded = await PDFDocument.load(await buildWaiverPdf(long));
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
  });

  it('records the identity of the document in its metadata', async () => {
    const reloaded = await PDFDocument.load(await buildWaiverPdf(await baseInput()));
    expect(reloaded.getTitle()).toContain('Test Member');
    expect(reloaded.getSubject()).toContain('DRAFT-0.2');
  });

  it('survives a missing IP and user agent', async () => {
    // Behind some proxies there is no forwarded address. A waiver that cannot
    // be produced because of that would be worse than one with a gap in it.
    const input = { ...(await baseInput()), ipAddress: null, userAgent: null };
    const bytes = await buildWaiverPdf(input);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('still names the member when the IP and browser are missing', async () => {
    const input = { ...(await baseInput()), ipAddress: null, userAgent: null };
    const text = pdfText(await buildWaiverPdf(input));
    expect(text).toContain('Test Member');
    expect(text).toContain('not recorded');
  });

  it('embeds the content hash, which is what proves the wording', async () => {
    const input = await baseInput();
    const text = pdfText(await buildWaiverPdf(input));
    // Written in two halves so it can be read aloud; check both are present.
    expect(text).toContain(input.bodySha256.slice(0, 32));
    expect(text).toContain(input.bodySha256.slice(32));
  });

  it('carries the evidence an insurer would ask for', async () => {
    const input = await baseInput();
    const text = pdfText(await buildWaiverPdf(input));

    expect(text, 'the typed name').toContain('Test Member');
    expect(text, 'the account email').toContain('member@example.test');
    expect(text, 'when it was signed').toContain('2026-10-05T18:30:00');
    expect(text, 'the IP address').toContain('203.0.113.4');
    expect(text, 'the waiver version').toContain('DRAFT-0.2');
    expect(text, 'the browser used').toContain('iPhone');
  });

  it('includes the agreement text itself, not just a reference to it', async () => {
    const text = pdfText(await buildWaiverPdf(await baseInput()));
    expect(text).toContain('Participation agreement');
    // Short enough not to straddle a line break from the wrapper.
    expect(text).toContain('voluntarily');
  });
});
