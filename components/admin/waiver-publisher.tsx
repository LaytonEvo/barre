'use client';

import { useActionState, useState } from 'react';
import { publishWaiver, type AdminResult } from '@/app/actions/admin-content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function run(_previous: AdminResult, formData: FormData): Promise<AdminResult> {
  return publishWaiver(formData);
}

/**
 * Publishing a new waiver version.
 *
 * This is a bigger deal than it looks: publishing invalidates every existing
 * signature for the booking gate, so everybody has to agree again before their
 * next class. The count is shown, and the action is behind a confirmation.
 */
export function WaiverPublisher({
  currentLabel,
  currentBody,
  signedCount,
}: {
  currentLabel: string | null;
  currentBody: string;
  signedCount: number;
}) {
  const [state, submit, pending] = useActionState(run, undefined);
  const [open, setOpen] = useState(false);

  if (state?.ok) {
    return (
      <p role="status" className="text-status-open-fg mt-4 text-sm">
        {state.message}
      </p>
    );
  }

  if (!open) {
    return (
      <div className="mt-4">
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          Publish a new version
        </Button>
      </div>
    );
  }

  return (
    <form action={submit} className="border-subtle mt-4 grid gap-3 rounded-lg border p-4">
      <div className="bg-status-nearly-bg rounded-md p-3">
        <p className="text-primary text-sm">
          {signedCount === 0
            ? 'Nobody has signed the current version yet.'
            : `${signedCount} ${signedCount === 1 ? 'member' : 'members'} will have to read and sign again before their next class.`}{' '}
          Their old signatures are kept as the record of what they agreed to at the time.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="versionLabel">Version label</Label>
        <Input
          id="versionLabel"
          name="versionLabel"
          required
          maxLength={60}
          defaultValue={currentLabel ? `${currentLabel.replace(/DRAFT-/, '')}-next` : '1.0'}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="body">The agreement</Label>
        <textarea
          id="body"
          name="body"
          required
          rows={16}
          defaultValue={currentBody}
          className="border-strong bg-surface text-primary focus-visible:outline-focus w-full rounded-md border px-3 py-2 font-mono text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <p className="text-muted text-xs">
          Markdown. Headings with #, bold with **, bullets with -.
        </p>
      </div>

      <label className="text-secondary flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="reviewed"
          required
          className="accent-action-primary mt-1 size-4"
        />
        <span>
          I confirm this wording has been checked against the insurance policy and reviewed by a
          legal professional.
        </span>
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Publishing…' : 'Publish'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      {state && !state.ok ? (
        <p role="alert" className="text-status-full-fg text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
