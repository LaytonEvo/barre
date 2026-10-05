import { describe, expect, it } from 'vitest';
import { durationLabel, isLength, isLevel, levelLabel, parseEquipment } from '@/lib/videos/filters';

describe('parseEquipment', () => {
  it('keeps only known values, so a hand-edited URL cannot inject anything', () => {
    expect(parseEquipment('mat,nonsense')).toEqual(['mat']);
  });

  it('returns null when nothing is recognised, which means "no filter"', () => {
    // Important that this is null and not []: an empty array passed to the
    // database would be a subset test against nothing and match only videos
    // needing no equipment at all.
    expect(parseEquipment('nonsense')).toBeNull();
    expect(parseEquipment('')).toBeNull();
    expect(parseEquipment(undefined)).toBeNull();
  });

  it('tolerates spaces around the commas', () => {
    expect(parseEquipment('mat , small ball')).toEqual(['mat', 'small ball']);
  });

  it('returns values in the vocabulary order, not the order given', () => {
    expect(parseEquipment('small ball,mat')).toEqual(['mat', 'small ball']);
  });
});

describe('isLength / isLevel', () => {
  it('accepts the four documented buckets', () => {
    for (const value of ['10', '20', '30', '45plus']) expect(isLength(value)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isLength('15')).toBe(false);
    expect(isLength(undefined)).toBe(false);
    expect(isLevel('expert')).toBe(false);
  });
});

describe('durationLabel', () => {
  it('rounds to the nearest minute', () => {
    expect(durationLabel(55 * 60)).toBe('55 min');
    expect(durationLabel(55 * 60 + 29)).toBe('55 min');
    expect(durationLabel(55 * 60 + 31)).toBe('56 min');
  });

  it('is empty for a missing duration rather than showing "0 min"', () => {
    expect(durationLabel(null)).toBe('');
    expect(durationLabel(0)).toBe('');
  });
});

describe('levelLabel', () => {
  it('falls back to All levels for an unknown value', () => {
    expect(levelLabel('nonsense')).toBe('All levels');
    expect(levelLabel('beginner')).toBe('Beginner');
  });
});
