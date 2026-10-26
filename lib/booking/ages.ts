/** The age range that applies to a session: its own age group if it has one, otherwise the program's. */
export function sessionAges(
  session: { minAgeMonths: number | null; maxAgeMonths: number | null },
  program: { minAgeMonths: number | null; maxAgeMonths: number | null },
): { min: number | null; max: number | null } {
  const grouped = session.minAgeMonths != null || session.maxAgeMonths != null;
  return grouped ? { min: session.minAgeMonths, max: session.maxAgeMonths } : { min: program.minAgeMonths, max: program.maxAgeMonths };
}

export const ageFits = (age: number, r: { min: number | null; max: number | null }) => (r.min == null || age >= r.min) && (r.max == null || age <= r.max);
