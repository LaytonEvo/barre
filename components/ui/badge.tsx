import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Status badges always carry text as well as colour. The timetable is the most
 * colour-coded screen in the product, so colour alone is never the signal.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ' +
    "whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current before:content-['']",
  {
    variants: {
      tone: {
        open: 'bg-status-open-bg text-status-open-fg',
        nearly: 'bg-status-nearly-bg text-status-nearly-fg',
        full: 'bg-status-full-bg text-status-full-fg',
        waitlist: 'bg-status-waitlist-bg text-status-waitlist-fg',
        cancelled: 'bg-status-cancelled-bg text-status-cancelled-fg',
        neutral: 'bg-surface-sunk text-secondary',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
