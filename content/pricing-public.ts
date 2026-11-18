/**
 * Pricing that's safe to show publicly. Full rates live in content/tuition.ts.
 */

export const publicPricing = {
  tuitionFrom: "$275",
  tuitionFromNote: "a month",
  flexFrom: "$75",
  flexFromNote: "for a half day",
};

/** Cohorts as described publicly: small by design. */
/** Club Yalla cohorts. Ages are Club Yalla's own (not Yalla Flex's age groups). */
export const publicCohorts = [
  { name: "Seedlings", ages: "4 months to nearly 2 years", ratio: "1:4", maxSize: 8 },
  { name: "Saplings", ages: "11 months to about 2½ years", ratio: "1:4", maxSize: 8 },
  { name: "Sprouts", ages: "18 months to about 3½ years", ratio: "1:6", maxSize: 12 },
  { name: "Wildflowers", ages: "2½ years to age 5", ratio: "1:8", maxSize: 12 },
];

