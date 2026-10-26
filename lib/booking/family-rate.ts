/**
 * Yalla After Hours family rate: $65 per child, or $85 per family for up to three children with
 * $25 for each additional child, whichever is lower. Siblings count together across the evening's
 * age groups, so the rate is worked out per program and date.
 */
export const FAMILY_RATE = { kind: "parents_night", familyCents: 8500, childrenIncluded: 3, extraChildCents: 2500 } as const;

/** The evening's total for one family: per-child prices, capped at the family rate. */
export function familyRateTotal(childPricesCents: number[]): number {
  const perChild = childPricesCents.reduce((a, b) => a + b, 0);
  const n = childPricesCents.length;
  if (n < 2) return perChild;
  const family = FAMILY_RATE.familyCents + Math.max(0, n - FAMILY_RATE.childrenIncluded) * FAMILY_RATE.extraChildCents;
  return Math.min(perChild, family);
}

export const familyRateKey = (programId: string, localDate: string) => `${programId}|${localDate}`;
