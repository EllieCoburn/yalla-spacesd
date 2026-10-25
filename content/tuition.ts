/**
 * 2026–2027 Membership & Care Rates, from Yalla's rate sheet.
 * Cohort tuition is listed per month; daily rates are Yalla Flex (drop-in) rates.
 */

export const tuitionYear = "2026–2027";

export const hours = {
  full: "8:30am – 4:30pm",
  half: "8:30am – 12:00pm",
  earlyBird: "8:00am – 8:30am",
};

export type Cohort = {
  id: string;
  name: string;
  ratio: string;
  maxSize: number;
  /** Shown above the table, e.g. when a different year's pricing applies. */
  note?: string;
  /** [days per week, full day, half day] */
  weekly: [number, number, number][];
  daily: { full: number; half: number } | null;
};

export const cohorts: Cohort[] = [
  {
    id: "seedlings",
    name: "Seedlings",
    ratio: "1:4",
    maxSize: 8,
    note: "Our 2026–2027 Seedlings cohort is full. Rates shown are for 2027–2028.",
    weekly: [
      [5, 2800, 1600],
      [4, 2600, 1300],
      [3, 2100, 1000],
      [2, 1400, 715],
      [1, 720, 370],
    ],
    daily: null,
  },
  {
    id: "saplings",
    name: "Saplings",
    ratio: "1:4",
    maxSize: 8,
    weekly: [
      [5, 2700, 1350],
      [4, 2425, 1215],
      [3, 2080, 1040],
      [2, 1400, 700],
      [1, 720, 360],
    ],
    daily: { full: 160, half: 80 },
  },
  {
    id: "sprouts",
    name: "Sprouts",
    ratio: "1:6",
    maxSize: 12,
    weekly: [
      [5, 2400, 1200],
      [4, 2250, 1125],
      [3, 1820, 910],
      [2, 1250, 625],
      [1, 630, 315],
    ],
    daily: { full: 150, half: 75 },
  },
  {
    id: "wildflowers",
    name: "Wildflowers",
    ratio: "1:8",
    maxSize: 12,
    weekly: [
      [5, 2100, 1050],
      [4, 1975, 985],
      [3, 1500, 750],
      [2, 1000, 500],
      [1, 550, 275],
    ],
    daily: { full: 150, half: 75 },
  },
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

export const fees = [
  { label: "One-time registration", amount: "$125", note: "Not charged for drop-in (daily rate) care" },
  { label: "Annual materials", amount: "$175", note: "All members" },
  { label: "Early Bird care", amount: "$16 / day", note: hours.earlyBird },
];

export const workspace = [
  {
    name: "Private Desk",
    rates: [
      ["Monthly", "$550"],
      ["Weekly", "$150"],
      ["Daily", "$35"],
    ],
  },
  {
    name: "Private Office",
    rates: [
      ["Monthly", "$950 – $1,100"],
      ["Weekly", "$270"],
      ["Daily", "$55"],
      ["Half day", "$30"],
    ],
  },
] as const;

export const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
