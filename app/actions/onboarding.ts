'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { validateSignature, waiverTextIsIntact } from '@/lib/onboarding/waiver';
import { buildWaiverPdf } from '@/lib/onboarding/pdf';
import {
  PARQ_QUESTIONS,
  PARQ_VERSION,
  evaluateParq,
  missingAnswers,
  parqValidUntil,
} from '@/lib/onboarding/parq';

/**
 * Onboarding actions: the waiver and the health questions.
 *
 * Both run as the member, so RLS applies: `waiver_signatures` and
 * `health_questionnaires` each have an insert policy restricted to the member's
 * own id, and there is no update policy on either.
 */

export type OnboardingResult = { error: string; field?: string } | undefined;

const waiverSchema = z.object({
  versionId: z.string().uuid(),
  typedName: z.string().max(200),
  signature: z.string().max(700_000),
  agreed: z.coerce.boolean(),
});

export async function signWaiver(formData: FormData): Promise<OnboardingResult> {
  const user = await requireUser('/account/waiver');

  const parsed = waiverSchema.safeParse({
    versionId: formData.get('versionId'),
    typedName: formData.get('typedName') ?? '',
    signature: formData.get('signature') ?? '',
    agreed: formData.get('agreed') === 'on' || formData.get('agreed') === 'true',
  });

  if (!parsed.success) {
    return { error: 'Please check the form and try again.' };
  }

  const supabase = await createClient();

  const { data: version } = await supabase
    .from('waiver_versions')
    .select('id, version_label, body_markdown, body_sha256, is_current')
    .eq('id', parsed.data.versionId)
    .maybeSingle();

  if (!version) return { error: 'We could not find that waiver. Please reload the page.' };

  // Signing a superseded version would leave the member still ungated, which is
  // confusing rather than dangerous — but it means the page was stale.
  if (!version.is_current) {
    return { error: 'The waiver has been updated. Please reload the page and read it again.' };
  }

  // The text must still be the text that was published. If it has been altered
  // since, the signature would attest to something nobody agreed to — so this
  // refuses rather than recording a lie.
  if (!waiverTextIsIntact(version.body_markdown, version.body_sha256)) {
    console.error(`Waiver ${version.id} no longer matches its recorded hash.`);
    return { error: 'The waiver could not be verified. Please let Kelly know.' };
  }

  const validation = validateSignature({
    typedName: parsed.data.typedName,
    signatureDataUrl: parsed.data.signature,
    agreed: parsed.data.agreed,
  });

  if (!validation.ok) return { error: validation.message, field: validation.field };

  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ipAddress = forwarded?.split(',')[0]?.trim() ?? null;
  const userAgent = headerList.get('user-agent');
  const signedAt = new Date();

  // Paths are prefixed with the user id, which is what the storage policies
  // compare against auth.uid().
  const stamp = signedAt.toISOString().replace(/[:.]/g, '-');
  const signaturePath = `${user.id}/${version.version_label}-${stamp}.png`;
  const pdfPath = `${user.id}/${version.version_label}-${stamp}.pdf`;

  const { error: signatureUploadError } = await supabase.storage
    .from('waiver-signatures')
    .upload(signaturePath, validation.pngBytes, { contentType: 'image/png', upsert: false });

  if (signatureUploadError) {
    console.error('Signature upload failed', signatureUploadError);
    return { error: 'We could not save your signature. Please try again.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', user.id)
    .maybeSingle();

  // The signature row is written BEFORE the PDF.
  //
  // The row is the legal record; the PDF is a rendering of it. If PDF
  // generation fails, a member who has genuinely signed is still recorded as
  // having signed, and the document can be regenerated. The other order would
  // lose the signature over a formatting error.
  const { data: signature, error: insertError } = await supabase
    .from('waiver_signatures')
    .insert({
      user_id: user.id,
      waiver_version_id: version.id,
      typed_name: parsed.data.typedName.trim(),
      signature_image_path: signaturePath,
      signed_at: signedAt.toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent,
    })
    .select('id')
    .single();

  if (insertError) {
    // A unique violation means they already signed this version — not an error
    // worth showing, just send them on.
    if (insertError.code === '23505') redirect('/account/health');
    console.error('Waiver signature insert failed', insertError);
    return { error: 'We could not record your signature. Please try again.' };
  }

  try {
    const pdf = await buildWaiverPdf({
      memberName: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Member',
      memberEmail: profile?.email ?? user.email,
      typedName: parsed.data.typedName.trim(),
      signaturePng: validation.pngBytes,
      signedAt,
      ipAddress,
      userAgent,
      versionLabel: version.version_label,
      bodyMarkdown: version.body_markdown,
      bodySha256: version.body_sha256,
    });

    await supabase.storage
      .from('waiver-pdfs')
      .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: false });

    // waiver_signatures is append-only, so the PDF path cannot be added later by
    // UPDATE. It is derived from the same timestamp, so it is reconstructable —
    // and a nightly job can regenerate anything missing.
  } catch (error) {
    console.error(`Waiver PDF failed for signature ${signature.id}`, error);
    // Deliberately not surfaced: the member HAS signed, and the record stands.
  }

  revalidatePath('/account');
  redirect('/account/health');
}

const parqSchema = z.object({
  answers: z.record(z.string(), z.boolean()),
  injuriesText: z.string().max(2000).optional(),
  conditionsText: z.string().max(2000).optional(),
  pregnancyStatus: z.enum(['none', 'pregnant', 'postnatal']).optional(),
  pregnancyWeeks: z.coerce.number().int().min(0).max(60).optional(),
  explicitConsent: z.boolean(),
});

export async function submitParq(formData: FormData): Promise<OnboardingResult> {
  const user = await requireUser('/account/health');

  // Each question posts yes/no. A missing value is NOT treated as a no — a
  // blank answer to "do you have a heart condition" is not a negative.
  const answers: Record<string, boolean> = {};
  for (const question of PARQ_QUESTIONS) {
    const raw = formData.get(`q_${question.id}`);
    if (raw === 'yes') answers[question.id] = true;
    else if (raw === 'no') answers[question.id] = false;
  }

  const parsed = parqSchema.safeParse({
    answers,
    injuriesText: formData.get('injuriesText')?.toString() || undefined,
    conditionsText: formData.get('conditionsText')?.toString() || undefined,
    pregnancyStatus: formData.get('pregnancyStatus')?.toString() || undefined,
    pregnancyWeeks: formData.get('pregnancyWeeks')?.toString() || undefined,
    explicitConsent: formData.get('explicitConsent') === 'on',
  });

  if (!parsed.success) return { error: 'Please check your answers and try again.' };

  const missing = missingAnswers(parsed.data.answers);
  if (missing.length > 0) {
    return {
      error: `Please answer every question — ${missing.length} still to go.`,
      field: missing[0],
    };
  }

  // Health data is special category under UK GDPR, so consent is explicit and
  // separate from the account terms. Without it there is no lawful basis.
  if (!parsed.data.explicitConsent) {
    return {
      error: 'Please tick to confirm you are happy for Kelly to see these answers.',
      field: 'explicitConsent',
    };
  }

  const evaluation = evaluateParq({
    answers: parsed.data.answers,
    injuriesText: parsed.data.injuriesText,
    conditionsText: parsed.data.conditionsText,
    explicitConsent: true,
  });

  const supabase = await createClient();
  const { error } = await supabase.from('health_questionnaires').insert({
    user_id: user.id,
    questionnaire_version: PARQ_VERSION,
    answers: parsed.data.answers,
    flagged: evaluation.flagged,
    flag_summary: evaluation.flagSummary,
    injuries_text: parsed.data.injuriesText ?? null,
    conditions_text: parsed.data.conditionsText ?? null,
    pregnancy_status: parsed.data.pregnancyStatus ?? null,
    pregnancy_weeks: parsed.data.pregnancyWeeks ?? null,
    recent_surgery: parsed.data.answers.recent_surgery === true,
    explicit_consent_at: new Date().toISOString(),
    review_state: evaluation.reviewState,
    valid_until: parqValidUntil().toISOString(),
  });

  if (error) {
    console.error('PAR-Q insert failed', error);
    return { error: 'We could not save your answers. Please try again.' };
  }

  revalidatePath('/account');
  redirect('/account?onboarding=complete');
}
