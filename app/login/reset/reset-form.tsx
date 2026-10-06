'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordReset, type ActionResult } from '../actions';

async function run(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return requestPasswordReset(formData);
}

export function ResetRequestForm() {
  const [state, submit, pending] = useActionState(run, undefined);

  return (
    <form action={submit} className="mt-8 grid gap-4">
      {state?.error ? (
        <p
          role="alert"
          className="bg-status-full-bg text-status-full-fg rounded-md px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>

      <Button type="submit" block size="lg" disabled={pending}>
        {pending ? 'Sending…' : 'Send me a reset link'}
      </Button>
    </form>
  );
}
