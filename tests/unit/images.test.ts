import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GALLERY, LOGO, PHOTOS } from '@/lib/images';

const root = (path: string) => fileURLToPath(new URL(`../../public${path}`, import.meta.url));

/**
 * A missing image is invisible in a build — Next happily emits a broken <img>.
 * These tests make it a CI failure instead.
 */
describe('photo manifest', () => {
  const all = [...Object.values(PHOTOS), LOGO];

  it.each(all.map((p) => [p.src, p]))('%s exists on disk', (_src, photo) => {
    expect(existsSync(root(photo.src))).toBe(true);
  });

  it('gives every photo real dimensions, so nothing shifts as it loads', () => {
    for (const photo of all) {
      expect(photo.width).toBeGreaterThan(0);
      expect(photo.height).toBeGreaterThan(0);
    }
  });

  it('gives every photo alt text', () => {
    // Decorative use passes alt="" at the call site; the manifest itself always
    // carries a real description so the choice is deliberate.
    for (const photo of Object.values(PHOTOS)) {
      expect(photo.alt.length).toBeGreaterThan(10);
    }
  });

  it('labels orientation consistently with the dimensions', () => {
    for (const photo of Object.values(PHOTOS)) {
      const expected = photo.width >= photo.height ? 'landscape' : 'portrait';
      expect(photo.orientation).toBe(expected);
    }
  });

  it('has no duplicates in the homepage gallery', () => {
    expect(new Set(GALLERY.map((p) => p.src)).size).toBe(GALLERY.length);
  });

  it('ships the favicon and the Open Graph image', () => {
    expect(existsSync(fileURLToPath(new URL('../../app/icon.png', import.meta.url)))).toBe(true);
    expect(
      existsSync(fileURLToPath(new URL('../../app/opengraph-image.jpg', import.meta.url))),
    ).toBe(true);
  });
});

/**
 * Image paths also live in a migration, where TypeScript cannot see them. This
 * walks the SQL and checks each one resolves, which is what would otherwise
 * ship a broken portrait on /about.
 */
describe('image paths referenced from migrations', () => {
  it('all resolve to a file in public/', () => {
    const sql = readFileSync(
      fileURLToPath(
        new URL('../../supabase/migrations/20260105000400_kelly_and_photos.sql', import.meta.url),
      ),
      'utf8',
    );
    const paths = [...sql.matchAll(/'(\/images\/[^']+)'/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(existsSync(root(path)), `${path} is referenced in SQL but missing`).toBe(true);
    }
  });
});
