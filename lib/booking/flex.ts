/**
 * Yalla Flex fills vacancies in Yalla's core cohorts. Each weekday has one session per age group,
 * and every group is full until staff release a spot (Admin → Yalla Flex), for an absence or an
 * opening. A released spot can be booked as a full day (8:30am – 4:30pm) or a half day
 * (8:30am – 12:00pm); either uses the spot.
 */
export type FlexGroup = { key: string; cohort: string; label: string; minAge: number; maxAge: number; fullCents: number; halfCents: number };

export const FLEX_GROUPS: FlexGroup[] = [
  { key: "seedlings", cohort: "Seedlings", label: "4 – 12 months", minAge: 4, maxAge: 11, fullCents: 18000, halfCents: 9000 },
  { key: "saplings", cohort: "Saplings", label: "12 – 20 months", minAge: 12, maxAge: 19, fullCents: 16000, halfCents: 8000 },
  { key: "sprouts", cohort: "Sprouts", label: "20 – 35 months", minAge: 20, maxAge: 35, fullCents: 15000, halfCents: 7500 },
  { key: "wildflowers", cohort: "Wildflowers", label: "3 – 4 years", minAge: 36, maxAge: 59, fullCents: 15000, halfCents: 7500 },
];

export const FLEX_SLUG = "yalla-flex";
/** Cohorts need 30 minutes to prepare for a child, so booking closes at 8:00am (`bookBy`). */
export const FLEX_HOURS = { start: "08:30", end: "16:30", halfEnd: "12:00", bookBy: "08:00" };
/** The extra that turns a Flex booking into a half day. */
export const HALF_DAY = "half";
/** Early Bird care (8:00–8:30am), for children 12 months and older, on days staff open seats. */
export const EARLY_BIRD = "early";
export const EARLY_BIRD_MIN_AGE = 12;

/** The age group a Flex session belongs to, by its youngest age. */
export const flexGroupFor = (minAgeMonths: number | null | undefined) => FLEX_GROUPS.find((g) => g.minAge === minAgeMonths) ?? null;

export const flexTitle = (g: FlexGroup) => `Yalla Flex · ${g.label}`;

/** Weekly standing vacancies: spots per group for Monday–Friday (index 0 = Monday). */
export type WeeklyVacancies = Record<string, number[]>;
export const DEFAULT_WEEKLY: WeeklyVacancies = { seedlings: [0, 0, 0, 0, 0], saplings: [0, 0, 0, 0, 0], sprouts: [1, 1, 1, 1, 0], wildflowers: [0, 0, 0, 0, 0] };

export function parseWeekly(raw: unknown): WeeklyVacancies {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  const out: WeeklyVacancies = {};
  for (const g of FLEX_GROUPS) {
    const row = v && typeof v === "object" ? (v as Record<string, unknown>)[g.key] : undefined;
    out[g.key] = Array.from({ length: 5 }, (_, i) => {
      const n = Array.isArray(row) ? Number(row[i]) : (DEFAULT_WEEKLY[g.key]?.[i] ?? 0);
      return Number.isFinite(n) ? Math.max(0, Math.min(20, Math.floor(n))) : 0;
    });
  }
  return out;
}
