'use client';

import { useActionState, useState } from 'react';
import { submitParq, type OnboardingResult } from '@/app/actions/onboarding';
import type { ParqQuestion } from '@/lib/onboarding/parq';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function run(_previous: OnboardingResult, formData: FormData): Promise<OnboardingResult> {
  return submitParq(formData);
}

/**
 * Radio buttons, not checkboxes.
 *
 * A checkbox left unticked is ambiguous — it could mean "no" or "I did not
 * read this". A pair of radios makes the member answer, and the server treats a
 * missing value as missing rather than as a no.
 */
function YesNo({ question, invalid }: { question: ParqQuestion; invalid: boolean }) {
  return (
    <fieldset
      className={`border-subtle grid gap-2 border-b pb-4 ${invalid ? 'border-action-destructive' : ''}`}
    >
      <legend className="text-primary text-sm font-medium">{question.question}</legend>
      {question.help ? <p className="text-muted text-sm">{question.help}</p> : null}

      <div className="mt-1 flex gap-4">
        {(['no', 'yes'] as const).map((value) => (
          <label key={value} className="text-secondary flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`q_${question.id}`}
              value={value}
              required
              className="accent-action-primary size-4"
            />
            <span className="capitalize">{value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ParqForm({ questions }: { questions: readonly ParqQuestion[] }) {
  const [state, submit, pending] = useActionState(run, undefined);
  const [pregnancy, setPregnancy] = useState('none');

  return (
    <form action={submit} className="mt-8 grid gap-5">
      {questions.map((question) => (
        <YesNo key={question.id} question={question} invalid={state?.field === question.id} />
      ))}

      <div className="grid gap-1.5">
        <Label htmlFor="injuriesText">Any injuries Kelly should know about?</Label>
        <textarea
          id="injuriesText"
          name="injuriesText"
          rows={3}
          maxLength={2000}
          placeholder="Old or current — backs, knees, shoulders, wrists."
          className="border-strong bg-surface text-primary placeholder:text-muted focus-visible:outline-focus w-full rounded-md border px-3 py-2 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="conditionsText">
          Anything else — conditions, medication, recent illness?
        </Label>
        <textarea
          id="conditionsText"
          name="conditionsText"
          rows={3}
          maxLength={2000}
          className="border-strong bg-surface text-primary placeholder:text-muted focus-visible:outline-focus w-full rounded-md border px-3 py-2 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="pregnancyStatus">Pregnancy</Label>
        <select
          id="pregnancyStatus"
          name="pregnancyStatus"
          value={pregnancy}
          onChange={(event) => setPregnancy(event.target.value)}
          className="border-strong bg-surface text-primary focus-visible:outline-focus h-11 w-full rounded-md border px-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <option value="none">Not applicable</option>
          <option value="pregnant">Currently pregnant</option>
          <option value="postnatal">Given birth in the last 12 months</option>
        </select>
      </div>

      {pregnancy === 'pregnant' ? (
        <div className="grid gap-1.5">
          <Label htmlFor="pregnancyWeeks">How many weeks, roughly?</Label>
          <Input id="pregnancyWeeks" name="pregnancyWeeks" type="number" min={0} max={45} />
          <p className="text-muted text-xs">
            Barre adapts well to pregnancy, but what is appropriate depends on the stage — please
            have a word with Kelly before your first class.
          </p>
        </div>
      ) : null}

      {/*
        Explicit, separate consent. Health answers are special category data
        under UK GDPR, and bundling this into the account terms would not be a
        lawful basis for processing it.
      */}
      <label className="text-secondary bg-surface-sunk flex items-start gap-3 rounded-md p-4 text-sm">
        <input
          type="checkbox"
          name="explicitConsent"
          required
          className="accent-action-primary mt-1 size-4"
        />
        <span>
          I am happy for Kelly to see these answers so she can keep me safe in class. They are
          visible only to her, are never used for anything else, and I can ask for them to be
          deleted at any time.
        </span>
      </label>

      {state?.error ? (
        <p
          role="alert"
          className="bg-status-full-bg text-status-full-fg rounded-md px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Saving…' : 'Finish'}
      </Button>
    </form>
  );
}
