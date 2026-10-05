'use client';

import { useActionState } from 'react';
import { setSetting, type AdminResult } from '@/app/actions/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

async function run(_previous: AdminResult, formData: FormData): Promise<AdminResult> {
  return setSetting(formData);
}

/**
 * Values are edited as JSON because that is what they are — numbers, booleans,
 * strings and the occasional array. The description under each one says what it
 * means in English, which is the part Kelly reads.
 */
export function SettingRow({
  settingKey,
  value,
  description,
  confirmed,
}: {
  settingKey: string;
  value: string;
  description: string | null;
  confirmed: boolean;
}) {
  const [state, submit, pending] = useActionState(run, undefined);
  const saved = state?.ok === true;

  return (
    <form action={submit} className="border-subtle bg-surface grid gap-2 rounded-lg border p-4">
      <input type="hidden" name="key" value={settingKey} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`setting-${settingKey}`} className="font-mono text-sm font-medium">
          {settingKey}
        </label>
        {confirmed && !saved ? null : (
          <Badge tone={saved ? 'open' : 'nearly'}>{saved ? 'Saved' : 'Not confirmed'}</Badge>
        )}
      </div>

      {description ? <p className="text-muted text-sm">{description}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Input
          id={`setting-${settingKey}`}
          name="value"
          defaultValue={value}
          className="min-w-0 flex-1 font-mono text-sm"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
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
