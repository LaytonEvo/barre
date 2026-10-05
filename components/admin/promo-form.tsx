'use client';

import { useActionState } from 'react';
import { addPromoCode, retirePromoCode, type GrowthResult } from '@/app/actions/admin-growth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function runAdd(previous: GrowthResult, formData: FormData) {
  return addPromoCode(previous, formData);
}
async function runRetire(previous: GrowthResult, formData: FormData) {
  return retirePromoCode(previous, formData);
}

export function PromoForm() {
  const [state, submit, pending] = useActionState(runAdd, undefined);

  return (
    <form
      action={submit}
      className="border-subtle bg-surface mt-4 grid gap-4 rounded-xl border p-5"
    >
      <div>
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          required
          placeholder="JANUARY25"
          className="mt-1 font-mono uppercase"
        />
        <p className="text-muted mt-1 text-xs">
          What people type at checkout. Letters, numbers and dashes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="percentOff">% off</Label>
          <Input
            id="percentOff"
            name="percentOff"
            type="number"
            min={1}
            max={100}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="amountOffPounds">or £ off</Label>
          <Input
            id="amountOffPounds"
            name="amountOffPounds"
            type="number"
            min={1}
            step="0.01"
            className="mt-1"
          />
        </div>
      </div>
      <p className="text-muted -mt-2 text-xs">One or the other, not both.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="maxRedemptions">Limit uses to</Label>
          <Input
            id="maxRedemptions"
            name="maxRedemptions"
            type="number"
            min={1}
            placeholder="No limit"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="expiresAt">Expires</Label>
          <Input id="expiresAt" name="expiresAt" type="date" className="mt-1" />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Note to yourself</Label>
        <Input
          id="description"
          name="description"
          placeholder="January new year push"
          className="mt-1"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create code'}
        </Button>
        {state && !state.ok ? (
          <span role="alert" className="text-status-full-fg text-sm">
            {state.error}
          </span>
        ) : state?.ok ? (
          <span className="text-muted text-sm">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}

export function RetirePromoButton({ id, code }: { id: string; code: string }) {
  const [state, submit, pending] = useActionState(runRetire, undefined);

  return (
    <form action={submit} className="inline">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? 'Retiring…' : 'Retire'}
      </Button>
      {state && !state.ok ? (
        <span role="alert" className="text-status-full-fg ml-2 text-xs">
          {state.error} ({code})
        </span>
      ) : null}
    </form>
  );
}
