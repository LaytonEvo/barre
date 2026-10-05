'use client';

import { useActionState } from 'react';
import { claimFreeClass, startCheckout, type PurchaseResult } from '@/app/actions/purchase';
import { Button, type ButtonProps } from '@/components/ui/button';

async function runCheckout(_previous: PurchaseResult, formData: FormData): Promise<PurchaseResult> {
  return startCheckout(formData);
}

async function runFree(_previous: PurchaseResult): Promise<PurchaseResult> {
  return claimFreeClass();
}

/**
 * Buying a pack or a drop-in. Hands off to Stripe Checkout — the product is
 * identified by slug and the member by their session, so neither price nor
 * identity can be set by the form.
 */
export function BuyButton({
  slug,
  children,
  variant = 'primary',
  size = 'md',
}: {
  slug: string;
  children: React.ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}) {
  const [state, submit, pending] = useActionState(runCheckout, undefined);

  return (
    <form action={submit} className="grid gap-2">
      <input type="hidden" name="slug" value={slug} />
      <Button type="submit" variant={variant} size={size} disabled={pending}>
        {pending ? 'One moment…' : children}
      </Button>
      {state?.error ? (
        <p role="alert" className="text-status-full-fg text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/** The free first class, which never touches Stripe. */
export function ClaimFreeClassButton({ size = 'lg' }: { size?: ButtonProps['size'] }) {
  const [state, submit, pending] = useActionState(runFree, undefined);

  return (
    <form action={submit} className="grid gap-2">
      <Button type="submit" variant="accent" size={size} disabled={pending}>
        {pending ? 'One moment…' : 'Claim your free class'}
      </Button>
      {state?.error ? (
        <p role="alert" className="text-status-full-fg text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
