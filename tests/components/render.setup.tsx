import { vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * next/link and next/image expect to run inside a Next app. These components do
 * not care — they only need something that renders an anchor and an image — so
 * they are stubbed with the plainest possible equivalents.
 *
 * The stubs deliberately render `href` and `src` as real attributes, so the
 * tests can assert on where a link actually points.
 */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={typeof href === 'string' ? href : String(href)} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...rest} />
  ),
}));
