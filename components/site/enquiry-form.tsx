'use client';

import { useActionState } from 'react';
import { submitEnquiry, type EnquiryResult } from '@/app/actions/enquiry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Kind = 'contact' | 'private_session' | 'event' | 'corporate';

async function run(_previous: EnquiryResult, formData: FormData): Promise<EnquiryResult> {
  return submitEnquiry(formData);
}

export function EnquiryForm({ kind }: { kind: Kind }) {
  const [state, submit, pending] = useActionState(run, undefined);

  if (state?.ok) {
    return (
      <div
        role="status"
        className="bg-status-open-bg text-status-open-fg rounded-lg px-4 py-5 text-sm"
      >
        <p className="font-semibold">Thanks — that&rsquo;s with Kelly.</p>
        <p className="mt-1">
          She answers everything herself, so it may take a day or so rather than a minute.
        </p>
      </div>
    );
  }

  return (
    <form action={submit} className="grid gap-4">
      <input type="hidden" name="kind" value={kind} />

      {/* Honeypot. Hidden from everyone, including screen readers. */}
      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state?.ok === false ? (
        <p
          role="alert"
          className="bg-status-full-bg text-status-full-fg rounded-md px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required maxLength={120} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={200}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="message">How can Kelly help?</Label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          minLength={10}
          maxLength={4000}
          className="border-strong bg-surface text-primary placeholder:text-muted focus-visible:outline-focus w-full rounded-md border px-3 py-2 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
          placeholder="Anything useful — injuries, whether you’ve done barre before, dates you have in mind."
        />
      </div>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Sending…' : 'Send'}
      </Button>

      <p className="text-muted text-xs">
        We use what you send here to reply to you and nothing else. See our{' '}
        <a href="/policies/privacy" className="underline">
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}
