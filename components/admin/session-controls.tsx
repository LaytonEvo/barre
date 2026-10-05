'use client';

import { useActionState, useState } from 'react';
import { cancelSession, setCapacity, type AdminResult } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function runCapacity(_p: AdminResult, formData: FormData): Promise<AdminResult> {
  return setCapacity(formData);
}
async function runCancel(_p: AdminResult, formData: FormData): Promise<AdminResult> {
  return cancelSession(formData);
}

/**
 * Per-class controls.
 *
 * Cancelling is behind a deliberate second step with the consequence spelled
 * out, because it refunds everyone and emails them — not something to do by
 * brushing a phone screen.
 */
export function SessionControls({
  sessionId,
  capacity,
  booked,
}: {
  sessionId: string;
  capacity: number;
  booked: number;
}) {
  const [capState, submitCapacity, capPending] = useActionState(runCapacity, undefined);
  const [cancelState, submitCancel, cancelPending] = useActionState(runCancel, undefined);
  const [confirming, setConfirming] = useState(false);

  if (cancelState?.ok) {
    return (
      <p role="status" className="text-status-open-fg mt-3 text-sm">
        {cancelState.message}
      </p>
    );
  }

  return (
    <div className="mt-3 grid gap-3">
      <form action={submitCapacity} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="sessionId" value={sessionId} />
        <div className="grid gap-1">
          <Label htmlFor={`cap-${sessionId}`} className="text-xs">
            Places
          </Label>
          <Input
            id={`cap-${sessionId}`}
            name="capacity"
            type="number"
            inputMode="numeric"
            min={Math.max(1, booked)}
            max={200}
            defaultValue={capacity}
            className="w-24"
          />
        </div>
        <Button type="submit" variant="ghost" size="sm" disabled={capPending}>
          {capPending ? 'Saving…' : 'Update'}
        </Button>
        {capState?.ok ? (
          <span role="status" className="text-status-open-fg text-sm">
            {capState.message}
          </span>
        ) : null}
        {capState && !capState.ok ? (
          <span role="alert" className="text-status-full-fg text-sm">
            {capState.error}
          </span>
        ) : null}
      </form>

      {confirming ? (
        <form action={submitCancel} className="bg-status-full-bg grid gap-2 rounded-md p-3">
          <input type="hidden" name="sessionId" value={sessionId} />
          <p className="text-status-full-fg text-sm font-medium">
            {booked === 0
              ? 'Nobody is booked onto this class.'
              : `${booked} ${booked === 1 ? 'person' : 'people'} will get their credit back and be told.`}
          </p>
          <Label htmlFor={`reason-${sessionId}`} className="text-xs">
            Why? Members will see this.
          </Label>
          <Input
            id={`reason-${sessionId}`}
            name="reason"
            required
            minLength={3}
            maxLength={300}
            placeholder="Hall unavailable"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" size="sm" disabled={cancelPending}>
              {cancelPending ? 'Cancelling…' : 'Cancel this class'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
          {cancelState && !cancelState.ok ? (
            <p role="alert" className="text-status-full-fg text-sm">
              {cancelState.error}
            </p>
          ) : null}
        </form>
      ) : (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Cancel this class
          </Button>
        </div>
      )}
    </div>
  );
}
