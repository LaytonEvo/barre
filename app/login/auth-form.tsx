'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  signInWithPassword,
  signInWithMagicLink,
  signInWithGoogle,
  signUp,
  type ActionResult,
} from './actions';

type Mode = 'login' | 'signup';

async function run(
  action: (formData: FormData) => Promise<ActionResult>,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return action(formData);
}

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const primary = mode === 'login' ? signInWithPassword : signUp;

  const [state, submit, pending] = useActionState(run.bind(null, primary), undefined);
  const [magicState, submitMagic, magicPending] = useActionState(
    run.bind(null, signInWithMagicLink),
    undefined,
  );
  const [googleState, submitGoogle, googlePending] = useActionState(
    run.bind(null, signInWithGoogle),
    undefined,
  );

  const error = state?.error ?? magicState?.error ?? googleState?.error;

  return (
    <div className="mt-8 grid gap-6">
      {error ? (
        <p
          role="alert"
          className="bg-status-full-bg text-status-full-fg rounded-md px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <form action={submit} className="grid gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        {mode === 'signup' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name="firstName" autoComplete="given-name" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name="lastName" autoComplete="family-name" required />
            </div>
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
          />
          {mode === 'signup' ? <p className="text-muted text-xs">At least 8 characters.</p> : null}
        </div>

        {mode === 'signup' ? (
          <label className="text-secondary flex items-start gap-3 text-sm">
            {/* Unticked by default, and separate from account creation. */}
            <input
              type="checkbox"
              name="marketingConsent"
              value="true"
              className="accent-action-primary mt-1 size-4"
            />
            <span>
              Email me about new classes, offers and the odd studio update. You can unsubscribe at
              any time.
            </span>
          </label>
        ) : null}

        <Button type="submit" block size="lg" disabled={pending}>
          {pending ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <span className="bg-subtle h-px flex-1" />
        <span className="text-muted text-xs tracking-[0.08em] uppercase">or</span>
        <span className="bg-subtle h-px flex-1" />
      </div>

      <form action={submitMagic} className="grid gap-2">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Label htmlFor="magic-email">Email me a link instead</Label>
        <div className="flex gap-2">
          <Input id="magic-email" name="email" type="email" autoComplete="email" required />
          <Button type="submit" variant="secondary" disabled={magicPending}>
            {magicPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </form>

      <form action={submitGoogle}>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Button type="submit" variant="secondary" block disabled={googlePending}>
          {googlePending ? 'Redirecting…' : 'Continue with Google'}
        </Button>
      </form>
    </div>
  );
}
