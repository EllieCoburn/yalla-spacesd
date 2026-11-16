/** The Family Handbook: content checks and "Ask the handbook". */
import { describe, expect, it } from "vitest";
import { HANDBOOK, HANDBOOK_PROGRAMS, HANDBOOK_SECTIONS } from "@/content/handbook";
import { answer, buildIndex } from "@/lib/handbook/search";
import { submitEnquiry } from "@/lib/ops/enquiries";
import * as s from "@/lib/db/schema";
import { db, reset } from "./helpers";

const index = buildIndex(HANDBOOK_SECTIONS);
const found = (q: string, program: Parameters<typeof answer>[2] = null) => {
  const a = answer(index, q, program);
  return a.found ? a.best.entry.id : null;
};

describe("Family Handbook content", () => {
  it("has unique section ids and follows Yalla's language guide", () => {
    const ids = HANDBOOK_SECTIONS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    // What families read (the hidden "ask" hints may use everyday words like "teacher", to help search).
    const all = JSON.stringify(HANDBOOK_SECTIONS.map(({ ask: _ask, ...rest }) => rest).concat(HANDBOOK.map((c) => ({ title: c.title, blurb: c.blurb })) as never));
    expect(JSON.stringify(HANDBOOK)).not.toMatch(/classroom|daycare|(?<![-\w])day ?care\b|school|students|teacher/i);
    // Website policies win over the PDF where they disagree.
    expect(all).toContain("$10 is charged for each additional 10 minutes");
    expect(all).not.toMatch(/\$20 for each additional ten minutes/);
    expect(all).toContain("619.775.4008");
    expect(all).not.toContain("876-1089");
    // No one is named: roles change, and the leadership team handles concerns.
    expect(all).not.toMatch(/Ellie|Coburn|Duenas|Sineokova|Madeline|Thorliefson|Munoz|Chavez|Kaufold|Karishma|Oropeza|Puentes|Hernandez|Kowal/);
  });

  it("only uses known programs, and every chapter has sections", () => {
    const keys = HANDBOOK_PROGRAMS.map((p) => p.key);
    for (const c of HANDBOOK) expect(c.sections.length).toBeGreaterThan(0);
    for (const x of HANDBOOK_SECTIONS) {
      for (const p of Object.keys(x.programs ?? {})) expect(keys).toContain(p);
      for (const p of x.appliesTo ?? []) expect(keys).toContain(p);
    }
  });
});

describe("Ask the handbook", () => {
  it("answers everyday questions with the right section", () => {
    expect(found("What time is nap?")).toBe("rest");
    expect(found("What if I'm late for pickup?")).toBe("departure");
    expect(found("Can you give my child Tylenol?")).toBe("medication");
    expect(found("My child has a fever, can they come?")).toBe("illness");
    expect(found("Are you open on Thanksgiving?")).toBe("closures");
    expect(found("Can grandma pick up?")).toBe("pickup-authorization");
    expect(found("Do I need to stay for camp?")).toBe("staying-onsite");
    expect(found("How do I cancel a Flex day?")).toBe("cancellations");
    expect(found("Where do I park?")).toBe("getting-here");
    expect(found("Is my child required to be potty trained?")).toBe("toileting");
  });

  it("says so when the handbook doesn't cover a question", () => {
    expect(found("Can I bring my dog?")).toBeNull();
    expect(found("Do you celebrate birthdays?")).toBeNull();
    expect(found("What's the wifi password?")).toBeNull();
    expect(found("Do you do swim lessons?")).toBeNull();
    expect(found("")).toBeNull();
  });

  it("includes the chosen program's note in the answer", () => {
    const a = answer(index, "Do I have to stay onsite?", "camp");
    expect(a.found).toBe(true);
    if (a.found) expect(a.excerpt.join(" ")).toMatch(/don’t need to stay onsite during camp/);
  });
});

describe("Questions for Team Yalla", () => {
  it("are saved to the inbox as handbook questions", async () => {
    await reset();
    await submitEnquiry(db(), { kind: "question", name: "Robin Example", email: "robin@example.com", details: [{ label: "Question", value: "Do you celebrate birthdays?" }], baseUrl: "http://test" });
    const [e] = await db().select().from(s.enquiries);
    expect(e.kind).toBe("question");
    expect(e.details[0].value).toBe("Do you celebrate birthdays?");
  });
});
