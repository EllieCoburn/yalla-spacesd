import "server-only";

/**
 * 2026–2027 Membership & Care Rates, from Yalla's rate sheet.
 * Club Yalla tuition is shown in full on the Membership rates page.
 * Cohort tuition is listed per month; daily rates are Yalla Flex (drop-in) rates and are not shown there.
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
  daily: { full: number; half: number };
};

export const cohorts: Cohort[] = [
  {
    id: "seedlings",
    name: "Seedlings",
    ratio: "1:4",
    maxSize: 8,
    weekly: [
      [5, 2800, 1600],
      [4, 2600, 1300],
      [3, 2100, 1000],
      [2, 1400, 715],
      [1, 720, 370],
    ],
    daily: { full: 180, half: 90 },
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

/**
 * Yalla Flex (drop-in) age ranges by cohort. These apply to Flex only:
 * Club Yalla cohort ages differ and must not reuse these.
 */
export const flexAges: Record<Cohort["id"], string> = {
  seedlings: "3 – 12 months",
  saplings: "12 – 24 months",
  sprouts: "2 – 3 years",
  wildflowers: "3 – 5 years",
};

/** Early Bird care (8:00–8:30am), per day. */
export const earlyBirdDaily = 16;

export const fees = [
  { label: "One-time registration", amount: "$125", note: null },
  { label: "Annual materials", amount: "$175", note: "All members" },
  { label: "Early Bird care", amount: `$${earlyBirdDaily} / day`, note: hours.earlyBird },
];

/** Membership discounts, shown on the Membership rates page. */
export const discounts = [
  {
    label: "Sibling discount",
    amount: "10% off",
    note: "When siblings hold Club Yalla memberships, both memberships receive 10% off monthly tuition. At least one sibling must be actively enrolled.",
  },
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
