'use client';

import { useActionState } from 'react';
import { adjustCredits, type AdminResult } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function run(_previous: AdminResult, formData: FormData): Promise<AdminResult> {
  return adjustCredits(formData);
}

export function AdjustCreditsForm({ userId }: { userId: string }) {
  const [state, submit, pending] = useActionState(run, undefined);

  return (
    <form action={submit} className="mt-4 grid gap-3">
      <input type="hidden" name="userId" value={userId} />

      <div className="grid gap-1.5">
        <Label htmlFor="delta">Adjust by</Label>
        <Input
          id="delta"
          name="delta"
          type="number"
          inputMode="numeric"
          min={-50}
          max={50}
          defaultValue={1}
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="reason">Reason</Label>
        <Input
          id="reason"
          name="reason"
          required
          minLength={3}
          maxLength={300}
          placeholder="Hall was locked, class did not run"
        />
        {/* Mandatory in the database too. Six months on, "Kelly adjusted it" is
            not an answer to "why does this member have three extra credits". */}
        <p className="text-muted text-xs">Goes in the audit log.</p>
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Adjust balance'}
      </Button>

      {state?.ok ? (
        <p role="status" className="text-status-open-fg text-sm">
          {state.message}
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
