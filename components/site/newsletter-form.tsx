'use client';

import { useActionState } from 'react';
import { subscribeToNewsletter, type NewsletterResult } from '@/app/actions/newsletter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function run(_previous: NewsletterResult, formData: FormData): Promise<NewsletterResult> {
  return subscribeToNewsletter(formData);
}

export function NewsletterForm({ source = 'homepage' }: { source?: string }) {
  const [state, submit, pending] = useActionState(run, undefined);

  if (state?.ok) {
    return (
      <p role="status" className="text-status-open-fg text-sm font-medium">
        You&rsquo;re on the list. Nothing often, and nothing you did not ask for.
      </p>
    );
  }

  return (
    <form action={submit} className="grid gap-3">
      <input type="hidden" name="source" value={source} />
      <div aria-hidden className="hidden">
        <label htmlFor="nl-website">Website</label>
        <input id="nl-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state?.ok === false ? (
        <p role="alert" className="text-status-full-fg text-sm">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="nl-email">Email</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="nl-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={200}
            placeholder="you@example.com"
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Keep me posted'}
          </Button>
        </div>
      </div>

      <p className="text-muted text-xs">
        Occasional notes about new classes and timetable changes. Unsubscribe any time.
      </p>
    </form>
  );
}
