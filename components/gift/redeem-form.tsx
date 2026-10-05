'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { redeemVoucher } from '@/app/actions/gift';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type State = { ok: boolean; message?: string; error?: string } | undefined;

async function run(previous: State, formData: FormData) {
  return redeemVoucher(previous, formData);
}

export function RedeemForm({ initialCode }: { initialCode: string }) {
  const [state, submit, pending] = useActionState(run, undefined);

  if (state?.ok) {
    return (
      <div className="border-strong bg-status-open-bg mt-6 rounded-xl border p-6">
        <p className="text-primary font-medium">{state.message}</p>
        <p className="text-secondary mt-2 text-sm">
          Book whichever class suits you — Mondays at 6:30 and 7:30, Thursdays at 7:15.
        </p>
        <div className="mt-4">
          <Link href="/timetable">
            <Button variant="accent">See the timetable</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={submit} className="mt-6 grid gap-4">
      <div>
        <Label htmlFor="code">Voucher code</Label>
        <Input
          id="code"
          name="code"
          required
          defaultValue={initialCode}
          placeholder="BARRE-XXXX-XXXX"
          // Hyphens and case do not matter — the database normalises both — but
          // uppercase matches the card they are reading from.
          className="mt-1 font-mono uppercase"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <p className="text-muted mt-1 text-xs">
          Capitals, hyphens and spaces all work — type it however it is easiest.
        </p>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Checking…' : 'Redeem'}
        </Button>
      </div>

      {state?.error ? (
        <p role="alert" className="text-status-full-fg text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
