import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Download a signed waiver PDF.
 *
 * The file lives in a private bucket, so this mints a short-lived signed URL
 * after checking the member owns the signature. RLS on `waiver_signatures` does
 * the checking: a signature id belonging to someone else simply does not come
 * back, and the response is a 404 rather than a 403 so the URL does not confirm
 * that the record exists.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: signature } = await supabase
    .from('waiver_signatures')
    .select('id, user_id, signed_at, signature_image_path, waiver_version_id')
    .eq('id', id)
    .maybeSingle();

  if (!signature) return new NextResponse('Not found', { status: 404 });

  // The PDF path mirrors the signature image path, with a different extension —
  // both are derived from the same timestamp at signing time.
  const pdfPath = signature.signature_image_path.replace(/\.png$/, '.pdf');

  const { data: signed, error } = await supabase.storage
    .from('waiver-pdfs')
    // Sixty seconds: long enough to start a download, short enough that a URL
    // pasted into a chat is useless by the time anyone reads it.
    .createSignedUrl(pdfPath, 60);

  if (error || !signed) {
    // The record exists but the PDF does not — generation can fail without
    // losing the signature itself, which is the deliberate trade in signWaiver.
    return new NextResponse(
      'That copy is not available yet. Please let Kelly know and she can send it to you.',
      { status: 404 },
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
