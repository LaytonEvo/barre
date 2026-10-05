'use client';

import { useActionState } from 'react';
import { openBillingPortal, type PurchaseResult } from '@/app/actions/purchase';
import { Button } from '@/components/ui/button';

async function run(_previous: PurchaseResult): Promise<PurchaseResult> {
  return openBillingPortal();
}

/**
 * Opens Stripe's Customer Portal, which is where cards, invoices, receipts and
 * subscription cancellation live. Building our own would mean handling card
 * details, and the best way to handle card details is to never touch them.
 */
export function BillingPortalButton() {
  const [state, submit, pending] = useActionState(run, undefined);

  return (
    <form action={submit} className="grid gap-2">
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Opening…' : 'Manage payment details'}
      </Button>
      {state?.error ? (
        <p role="alert" className="text-status-full-fg text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
