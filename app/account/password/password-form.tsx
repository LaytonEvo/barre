'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updatePassword, type ActionResult } from '@/app/login/actions';

async function run(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return updatePassword(formData);
}

export function PasswordForm() {
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
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          autoFocus
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <Button type="submit" block size="lg" disabled={pending}>
        {pending ? 'Saving…' : 'Save password'}
      </Button>
    </form>
  );
}
