'use client';

import { useActionState } from 'react';
import { addWalkIn, type AdminResult } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function run(_previous: AdminResult, formData: FormData): Promise<AdminResult> {
  return addWalkIn(formData);
}

export function WalkInForm({ sessionId }: { sessionId: string }) {
  const [state, submit, pending] = useActionState(run, undefined);

  return (
    <form action={submit} className="mt-4 grid gap-3">
      <input type="hidden" name="sessionId" value={sessionId} />

      <div className="grid gap-1.5">
        <Label htmlFor="walkin-email">Their email</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="walkin-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </div>

      {state?.ok ? (
        <p role="status" className="text-status-open-fg text-sm font-medium">
          {state.message ?? 'Added.'}
        </p>
      ) : null}
      {state && !state.ok ? (
        <p role="alert" className="text-status-full-fg text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
