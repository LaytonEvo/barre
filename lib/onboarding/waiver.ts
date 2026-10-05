import { createHash } from 'node:crypto';

/**
 * Waiver integrity.
 *
 * The signature record stores a hash of the exact text agreed. Years later,
 * that is what lets anyone prove what a member actually signed — a version
 * label alone proves nothing if the text behind it was edited.
 */

/** Hash of the exact bytes of the waiver body. */
export function hashWaiverBody(markdown: string): string {
  return createHash('sha256').update(markdown, 'utf8').digest('hex');
}

/**
 * Does this text still match the hash recorded when the version was published?
 *
 * Checked at sign time. If a published version's text has been altered, the
 * member must not be asked to sign it — the record would attest to something
 * nobody agreed to.
 */
export function waiverTextIsIntact(markdown: string, recordedHash: string): boolean {
  const actual = hashWaiverBody(markdown);
  // Constant-time is unnecessary here (both values are ours, neither is secret),
  // but length-first avoids a confusing comparison against a truncated hash.
  return actual.length === recordedHash.length && actual === recordedHash;
}

export type SignatureEvidence = {
  typedName: string;
  signatureDataUrl: string;
  agreed: boolean;
};

export type SignatureValidation =
  | { ok: true; pngBytes: Buffer }
  | { ok: false; field: 'typedName' | 'signature' | 'agreed'; message: string };

/** Minimum bytes for a PNG that contains an actual drawn mark rather than a blank canvas. */
const MIN_SIGNATURE_BYTES = 800;
const MAX_SIGNATURE_BYTES = 512 * 1024;

/**
 * Validate what the member drew and typed.
 *
 * The data URL arrives from the browser, so it is treated as untrusted input:
 * the prefix is checked, the base64 is decoded here rather than passed through,
 * and the PNG magic number is verified. Uploading whatever the client sent to
 * private storage without looking would be how a "signature" becomes a script.
 */
export function validateSignature(input: SignatureEvidence): SignatureValidation {
  const name = input.typedName.trim();

  if (!input.agreed) {
    return { ok: false, field: 'agreed', message: 'Please tick to confirm you agree.' };
  }

  if (name.length < 2) {
    return { ok: false, field: 'typedName', message: 'Please type your full name.' };
  }
  if (name.length > 120) {
    return { ok: false, field: 'typedName', message: 'That name is too long.' };
  }
  // A name with no letters is not a name.
  if (!/\p{L}/u.test(name)) {
    return { ok: false, field: 'typedName', message: 'Please type your full name.' };
  }

  const prefix = 'data:image/png;base64,';
  if (!input.signatureDataUrl.startsWith(prefix)) {
    return { ok: false, field: 'signature', message: 'Please sign in the box.' };
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(input.signatureDataUrl.slice(prefix.length), 'base64');
  } catch {
    return { ok: false, field: 'signature', message: 'Please sign in the box.' };
  }

  if (bytes.length > MAX_SIGNATURE_BYTES) {
    return { ok: false, field: 'signature', message: 'That signature image is too large.' };
  }

  // PNG magic number. Anything else is not the file it claims to be.
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    return { ok: false, field: 'signature', message: 'Please sign in the box.' };
  }

  // An untouched canvas compresses to almost nothing.
  if (bytes.length < MIN_SIGNATURE_BYTES) {
    return { ok: false, field: 'signature', message: 'Please draw your signature in the box.' };
  }

  return { ok: true, pngBytes: bytes };
}
