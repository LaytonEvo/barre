'use client';

import { useActionState, useState } from 'react';
import { deleteMyAccount, type OnboardingResult } from '@/app/actions/privacy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function run(_previous: OnboardingResult, formData: FormData): Promise<OnboardingResult> {
  return deleteMyAccount(formData);
}

/**
 * Deletion is confirmed by typing a word, not by a checkbox.
 *
 * This is irreversible, so it should take a deliberate act rather than a stray
 * tap on a phone.
 */
export function DeleteAccountForm() {
  const [state, submit, pending] = useActionState(run, undefined);
  const [confirmation, setConfirmation] = useState('');
  const matches = confirmation.trim().toUpperCase() === 'DELETE';

  return (
    <form action={submit} className="mt-6 grid max-w-sm gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="confirm">Type DELETE to confirm</Label>
        <Input
          id="confirm"
          name="confirm"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-status-full-fg text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="destructive" disabled={!matches || pending}>
        {pending ? 'Deleting…' : 'Delete my account'}
      </Button>
    </form>
  );
}
