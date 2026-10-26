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
export const publicCohorts = [
  { name: "Seedlings", ratio: "1:4", maxSize: 8 },
  { name: "Saplings", ratio: "1:4", maxSize: 8 },
  { name: "Sprouts", ratio: "1:6", maxSize: 12 },
  { name: "Wildflowers", ratio: "1:8", maxSize: 12 },
];

export const membershipIncludes = [
  "Onsite childcare rooted in the Reggio Emilia and RIE approaches",
  "Credentialed, exceptional early childhood educators",
  "Communal coworking access",
  "High-speed internet",
  "Complimentary coffee and tea",
  "Light snacks",
  "Access to the coworking kitchen",
  "Unlimited color printing",
  "Private office and phone booth rental",
];
