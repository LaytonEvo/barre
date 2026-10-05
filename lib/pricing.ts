/**
 * Pricing arithmetic.
 *
 * Pure and separate from the queries so it can be tested: these numbers are
 * shown to customers next to a "buy" button, and a wrong per-class figure is the
 * kind of error that erodes trust in everything else on the page.
 *
 * All money is integer pence. Nothing here returns a float that gets formatted
 * as currency later — rounding happens once, at the point of display.
 */

/** Pence per class for a pack, or null when it cannot be worked out. */
export function pricePerClassPence(pricePence: number, credits: number | null): number | null {
  if (credits === null || credits <= 0) return null;
  if (pricePence <= 0) return null;
  // Rounded to the nearest penny. A pack of 6 at £25 is £4.1666…, shown as £4.17.
  return Math.round(pricePence / credits);
}

/**
 * Whole-pound-ish saving against paying each time, as a percentage.
 *
 * Returns null when there is nothing meaningful to compare — no single-class
 * price yet, or a pack that is not actually cheaper. Deliberately never returns
 * a negative "saving".
 */
export function savingPercent(
  pricePence: number,
  credits: number | null,
  singleClassPence: number | null,
): number | null {
  if (!singleClassPence || singleClassPence <= 0) return null;
  const perClass = pricePerClassPence(pricePence, credits);
  if (perClass === null || perClass >= singleClassPence) return null;
  return Math.round(((singleClassPence - perClass) / singleClassPence) * 100);
}

/** How many classes a pack gives away free, for "buy 5 get 1 free" style copy. */
export function freeClasses(
  pricePence: number,
  credits: number | null,
  singleClassPence: number | null,
): number | null {
  if (!singleClassPence || singleClassPence <= 0 || credits === null) return null;
  const paidFor = pricePence / singleClassPence;
  if (!Number.isInteger(paidFor)) return null;
  const free = credits - paidFor;
  return free > 0 ? free : null;
}
