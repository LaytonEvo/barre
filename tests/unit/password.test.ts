import { describe, expect, it } from 'vitest';
import { newPasswordSchema } from '@/lib/auth/password';

/** The error text is user-facing, so it is asserted rather than just the failure. */
function reject(password: string, confirm: string) {
  const result = newPasswordSchema.safeParse({ password, confirm });
  expect(result.success).toBe(false);
  return result.success ? '' : (result.error.issues[0]?.message ?? '');
}

describe('choosing a password', () => {
  it('accepts a matching pair of at least eight characters', () => {
    expect(
      newPasswordSchema.safeParse({ password: 'barre-and-bar', confirm: 'barre-and-bar' }).success,
    ).toBe(true);
  });

  it('rejects a mistyped confirmation, naming the field that is wrong', () => {
    const result = newPasswordSchema.safeParse({
      password: 'barre-and-bar',
      confirm: 'barre-and-bax',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Those two passwords do not match.');
      expect(result.error.issues[0]?.path).toEqual(['confirm']);
    }
  });

  it('rejects anything under eight characters', () => {
    expect(reject('short12', 'short12')).toBe('Passwords are at least 8 characters.');
  });

  // Length is JavaScript's, which counts UTF-16 code units rather than
  // characters. Two emoji are four units, so this is rejected either way — the
  // point is only that an emoji password is not a way round the minimum.
  it('rejects a two-emoji password', () => {
    expect(reject('🔑🔑', '🔑🔑')).toBe('Passwords are at least 8 characters.');
  });

  it('allows a long passphrase with spaces, which is the password people actually remember', () => {
    const phrase = 'three village halls and a barre';
    expect(newPasswordSchema.safeParse({ password: phrase, confirm: phrase }).success).toBe(true);
  });

  it('does not trim, because a trailing space is part of what they typed and must match', () => {
    expect(reject('barre-and-bar ', 'barre-and-bar')).toBe('Those two passwords do not match.');
  });
});
