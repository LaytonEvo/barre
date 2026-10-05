/**
 * The library's filter vocabulary, in one place.
 *
 * Kept out of the components because the same lists drive the filter chips, the
 * URL parsing and the admin form. Three copies of "small ball" is how one of them
 * ends up spelled differently and silently matching nothing.
 */

export const LENGTHS = [
  { value: '10', label: '10 min', hint: 'Under 15 minutes' },
  { value: '20', label: '20 min', hint: '15 to 25 minutes' },
  { value: '30', label: '30 min', hint: '25 to 40 minutes' },
  { value: '45plus', label: '45 min +', hint: '40 minutes or more' },
] as const;

export const LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'improver', label: 'Improver' },
  { value: 'all_levels', label: 'All levels' },
] as const;

/**
 * Equipment is stored as plain text in `videos.equipment`, so these strings ARE
 * the data. Changing one here without a migration stops it matching.
 */
export const EQUIPMENT = [
  { value: 'mat', label: 'Mat' },
  { value: 'small ball', label: 'Small ball' },
  { value: 'light weights', label: 'Light weights' },
  { value: 'chair', label: 'Chair (as a barre)' },
  { value: 'resistance band', label: 'Resistance band' },
] as const;

export type LengthValue = (typeof LENGTHS)[number]['value'];
export type LevelValue = (typeof LEVELS)[number]['value'];

export function isLength(value: string | undefined): value is LengthValue {
  return LENGTHS.some((l) => l.value === value);
}

export function isLevel(value: string | undefined): value is LevelValue {
  return LEVELS.some((l) => l.value === value);
}

/** Only known equipment values are passed to the database. */
export function parseEquipment(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const wanted = raw.split(',').map((part) => part.trim());
  const known = EQUIPMENT.filter((e) => wanted.includes(e.value)).map((e) => e.value);
  return known.length > 0 ? known : null;
}

/** Minutes, rounded for display. A 55-minute class should not read "54 min". */
export function durationLabel(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '';
  return `${Math.round(seconds / 60)} min`;
}

export function levelLabel(value: string): string {
  return LEVELS.find((l) => l.value === value)?.label ?? 'All levels';
}
