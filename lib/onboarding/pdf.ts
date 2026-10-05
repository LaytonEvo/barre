import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * The signed waiver, as a PDF.
 *
 * This is the document Kelly hands to an insurer if there is ever a claim, so it
 * carries everything needed to establish what was agreed and by whom: the full
 * text, the typed name, the drawn signature, the timestamp, the IP address and
 * browser, and the version label with the SHA-256 of the exact text.
 *
 * The hash is the part that does the real work. A version label alone proves
 * nothing if the text behind it was edited; the hash lets anyone verify years
 * later that the wording in this PDF is the wording that was agreed to.
 */

export type WaiverPdfInput = {
  memberName: string;
  memberEmail: string;
  typedName: string;
  signaturePng: Buffer | Uint8Array;
  signedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  versionLabel: string;
  bodyMarkdown: string;
  bodySha256: string;
  businessName?: string;
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;

/** Markdown is rendered as plain text — a waiver is prose, not a document format. */
function toPlainText(markdown: string): string[] {
  return markdown.split('\n').map((line) =>
    line
      .replace(/^#{1,6}\s*/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/^\s*[-*]\s+/, '• ')
      .trimEnd(),
  );
}

/** Anything that can measure its own text — pdf-lib's PDFFont satisfies this. */
type Measurable = { widthOfTextAtSize: (text: string, size: number) => number };

/** Greedy wrap to the measured width of the font actually being used. */
function wrap(text: string, font: Measurable, size: number, maxWidth: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildWaiverPdf(input: WaiverPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const ink = rgb(0.1, 0.12, 0.1);
  const muted = rgb(0.38, 0.42, 0.39);
  const brand = rgb(0.09, 0.29, 0.13);

  let page = pdf.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;
  const maxWidth = A4.width - MARGIN * 2;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
  };

  const write = (
    text: string,
    opts: { size?: number; font?: typeof body; colour?: typeof ink; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const font = opts.font ?? body;
    for (const line of wrap(text, font, size, maxWidth)) {
      newPageIfNeeded(size + 4);
      page.drawText(line, { x: MARGIN, y, size, font, color: opts.colour ?? ink });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };

  // --- Header ---------------------------------------------------------------
  write(input.businessName ?? 'Barre By Kelly', { size: 18, font: bold, colour: brand });
  write(`Participation agreement — ${input.versionLabel}`, { size: 11, colour: muted, gap: 14 });

  // --- The agreement text ---------------------------------------------------
  for (const line of toPlainText(input.bodyMarkdown)) {
    if (line === '') {
      y -= 6;
      continue;
    }
    write(line, { size: 9.5 });
  }

  // --- Signature block ------------------------------------------------------
  y -= 18;
  newPageIfNeeded(190);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4.width - MARGIN, y },
    thickness: 0.75,
    color: muted,
  });
  y -= 22;

  write('Signed', { size: 13, font: bold, colour: brand, gap: 8 });

  const signature = await pdf.embedPng(input.signaturePng);
  // Scale to fit the box while keeping the aspect ratio: a stretched signature
  // is not the mark that was made.
  const boxWidth = 220;
  const boxHeight = 80;
  const scale = Math.min(boxWidth / signature.width, boxHeight / signature.height, 1);

  newPageIfNeeded(boxHeight + 90);
  page.drawImage(signature, {
    x: MARGIN,
    y: y - signature.height * scale,
    width: signature.width * scale,
    height: signature.height * scale,
  });
  y -= boxHeight + 10;

  page.drawLine({
    start: { x: MARGIN, y: y + 6 },
    end: { x: MARGIN + boxWidth, y: y + 6 },
    thickness: 0.5,
    color: muted,
  });
  y -= 8;

  const field = (label: string, value: string) => {
    newPageIfNeeded(14);
    page.drawText(label, { x: MARGIN, y, size: 8.5, font: bold, color: muted });
    page.drawText(value, { x: MARGIN + 110, y, size: 8.5, font: body, color: ink });
    y -= 14;
  };

  field('Name typed', input.typedName);
  field('Account', `${input.memberName} (${input.memberEmail})`);
  field('Signed at', input.signedAt.toISOString());
  field('IP address', input.ipAddress ?? 'not recorded');
  field('Version', input.versionLabel);

  y -= 6;
  newPageIfNeeded(40);
  page.drawText('Text hash (SHA-256)', { x: MARGIN, y, size: 8.5, font: bold, color: muted });
  y -= 12;
  // Monospace and split, so it can be read aloud or compared by eye.
  page.drawText(input.bodySha256.slice(0, 32), { x: MARGIN, y, size: 8, font: mono, color: ink });
  y -= 11;
  page.drawText(input.bodySha256.slice(32), { x: MARGIN, y, size: 8, font: mono, color: ink });
  y -= 18;

  if (input.userAgent) {
    for (const line of wrap(`Browser: ${input.userAgent}`, body, 7.5, maxWidth)) {
      newPageIfNeeded(11);
      page.drawText(line, { x: MARGIN, y, size: 7.5, font: body, color: muted });
      y -= 10;
    }
  }

  pdf.setTitle(`Participation agreement — ${input.typedName}`);
  pdf.setSubject(`Barre By Kelly waiver ${input.versionLabel}`);
  pdf.setCreationDate(input.signedAt);

  return pdf.save();
}
