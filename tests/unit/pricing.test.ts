import { describe, expect, it } from 'vitest';
import { freeClasses, pricePerClassPence, savingPercent } from '@/lib/pricing';

/**
 * These numbers sit next to a buy button, so they get tested.
 *
 * The real figures: a single class is £5 (500p), the 6-class pack is £25 (2500p)
 * and the 12-class pack is £50 (5000p).
 */
const SINGLE = 500;

describe('pricePerClassPence', () => {
  it('works out the real 6-for-5 pack', () => {
    // £25 / 6 = £4.1666…, rounded to £4.17.
    expect(pricePerClassPence(2500, 6)).toBe(417);
  });

  it('works out the real 12-for-10 pack', () => {
    expect(pricePerClassPence(5000, 12)).toBe(417);
  });

  it('returns null rather than Infinity when credits are unknown', () => {
    expect(pricePerClassPence(2500, null)).toBeNull();
  });

  it('returns null rather than dividing by zero', () => {
    expect(pricePerClassPence(2500, 0)).toBeNull();
  });

  it('returns null for an unpriced pack, so no "£0 a class" is ever shown', () => {
    // Packs exist with price 0 before they are priced. That must not render.
    expect(pricePerClassPence(0, 6)).toBeNull();
  });

  it('rounds to the nearest penny, not down', () => {
    // 1000 / 3 = 333.33 -> 333; 2000 / 3 = 666.67 -> 667.
    expect(pricePerClassPence(1000, 3)).toBe(333);
    expect(pricePerClassPence(2000, 3)).toBe(667);
  });
});

describe('savingPercent', () => {
  it('reports the saving on both real packs', () => {
    // £4.17 against £5 is a 17% saving.
    expect(savingPercent(2500, 6, SINGLE)).toBe(17);
    expect(savingPercent(5000, 12, SINGLE)).toBe(17);
  });

  it('returns null when there is no single-class price to compare against', () => {
    expect(savingPercent(2500, 6, null)).toBeNull();
    expect(savingPercent(2500, 6, 0)).toBeNull();
  });

  it('never advertises a negative saving', () => {
    // A pack priced badly should show nothing, not "save -20%".
    expect(savingPercent(3600, 6, SINGLE)).toBeNull();
  });

  it('returns null when a pack is merely the same price per class', () => {
    expect(savingPercent(3000, 6, SINGLE)).toBeNull();
  });
});

describe('freeClasses', () => {
  it('describes the real packs the way Kelly does', () => {
    // Buy 5 get 1 free, buy 10 get 2 free.
    expect(freeClasses(2500, 6, SINGLE)).toBe(1);
    expect(freeClasses(5000, 12, SINGLE)).toBe(2);
  });

  it('returns null when the price is not a whole number of classes', () => {
    // £22 is 4.4 classes, so "get N free" is not an honest description.
    expect(freeClasses(2200, 6, SINGLE)).toBeNull();
  });

  it('returns null when nothing is actually free', () => {
    expect(freeClasses(3000, 6, SINGLE)).toBeNull();
  });

  it('returns null without a single-class price', () => {
    expect(freeClasses(2500, 6, null)).toBeNull();
  });
});
