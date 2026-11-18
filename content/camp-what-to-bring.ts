/**
 * What to bring for Camp Yalla, by camp age group (from the Family Handbook's camp packing list).
 * Private: shown only in the Family Portal and in the Camp Yalla first-day welcome email.
 *
 * Every group brings the same everyday items. The 18 months – 3 years group also brings rest time
 * items and, if needed, diapers or pull-ups and wipes. Everything goes home at the end of each day.
 */
import type { BringList, BringSection } from "./flex-what-to-bring";

export type CampGroup = { key: string; label: string; minAge: number; maxAge: number };

/** Camp's three age groups, matched by the session's minimum age (months). */
export const CAMP_GROUPS: CampGroup[] = [
  { key: "little", label: "18 months – 3 years", minAge: 18, maxAge: 47 },
  { key: "middle", label: "4 – 7 years", minAge: 48, maxAge: 95 },
  { key: "older", label: "8 – 10 years", minAge: 96, maxAge: 131 },
];

export function campGroupFor(minAgeMonths: number | null | undefined): CampGroup | null {
  if (minAgeMonths == null) return null;
  return CAMP_GROUPS.find((g) => minAgeMonths >= g.minAge && minAgeMonths <= g.maxAge) ?? null;
}

/** Yalla provides snacks; families pack lunch (Family Handbook). */
export const CAMP_FOOD_NOTE = "Yalla provides a morning snack and a light afternoon snack. Yalla is nut-free, so please pack a lunch without nuts.";

const DAILY: BringSection = {
  key: "daily",
  title: "Pack each day",
  items: [
    { text: "A packed lunch", detail: CAMP_FOOD_NOTE, short: "Packed lunch" },
    { text: "Water bottle", detail: "Clearly labeled.", short: "Water bottle" },
  ],
};
const SUN: BringSection = {
  key: "sun",
  title: "Sun and layers",
  items: [
    { text: "Sunscreen", short: "Sunscreen" },
    { text: "Sunhat", short: "Sunhat" },
    { text: "Light jacket", short: "Light jacket" },
  ],
};
const CLOTHES: BringSection = { key: "clothes", title: "Extra clothes", items: [{ text: "A change of clothes", short: "A change of clothes" }] };
const CARE: BringSection = {
  key: "care",
  title: "Diapering",
  note: "If your child needs them.",
  items: [
    { text: "Diapers or pull-ups", short: "Diapers or pull-ups (if needed)" },
    { text: "Wipes", short: "Wipes (if needed)" },
  ],
};
const REST: BringSection = {
  key: "rest",
  title: "Rest time items",
  items: [
    { text: "A sheet", short: "A sheet" },
    { text: "A light blanket", short: "A light blanket" },
  ],
};
const LABELING = "Please ensure all items are clearly labeled with your child’s name.";
const DO_NOT_BRING = ["Toys from home", "Electronics"];

export const CAMP_WHAT_TO_BRING: Record<string, BringList> = {
  little: { cohort: "18 months – 3 years", sections: [DAILY, SUN, CLOTHES, CARE, REST], labeling: LABELING, doNotBring: DO_NOT_BRING },
  middle: { cohort: "4 – 7 years", sections: [DAILY, SUN, CLOTHES], labeling: LABELING, doNotBring: DO_NOT_BRING },
  older: { cohort: "8 – 10 years", sections: [DAILY, SUN, CLOTHES], labeling: LABELING, doNotBring: DO_NOT_BRING },
};

export const campWhatToBring = (groupKey: string): BringList | null => CAMP_WHAT_TO_BRING[groupKey] ?? null;
