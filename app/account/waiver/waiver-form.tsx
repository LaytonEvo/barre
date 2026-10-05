'use client';

import { useActionState, useState } from 'react';
import { signWaiver, type OnboardingResult } from '@/app/actions/onboarding';
import { SignaturePad } from '@/components/onboarding/signature-pad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function run(_previous: OnboardingResult, formData: FormData): Promise<OnboardingResult> {
  return signWaiver(formData);
}

/**
 * Markdown rendered as structured text.
 *
 * A markdown library would be a dependency for one document whose shape we
 * control. Headings, bold and bullets are all it uses.
 */
function WaiverBody({ markdown }: { markdown: string }) {
  return (
    <div className="grid gap-3">
      {markdown.split('\n').map((line, index) => {
        const key = `${index}-${line.slice(0, 24)}`;

        if (line.startsWith('## ')) {
          return (
            <h2 key={key} className="font-display text-heading mt-4 text-[length:var(--text-xl)]">
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h3 key={key} className="font-display text-heading text-[length:var(--text-2xl)]">
              {line.slice(2)}
            </h3>
          );
        }
        if (/^\s*[-*]\s+/.test(line)) {
          return (
            <p key={key} className="text-secondary pl-5 -indent-4 text-sm">
              <span aria-hidden>•&nbsp;</span>
              {line.replace(/^\s*[-*]\s+/, '')}
            </p>
          );
        }
        if (line.trim() === '') return null;

        const bolded = line.startsWith('**') && line.endsWith('**');
        return (
          <p
            key={key}
            className={bolded ? 'text-primary text-sm font-semibold' : 'text-secondary text-sm'}
          >
            {bolded ? line.slice(2, -2) : line}
          </p>
        );
      })}
    </div>
  );
}

export function WaiverForm({
  versionId,
  versionLabel,
  bodyMarkdown,
}: {
  versionId: string;
  versionLabel: string;
  bodyMarkdown: string;
}) {
  const [state, submit, pending] = useActionState(run, undefined);
  const [readToEnd, setReadToEnd] = useState(false);

  return (
    <form action={submit} className="mt-8 grid gap-6">
      <input type="hidden" name="versionId" value={versionId} />

      {/*
        Scrolled-to-the-end is tracked and the agreement tick stays disabled
        until then. It is a nudge rather than a control — anyone can scroll past
        without reading — but "I had no chance to read it" is a weaker objection
        when the box would not tick.
      */}
      <div
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true);
        }}
        className="border-subtle bg-surface max-h-[22rem] overflow-y-auto rounded-lg border p-5"
      >
        <WaiverBody markdown={bodyMarkdown} />
      </div>

      <p className="text-muted text-xs">
        Version {versionLabel}. We keep a copy of what you signed, and you can download it any time
        from your account.
      </p>

      {!readToEnd ? (
        <p className="text-muted text-sm">Please scroll to the end before agreeing.</p>
      ) : null}

      <label className="text-secondary flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="agreed"
          disabled={!readToEnd}
          className="accent-action-primary mt-1 size-4 disabled:opacity-40"
        />
        <span>
          I have read and understood this agreement, the information I have given is accurate, and I
          am taking part voluntarily.
        </span>
      </label>

      <div className="grid gap-1.5">
        <Label htmlFor="typedName">Type your full name</Label>
        <Input
          id="typedName"
          name="typedName"
          autoComplete="name"
          required
          maxLength={120}
          aria-invalid={state?.field === 'typedName' || undefined}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="signature-pad">Sign below</Label>
        <SignaturePad name="signature" />
      </div>

      {state?.error ? (
        <p
          role="alert"
          className="bg-status-full-bg text-status-full-fg rounded-md px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Saving…' : 'Agree and continue'}
      </Button>
    </form>
  );
}
