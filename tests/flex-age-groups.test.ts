/** Yalla Flex age groups (Nov 2026): 4–14 months, 14–23 months, 24–35 months, 3–4 years. */
import { describe, expect, it } from "vitest";
import { FLEX_GROUPS, flexGroupFor } from "@/lib/booking/flex";
import { ageFits } from "@/lib/booking/ages";

const groupForAge = (months: number) => FLEX_GROUPS.find((g) => ageFits(months, { min: g.minAge, max: g.maxAge }))?.key ?? null;

describe("Flex age groups", () => {
  it("every age from 4 months to the 5th birthday has exactly one group, with no gaps", () => {
    expect(FLEX_GROUPS.map((g) => [g.key, g.label, g.minAge, g.maxAge])).toEqual([
      ["seedlings", "4 – 14 months", 4, 13],
      ["saplings", "14 – 23 months", 14, 23],
      ["sprouts", "24 – 35 months", 24, 35],
      ["wildflowers", "3 – 4 years", 36, 59],
    ]);
    for (let m = 4; m <= 59; m++) expect(FLEX_GROUPS.filter((g) => ageFits(m, { min: g.minAge, max: g.maxAge }))).toHaveLength(1);
    expect([3, 13, 14, 23, 24, 35, 36, 59, 60].map(groupForAge)).toEqual([null, "seedlings", "saplings", "saplings", "sprouts", "sprouts", "wildflowers", "wildflowers", null]);
  });

  it("past sessions under the old starting ages still map to the right group", () => {
    expect(flexGroupFor(4)?.key).toBe("seedlings");
    expect(flexGroupFor(12)?.key).toBe("saplings");
    expect(flexGroupFor(14)?.key).toBe("saplings");
    expect(flexGroupFor(20)?.key).toBe("sprouts");
    expect(flexGroupFor(24)?.key).toBe("sprouts");
    expect(flexGroupFor(36)?.key).toBe("wildflowers");
    expect(flexGroupFor(7)).toBeNull();
  });
});
