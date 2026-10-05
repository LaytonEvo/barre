import './render.setup';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

/**
 * The accessibility promises in docs/02 are only real if the components keep
 * them. These assert the ones that are checkable in markup.
 */
describe('Button', () => {
  it('meets the 44px minimum target at every size', () => {
    // h-11 is 44px; h-12 is the 48px booking CTA.
    for (const size of ['sm', 'md', 'lg', 'icon'] as const) {
      const html = renderToStaticMarkup(<Button size={size}>Go</Button>);
      expect(html).toMatch(/h-11|h-12|size-11/);
    }
  });

  it('gives booking CTAs the taller 48px target', () => {
    expect(renderToStaticMarkup(<Button size="lg">Book</Button>)).toContain('h-12');
  });

  it('keeps a visible focus style rather than removing the outline', () => {
    const html = renderToStaticMarkup(<Button>Go</Button>);
    expect(html).toContain('focus-visible:outline-2');
    // outline-none alone, with nothing restoring it, would be the bug.
    expect(html).toContain('focus-visible:outline-focus');
  });

  it('uses the accent only for the accent variant, so Book stays distinct', () => {
    expect(renderToStaticMarkup(<Button variant="accent">Book</Button>)).toContain(
      'bg-action-accent',
    );
    expect(renderToStaticMarkup(<Button variant="primary">Buy</Button>)).not.toContain(
      'bg-action-accent',
    );
  });

  it('renders a real disabled attribute, not just a disabled look', () => {
    expect(renderToStaticMarkup(<Button disabled>Full</Button>)).toContain('disabled');
  });

  it('passes through a type so a button in a form does not submit by accident', () => {
    expect(renderToStaticMarkup(<Button type="button">Go</Button>)).toContain('type="button"');
  });
});

describe('Badge', () => {
  it('maps each booking state to its own tone', () => {
    const tones = {
      open: 'bg-status-open-bg',
      nearly: 'bg-status-nearly-bg',
      full: 'bg-status-full-bg',
      waitlist: 'bg-status-waitlist-bg',
      cancelled: 'bg-status-cancelled-bg',
    } as const;

    for (const [tone, expected] of Object.entries(tones)) {
      const html = renderToStaticMarkup(<Badge tone={tone as keyof typeof tones}>Label</Badge>);
      expect(html, `tone ${tone}`).toContain(expected);
    }
  });

  it('always renders its children, so the state is never colour-only', () => {
    expect(renderToStaticMarkup(<Badge tone="full">Full</Badge>)).toContain('Full');
  });
});

describe('Input', () => {
  it('is at least 16px, so iOS does not zoom the page on focus', () => {
    expect(renderToStaticMarkup(<Input />)).toContain('text-base');
  });

  it('keeps a visible focus style', () => {
    expect(renderToStaticMarkup(<Input />)).toContain('focus-visible:outline-2');
  });

  it('reflects an invalid state visually as well as semantically', () => {
    const html = renderToStaticMarkup(<Input aria-invalid />);
    expect(html).toContain('aria-invalid');
    expect(html).toContain('aria-invalid:border-action-destructive');
  });
});
