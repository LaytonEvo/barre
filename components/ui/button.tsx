import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Follows shadcn/ui conventions, so `npx shadcn@latest add <component>` can
 * drop further primitives in beside it. Variants map to semantic tokens only.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium ' +
    'transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-focus disabled:pointer-events-none disabled:bg-surface-sunk ' +
    'disabled:text-disabled [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Sitewide primary. Plum.
        primary: 'bg-action-primary text-white hover:bg-action-primary-hover',
        // Reserved for the action that books a class, one per screen.
        accent: 'bg-action-accent text-white font-semibold hover:bg-action-accent-hover',
        secondary: 'border border-action-primary text-link hover:bg-surface-sunk',
        ghost: 'text-link hover:bg-surface-sunk',
        destructive: 'bg-action-destructive text-white hover:brightness-110',
      },
      size: {
        // 44px floor on every size: WCAG 2.2 target size.
        sm: 'h-11 px-4 text-sm',
        md: 'h-11 px-5 text-[0.9375rem]',
        // Booking CTAs, thumb-reachable.
        lg: 'h-12 px-7 text-base',
        icon: 'size-11',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, block, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}

export { buttonVariants };
