/**
 * What to bring for Yalla Flex, by cohort (from Yalla's "What to Bring" lists). Private: shown only
 * in the Family Portal and in the Flex first-day welcome email, never on public pages.
 *
 * Flex is booked day by day, so everything travels back and forth each day (nothing is left at
 * Yalla). A family booked for a week or more in a row may leave the extra clothes, rest time items
 * and care supplies at Yalla for the week (see WEEK_BLOCK_NOTE).
 *
 * Half days: Saplings, Sprouts and Wildflowers leave the rest time items at home. Seedlings bring
 * theirs every day, since they're likely to rest in the morning too.
 */
export type BringItem = { text: string; detail?: string; /** A few words for the email. */ short: string };
export type BringSection = { key: string; title: string; note?: string; items: BringItem[]; /** Left at home on half days (not Seedlings). */ restTime?: boolean };
export type BringList = { cohort: string; sections: BringSection[]; labeling: string; doNotBring: string[] };

const MEALS_NOTE =
  "Please prepare all meals using best practices for safe food consumption according to your child’s developmental readiness. If needed, refer to the free Guided Solids Experience feature of the Solid Starts App for support in preparing safe meals.";
const CARE: BringSection = {
  key: "care",
  title: "Diapering and sun care",
  items: [
    { text: "Diapers", short: "Diapers" },
    { text: "Wipes", short: "Wipes" },
    { text: "Sunscreen", short: "Sunscreen" },
    { text: "Diaper rash cream", short: "Diaper rash cream" },
  ],
};
const LABELING = "Please ensure all items are clearly labeled with your child’s name.";
const lunch: BringItem = { text: "Lunch", detail: "Nutritious and packed in containers that can be plated and reheated if needed. " + MEALS_NOTE, short: "Lunch" };
const outerwear: BringItem = { text: "Weather-appropriate outerwear", detail: "Jacket, sweater, or sun hat depending on the season.", short: "Weather-appropriate outerwear" };
const playShoes: BringItem = { text: "Shoes", detail: "Closed-toe and suitable for exposure to outdoor play, mud, water and paint.", short: "Closed-toe shoes" };
const waterBottle: BringItem = { text: "Water bottle", detail: "Spill-proof and clearly labeled.", short: "Water bottle" };
/** A day of Flex needs one or two spare outfits (Club Yalla, a full week at Yalla, keeps more). */
const extraOutfits: BringItem = {
  text: "1–2 complete extra outfits, including socks",
  detail: "Include underwear if your child wears it, packed in a labeled zip bag. Soiled clothes are sent home in a bag.",
  short: "1–2 extra outfits",
};
/** For families booked a week or more in a row (Yalla's weekly routine for items that stay). */
export const WEEK_BLOCK_NOTE =
  "Booked for a week or more in a row? The extra clothes, rest time items and diapering supplies can stay at Yalla during your block. Please take them home at the end of each week to wash, and your child’s care team will let you know when supplies run low.";

export const WHAT_TO_BRING: Record<string, BringList> = {
  seedlings: {
    cohort: "Seedlings",
    sections: [
      {
        key: "daily",
        title: "Pack each day",
        items: [
          { text: "Bottles, if applicable", detail: "Premade and ready to be heated and served.", short: "Bottles (if applicable)" },
          { text: "AM snack, PM snack and lunch", detail: "Nutritious and packed in containers that can be plated, stored in the fridge and reheated if needed. " + MEALS_NOTE, short: "AM snack, PM snack and lunch" },
          { text: "Shoes", detail: "Closed-toe and suitable for outdoor play. Only necessary for children who are walking.", short: "Shoes (if walking)" },
          { text: "Water cup", detail: "Spill-proof and clearly labeled.", short: "Water cup" },
          { text: "Milk cup, if applicable", detail: "Spill-proof and clearly labeled. Served at meal and snack time only.", short: "Milk cup (if applicable)" },
          { text: "Pacifiers, if applicable", short: "Pacifiers (if applicable)" },
        ],
      },
      CARE,
      {
        key: "clothes",
        title: "Extra clothes and layers",
        items: [
          extraOutfits,
          { text: "Zip-up jacket or sweater", short: "Zip-up jacket or sweater" },
          { text: "Sun hat", short: "Sun hat" },
        ],
      },
      {
        key: "rest",
        title: "Rest time items",
        items: [
          { text: "Crib-sized fitted sheet", short: "Crib-sized fitted sheet" },
          { text: "Light blanket or sleep sack", detail: "Sleep sack only for crib sleepers.", short: "Light blanket or sleep sack" },
        ],
      },
    ],
    labeling: LABELING,
    doNotBring: ["Pillows or thick blankets", "Stuffed animals or lovies", "Toys from home of any kind (unless prearranged or for a special occasion)", "Clothing items or accessories that cannot be stained or easily replaced"],
  },
  saplings: {
    cohort: "Saplings",
    sections: [
      {
        key: "daily",
        title: "Pack each day",
        items: [{ text: "Tote bag or backpack", detail: "To carry everything to and from Yalla each day.", short: "Tote bag or backpack" }, lunch, playShoes, waterBottle, outerwear],
      },
      CARE,
      {
        key: "clothes",
        title: "Extra clothes and layers",
        items: [extraOutfits, { text: "Zip-up jacket or sweater", short: "Zip-up jacket or sweater" }, { text: "Sun hat", short: "Sun hat" }],
      },
      {
        key: "rest",
        title: "Rest time items",
        restTime: true,
        items: [
          { text: "Crib-sized fitted sheet", short: "Crib-sized fitted sheet" },
          { text: "Light blanket or sleep sack", short: "Light blanket or sleep sack" },
          { text: "Milk bottle or cup, if applicable", short: "Milk bottle or cup (if applicable)" },
          { text: "Pacifier, if applicable", short: "Pacifier (if applicable)" },
        ],
      },
    ],
    labeling: LABELING,
    doNotBring: ["Clothing items or accessories that cannot be stained or easily replaced", "Stuffed animals or lovies", "Toys from home of any kind (unless prearranged or for a special occasion)"],
  },
  sprouts: {
    cohort: "Sprouts",
    sections: [
      {
        key: "daily",
        title: "Pack each day",
        items: [{ text: "Tote bag or backpack", detail: "To carry everything to and from Yalla each day.", short: "Tote bag or backpack" }, lunch, playShoes, waterBottle, outerwear],
      },
      CARE,
      {
        key: "clothes",
        title: "Extra clothes and layers",
        items: [extraOutfits, { text: "Zip-up jacket or sweater", short: "Zip-up jacket or sweater" }, { text: "Sun hat", short: "Sun hat" }],
      },
      {
        key: "rest",
        title: "Rest time items",
        restTime: true,
        items: [
          { text: "Crib-sized fitted sheet", short: "Crib-sized fitted sheet" },
          { text: "Light blanket", short: "Light blanket" },
        ],
      },
    ],
    labeling: LABELING,
    doNotBring: ["Clothing items or accessories that cannot be stained or easily replaced", "Stuffed animals or lovies", "Sleep sacks", "Milk bottles", "Toys from home of any kind (unless prearranged or for a special occasion)"],
  },
  wildflowers: {
    cohort: "Wildflowers",
    sections: [
      {
        key: "daily",
        title: "Pack each day",
        items: [{ text: "Backpack or tote bag", detail: "Large enough to fit all daily items, labeled with your child’s name.", short: "Backpack or tote bag" }, lunch, playShoes, waterBottle, outerwear],
      },
      CARE,
      {
        key: "clothes",
        title: "Extra clothes and layers",
        items: [
          extraOutfits,
          { text: "Zip-up jacket or sweater", short: "Zip-up jacket or sweater" },
          { text: "Sun hat", short: "Sun hat" },
        ],
      },
      {
        key: "rest",
        title: "Rest time items",
        restTime: true,
        items: [
          { text: "Crib-sized fitted sheet", short: "Crib-sized fitted sheet" },
          { text: "Light blanket", short: "Light blanket" },
          { text: "Small pillow, if your child would like", short: "Small pillow (optional)" },
        ],
      },
    ],
    labeling: LABELING,
    doNotBring: ["Clothing items or accessories that cannot be stained or easily replaced", "Stuffed animals or lovies", "Sleep sacks", "Toys from home of any kind (unless prearranged or for a special occasion)"],
  },
};

/** The list for a cohort and day length: half days skip rest time items (except Seedlings, who have none to skip). */
export function whatToBring(cohortKey: string, half: boolean): BringList | null {
  const list = WHAT_TO_BRING[cohortKey];
  if (!list) return null;
  return { ...list, sections: list.sections.filter((s) => !(half && s.restTime)) };
}

/** True when a half day leaves something at home for this cohort (so the page can say so). */
export const halfDaySkipsRest = (cohortKey: string) => !!WHAT_TO_BRING[cohortKey]?.sections.some((s) => s.restTime);
