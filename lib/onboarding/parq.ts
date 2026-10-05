/**
 * Health questionnaire (PAR-Q style).
 *
 * ⚠️  DRAFT — to be reviewed against Kelly's insurance policy and by a legal
 *     professional. The PAR-Q+ is the recognised standard and this follows its
 *     shape, but an insurer may require their own form.
 *
 * Two design rules, both from the brief and both worth stating plainly:
 *
 * 1. A "yes" FLAGS, it never BLOCKS. Someone with high blood pressure or a
 *    recent knee operation is usually exactly who barre suits. The answer goes
 *    to Kelly so she can adapt; it does not slam a door.
 *
 * 2. This is special category data under UK GDPR, so consent is explicit and
 *    separate, and the free-text answers are visible only to Kelly. RLS
 *    enforces that, not the UI.
 */

export const PARQ_VERSION = 'DRAFT-0.2';

export type ParqQuestion = {
  id: string;
  question: string;
  /** Shown under the question when it is not obvious why we are asking. */
  help?: string;
};

export const PARQ_QUESTIONS: readonly ParqQuestion[] = [
  {
    id: 'heart_condition',
    question:
      'Has a doctor ever said you have a heart condition, or that you should only do physical activity supervised by a doctor?',
  },
  {
    id: 'chest_pain',
    question: 'Do you ever feel pain in your chest when you do physical activity?',
  },
  {
    id: 'chest_pain_at_rest',
    question: 'In the past month, have you had chest pain when you were not doing exercise?',
  },
  {
    id: 'dizziness',
    question: 'Do you lose your balance because of dizziness, or have you ever lost consciousness?',
  },
  {
    id: 'bone_or_joint',
    question: 'Do you have a bone or joint problem that could be made worse by physical activity?',
    help: 'Backs, knees, hips, shoulders and wrists all matter here — barre puts weight through all of them.',
  },
  {
    id: 'blood_pressure_medication',
    question: 'Are you currently taking medication for blood pressure or a heart condition?',
  },
  {
    id: 'recent_surgery',
    question: 'Have you had surgery in the last twelve months?',
  },
  {
    id: 'pregnant_or_postnatal',
    question: 'Are you pregnant, or have you given birth in the last twelve months?',
    help: 'Barre adapts well to both, but what is appropriate depends on you and on when — so please tell Kelly before your first class.',
  },
  {
    id: 'other_reason',
    question:
      'Is there any other reason you should not do physical activity, or anything else Kelly should know?',
  },
] as const;

export type ParqAnswers = Record<string, boolean>;

export type ParqSubmission = {
  answers: ParqAnswers;
  injuriesText?: string;
  conditionsText?: string;
  pregnancyStatus?: 'none' | 'pregnant' | 'postnatal';
  pregnancyWeeks?: number | null;
  explicitConsent: boolean;
};

export type ParqEvaluation = {
  flagged: boolean;
  /** Which question ids were answered yes. */
  flaggedQuestions: string[];
  /** A one-line summary for Kelly's register. */
  flagSummary: string | null;
  /** What the member is told after submitting. */
  memberNotice: string | null;
  /** Does this answer set need Kelly to look before the first class? */
  reviewState: 'not_required' | 'awaiting_review';
};

/** The subset where Kelly genuinely wants a word before the member starts. */
const SPEAK_TO_KELLY_FIRST = new Set([
  'heart_condition',
  'chest_pain',
  'chest_pain_at_rest',
  'dizziness',
  'pregnant_or_postnatal',
]);

const SHORT_LABELS: Record<string, string> = {
  heart_condition: 'heart condition',
  chest_pain: 'chest pain on exertion',
  chest_pain_at_rest: 'chest pain at rest',
  dizziness: 'dizziness or fainting',
  bone_or_joint: 'bone or joint problem',
  blood_pressure_medication: 'blood pressure or heart medication',
  recent_surgery: 'surgery in the last year',
  pregnant_or_postnatal: 'pregnant or postnatal',
  other_reason: 'other — see notes',
};

export function evaluateParq(submission: ParqSubmission): ParqEvaluation {
  const flaggedQuestions = PARQ_QUESTIONS.filter((q) => submission.answers[q.id] === true).map(
    (q) => q.id,
  );

  // Free text counts too. Somebody who answers no to everything but writes
  // "dodgy knee, had a replacement" has told us something that matters.
  const hasFreeText = Boolean(submission.injuriesText?.trim() || submission.conditionsText?.trim());

  const flagged = flaggedQuestions.length > 0 || hasFreeText;

  if (!flagged) {
    return {
      flagged: false,
      flaggedQuestions: [],
      flagSummary: null,
      memberNotice: null,
      reviewState: 'not_required',
    };
  }

  const labels = flaggedQuestions.map((id) => SHORT_LABELS[id] ?? id);
  if (hasFreeText && flaggedQuestions.length === 0) labels.push('notes provided');

  const urgent = flaggedQuestions.some((id) => SPEAK_TO_KELLY_FIRST.has(id));

  return {
    flagged: true,
    flaggedQuestions,
    flagSummary: labels.join(', '),
    // Never "you cannot book". The member is told what to do, and booking stays
    // open — a door that closes on a health answer is a door people lie to get
    // through, which is worse for everyone.
    memberNotice: urgent
      ? 'Thanks. Please have a quick word with Kelly before your first class, and check with your GP if you have not already. You can still book in the meantime.'
      : 'Thanks — Kelly will see this before your first class so she can adapt anything that needs it.',
    reviewState: 'awaiting_review',
  };
}

/** Answers must cover every question: a blank is not a "no". */
export function missingAnswers(answers: ParqAnswers): string[] {
  return PARQ_QUESTIONS.filter((q) => typeof answers[q.id] !== 'boolean').map((q) => q.id);
}

/** How long an answer set stays valid before the member is asked again. */
export const PARQ_VALIDITY_MONTHS = 12;

export function parqValidUntil(from: Date = new Date()): Date {
  const until = new Date(from);
  until.setMonth(until.getMonth() + PARQ_VALIDITY_MONTHS);
  return until;
}
