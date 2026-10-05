/**
 * DRAFT waiver text.
 *
 * ⚠️  THIS MUST BE REVIEWED AGAINST KELLY'S INSURANCE POLICY AND BY A LEGAL
 *     PROFESSIONAL BEFORE ANYBODY SIGNS IT.
 *
 * Most fitness insurers specify wording they require, and some will not pay out
 * on a claim where a different form was used. This draft is written to be
 * readable and to cover the usual ground; it is a starting point for that
 * conversation, not a substitute for it.
 *
 * It is deliberately NOT marked as the current version in the database. Kelly
 * publishes a version from the admin screen, which is the act that makes it
 * signable — so this cannot go live by accident.
 */

export const WAIVER_DRAFT_VERSION = 'DRAFT-0.2';

export const WAIVER_DRAFT_MARKDOWN = `# Participation agreement

**DRAFT — not yet reviewed. Do not publish.**

## What barre involves

Barre is a physical exercise class. It combines ballet-inspired movement, Pilates,
yoga and resistance work, usually holding a barre or a sturdy chair for balance.
It is low impact, but it is still exercise, and like any exercise it carries a
risk of injury.

## Your health

You confirm that:

- You are not aware of any medical reason why you should not take part in
  physical exercise.
- You have told us about any injury, illness, surgery, pregnancy or condition
  that might affect your participation, by completing the health questions.
- You will tell Kelly if any of that changes.
- You have spoken to your GP first if you had any doubt.

If you are pregnant or recently postnatal, please speak to Kelly before your
first class and check with your midwife or GP.

## During class

You agree to:

- Work at a level that is right for you, and stop if something hurts.
- Follow Kelly's instructions, including when she suggests an easier option.
- Tell Kelly straight away if you feel unwell or are in pain.

You take part voluntarily and at your own pace. Nobody will push you to continue
if you want to stop.

## Our responsibility

Kelly holds public liability insurance and a current first aid qualification.
We take reasonable care to run classes safely and to keep the venue in a safe
condition.

Nothing in this agreement limits our liability for death or personal injury
caused by our negligence, or for anything else that cannot be limited by law.

## Your belongings

Please do not bring valuables. We cannot accept responsibility for personal
property brought to a class.

## Photographs

We sometimes take photographs or video in class for social media. You can say no,
at any time, and it will make no difference to anything. Tell Kelly and she will
make sure you are not in them.

## Your information

How we handle your personal information, including the health questions, is set
out in our privacy policy. The health answers are only visible to Kelly.

## Agreement

By signing you confirm that you have read and understood this agreement, that
the information you have given is accurate, and that you take part voluntarily.
`;

/**
 * Questions worth putting to the insurer, carried alongside the draft so they
 * are not lost between here and that conversation.
 */
export const WAIVER_REVIEW_NOTES = [
  'Does the insurer require specific wording, or a specific form? Some will not pay out on a claim where a different form was used.',
  'Is a separate parental consent form needed if anyone under 18 attends?',
  'Does the policy require a minimum age, and should the sign-up flow enforce it?',
  'Should the photography clause be separate consent rather than part of the waiver? Bundling consent is weaker under UK GDPR.',
  'Is the first aid qualification claim accurate, and should it name the qualification?',
  'How long must signed waivers be retained? That drives the deletion policy.',
] as const;
