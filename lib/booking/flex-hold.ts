/**
 * Yalla Flex cohort holds.
 *
 * Normally a child books the Flex age group their age fits. Staff can instead HOLD a child in one
 * Flex cohort (for a longtime drop-in family who wants to stay with the teachers and friends they
 * know). While a child is held:
 *   - they can book that cohort's Flex days whatever their age;
 *   - they can't book any other Flex cohort, even one their age now fits;
 *   - only staff can release the hold (Admin → the child's page).
 * Holds affect Yalla Flex only; camps, Happenings and Club Yalla follow their usual rules.
 * This file has no server-only imports, so the booking pages use the same rule as checkout.
 */
import { ageFits } from "./ages";
import { FLEX_GROUPS, flexGroupFor } from "./flex";

export const isFlexHoldKey = (v: unknown): v is string => typeof v === "string" && FLEX_GROUPS.some((g) => g.key === v);
export const flexHoldName = (key: string | null | undefined) => FLEX_GROUPS.find((g) => g.key === key)?.cohort ?? null;

export type FlexEligibility = { ok: true; held: boolean } | { ok: false; reason: "age" | "held_elsewhere"; heldIn?: string };

/**
 * Can this child book this session?
 * - isFlex: the session is a Yalla Flex day; its age group is found from minAge.
 * - ages: the session's age range (sessionAges); age: the child's age in months on the day.
 */
export function flexEligibility(input: { isFlex: boolean; minAge: number | null; ages: { min: number | null; max: number | null }; age: number; hold: string | null | undefined }): FlexEligibility {
  const hold = input.isFlex && isFlexHoldKey(input.hold) ? input.hold : null;
  if (hold) {
    const group = flexGroupFor(input.minAge);
    return group?.key === hold ? { ok: true, held: true } : { ok: false, reason: "held_elsewhere", heldIn: flexHoldName(hold) ?? hold };
  }
  return ageFits(input.age, input.ages) ? { ok: true, held: false } : { ok: false, reason: "age" };
}

/** The paragraph families read about a held child (the "added you" email and the hold notice). */
export const heldParagraph = (name: string, cohort: string) =>
  `**${name} has been assigned to the ${cohort} cohort**, and our system overrides ${name}’s age for Yalla Flex. When you book while signed in to your Family Portal, you’ll see vacancies for ${name}’s assigned room only. Once you and Team Yalla agree it’s time for ${name} to age up, we’ll release the override on your account.\n\nPlease always view availability while signed in to your Family Portal, so you see exactly what’s available for ${name}.\n\n`;
