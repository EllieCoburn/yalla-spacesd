/** Yalla Flex what-to-bring lists: one per cohort; half days leave rest time items at home (not Seedlings). */
import { describe, expect, it } from "vitest";
import { WHAT_TO_BRING, whatToBring } from "@/content/flex-what-to-bring";
import { FLEX_GROUPS } from "@/lib/booking/flex";
import { whatToBringBlocks, type WelcomeChild } from "@/lib/ops/flex-welcome";

const kid = (name: string, key: string, half: boolean): WelcomeChild => ({ childId: name, name, cohort: FLEX_GROUPS.find((g) => g.key === key)!, half, arrives: "8:30am", pickup: half ? "12:00pm" : "4:30pm" });

describe("What to bring", () => {
  it("has a list for every Flex cohort", () => {
    for (const g of FLEX_GROUPS) expect(WHAT_TO_BRING[g.key]?.cohort).toBe(g.cohort);
  });

  it("drops rest time items on half days for Saplings, Sprouts and Wildflowers, but not Seedlings", () => {
    for (const key of ["saplings", "sprouts", "wildflowers"]) {
      expect(whatToBring(key, false)!.sections.some((s) => s.key === "rest")).toBe(true);
      expect(whatToBring(key, true)!.sections.some((s) => s.key === "rest")).toBe(false);
    }
    // Seedlings keep their sheet and blanket or sleep sack either way.
    const half = JSON.stringify(whatToBring("seedlings", true));
    expect(half).toContain("Crib-sized fitted sheet");
    expect(half).toContain("Light blanket or sleep sack");
    expect(half).toBe(JSON.stringify(whatToBring("seedlings", false)));
  });

  it("uses Yalla's words (no 'teacher', 'nap' or 'school')", () => {
    const all = JSON.stringify(WHAT_TO_BRING);
    expect(all).not.toMatch(/teach|\bnap|school|classroom|daycare/i);
  });

  it("puts a card per cohort and day length in the first-day email, with a link to the full list", () => {
    const blocks = whatToBringBlocks([kid("Ava", "wildflowers", true), kid("Leo", "sprouts", false), kid("Mia", "sprouts", false)], "https://yalla.test");
    const text = blocks.join("\n\n");
    expect(text).toContain("### What to bring for Ava · Wildflowers, half day");
    expect(text).toContain("### What to bring for Leo and Mia · Sprouts, full day");
    // Ava's half day has no rest time line; the Sprouts full day does.
    const ava = blocks.find((b) => b.includes("for Ava"))!;
    const sprouts = blocks.find((b) => b.includes("Leo and Mia"))!;
    expect(ava).not.toContain("Rest time:");
    expect(sprouts).toContain("Rest time: Crib-sized fitted sheet, Light blanket");
    expect(text).toContain("](https://yalla.test/portal/what-to-bring)");
  });
});
