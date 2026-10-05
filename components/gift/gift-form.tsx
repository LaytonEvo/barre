'use client';

import { useActionState } from 'react';
import { buyGift, type GiftResult } from '@/app/actions/gift';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Option = { slug: string; name: string; pricePence: number; credits: number | null };

async function run(previous: GiftResult, formData: FormData) {
  return buyGift(previous, formData);
}

const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;

export function GiftForm({ options }: { options: Option[] }) {
  const [state, submit, pending] = useActionState(run, undefined);

  // Today, in the local date format the input wants. Used as the minimum so the
  // browser itself stops a date in the past being picked.
  const today = new Date().toLocaleDateString('en-CA');

  return (
    <form action={submit} className="mt-8 grid gap-5">
      <fieldset>
        <legend className="text-secondary text-sm font-medium">What would you like to give?</legend>
        <div className="mt-2 grid gap-2">
          {options.map((option, index) => (
            <label
              key={option.slug}
              className="border-subtle bg-surface hover:border-strong flex cursor-pointer items-baseline gap-3 rounded-lg border p-3"
            >
              <input
                type="radio"
                name="productSlug"
                value={option.slug}
                defaultChecked={index === 0}
                required
                className="mt-1"
              />
              <span className="min-w-0 flex-1">
                <span className="text-primary block font-medium">{option.name}</span>
                <span className="text-muted block text-sm">
                  {money(option.pricePence)}
                  {option.credits ? ` · ${option.credits} classes` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="recipientName">Who is it for?</Label>
        <Input id="recipientName" name="recipientName" placeholder="Sam" className="mt-1" />
        <p className="text-muted mt-1 text-xs">Optional — it just makes the email friendlier.</p>
      </div>

      <div>
        <Label htmlFor="recipientEmail">Their email address</Label>
        <Input
          id="recipientEmail"
          name="recipientEmail"
          type="email"
          required
          autoComplete="off"
          placeholder="sam@example.com"
          className="mt-1"
        />
        <p className="text-muted mt-1 text-xs">
          Worth double-checking — this is where the code goes.
        </p>
      </div>

      <div>
        <Label htmlFor="message">A message from you</Label>
        <textarea
          id="message"
          name="message"
          rows={3}
          maxLength={450}
          placeholder="Happy birthday! Thought you might like this."
          className="border-subtle bg-surface text-primary focus-visible:outline-focus mt-1 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-2"
        />
      </div>

      <div>
        <Label htmlFor="sendOn">When should we email it?</Label>
        <Input id="sendOn" name="sendOn" type="date" min={today} className="mt-1" />
        <p className="text-muted mt-1 text-xs">
          Leave empty to send it straight away. Pick a date and it arrives that morning — useful for
          a birthday.
        </p>
      </div>

      <div>
        <Button type="submit" variant="accent" size="lg" disabled={pending}>
          {pending ? 'Taking you to payment…' : 'Continue to payment'}
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
