import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        // 16px minimum: anything smaller makes iOS zoom the viewport on focus.
        'border-strong bg-surface text-primary placeholder:text-muted h-11 w-full rounded-md border',
        'px-3 text-base outline-none',
        'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:bg-surface-sunk disabled:text-disabled',
        'aria-invalid:border-action-destructive',
        className,
      )}
      {...props}
    />
  );
}
