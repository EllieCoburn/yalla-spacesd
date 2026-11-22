/** Yalla Flex admission agreements: signed before the first Flex booking, kept on file for a year. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { adjustFlexSpots, ensureFlexDays } from "@/lib/ops/flex";
import { previewAgreements, submitPublicBooking, type PublicBookingInput } from "@/lib/ops/public-booking";
import { addDaysISO, todayLA, weekdayOf } from "@/lib/time";
import { db, owner, program, reset } from "./helpers";

beforeEach(reset);

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Runs the real agreements migration, so the tests check the content families will sign. */
async function loadAgreements() {
  for (const file of ["0030_flex_admission_agreements.sql", "0031_flex_agreement_intro.sql", "0032_flex_agreement_one_name.sql", "0033_flex_agreement_cohort_change.sql", "0034_flex_agreement_illness_link.sql", "0035_flex_agreement_handbook_link.sql"]) {
    const text = readFileSync(`lib/db/migrations/${file}`, "utf8");
    for (const stmt of text.split("--> statement-breakpoint")) {
      const body = stmt.replace(/^--.*$/gm, "").trim();
      if (body) await db().execute(sql.raw(body));
    }
  }
}

async function setup() {
  await program({ slug: "yalla-flex", kind: "drop_in", priceCents: 15000, minAgeMonths: 4, maxAgeMonths: 59, showRemaining: false, waitlistEnabled: false, lowAvailabilityThreshold: 0 });
  await loadAgreements();
  let monday = addDaysISO(todayLA(), 8);
  while (weekdayOf(monday) !== 1) monday = addDaysISO(monday, 1);
  await ensureFlexDays(db(), { from: monday, days: 14 });
  const rows = await db().select().from(s.sessions);
  const at = (date: string, minAge: number) => rows.find((r) => r.localDate === date && r.minAgeMonths === minAge)!;
  return { monday, at };
}

const input = (sessionId: string, over: Partial<PublicBookingInput> = {}): PublicBookingInput => ({
  guardian: { firstName: "Robin", lastName: "Flex", email: "robin.flex@example.com", phone: "619-555-0100" },
  children: [{ key: "a", firstName: "Pip", lastName: "Flex", birthDate: addDaysISO(todayLA(), -365 * 2 - 60), allergies: "", medications: "" }],
  lines: [{ sessionId, childKeys: ["a"] }],
  signatures: [],
  meta: {},
  baseUrl: "http://test",
  ...over,
});

const signed = (templateId: string) => ({
  templateId,
  childKey: "a",
  signatureText: "Robin Flex",
  consent: true,
  answers: { "init-rates": PNG, "init-onsite": PNG, "init-handbook": PNG, "read-understood": "yes", signature: PNG },
});

describe("Yalla Flex admission agreement", () => {
  it("asks for the age group's agreement, with corrected rates, initials and a signature", async () => {
    const { monday, at } = await setup();
    const toddler = at(monday, 24);
    const list = await previewAgreements(db(), { sessionIds: [toddler.id], children: [{ key: "a", firstName: "Pip", birthDate: addDaysISO(todayLA(), -365 * 2 - 60) }] });
    expect(list.map((a) => a.templateId)).toEqual(["flex-agreement-sprouts"]);
    const a = list[0];
    expect(a.validForMonths).toBe(12);
    expect(a.fields?.filter((f) => f.type === "initials")).toHaveLength(3);
    expect(a.fields?.filter((f) => f.type === "signature")).toHaveLength(1);
    expect(a.fields?.some((f) => f.id === "parent-name")).toBe(false);
    const text = JSON.stringify(a.fields);
    expect(text).toContain("when the Child moves to another Flex cohort or one year after signing, whichever comes first");
    expect(text).not.toContain("After one year, a new agreement");
    expect(text).toContain("[Illness Policy](/portal/illness-policy)");
    expect(text).toContain("[Yalla Family Handbook](/portal/handbook)");
    expect(text).toContain("$150 per day");
    expect(text).toContain("$75 per day");
    expect(text).toContain("$10 is charged for each additional ten minutes");
    expect(text).not.toMatch(/Brightwheel|classroom|students|\$20 per/);
    expect(a.body).toMatch(/^Please read this agreement carefully/);
    expect(a.fields?.find((f) => f.id === "read-understood")).toMatchObject({ label: expect.stringContaining("agree to the Sprouts Flex admission agreement. This agreement applies to any Sprouts Flex sessions I book") });

    // A 4-month-old sees the Seedlings agreement and its rates; a 4-year-old sees Wildflowers.
    const seed = await previewAgreements(db(), { sessionIds: [at(monday, 4).id], children: [{ key: "a", firstName: "Bea", birthDate: addDaysISO(todayLA(), -150) }] });
    expect(seed.map((x) => x.templateId)).toEqual(["flex-agreement-seedlings"]);
    expect(JSON.stringify(seed[0].fields)).toContain("$180 per day");
    expect(JSON.stringify(seed[0].fields)).toContain("not available to the Seedlings cohort");
    const wild = await previewAgreements(db(), { sessionIds: [at(monday, 36).id], children: [{ key: "a", firstName: "Wil", birthDate: addDaysISO(todayLA(), -365 * 4) }] });
    expect(wild.map((x) => x.templateId)).toEqual(["flex-agreement-wildflowers"]);
  });

  it("won't book (or take payment) until it's signed, then doesn't ask again for a year", async () => {
    const { monday, at } = await setup();
    const toddler = at(monday, 24);
    await adjustFlexSpots(db(), owner, toddler.id, 1);

    const unsigned = await submitPublicBooking(db(), input(toddler.id));
    expect(unsigned.ok).toBe(false);
    if (!unsigned.ok) expect(unsigned.code).toBe("agreements");
    expect(await db().select().from(s.payments)).toHaveLength(0);

    // Missing initials are refused.
    const partial = signed("flex-agreement-sprouts");
    const noInitials = await submitPublicBooking(db(), input(toddler.id, { signatures: [{ ...partial, answers: { ...partial.answers, "init-onsite": "" } }] }));
    expect(noInitials.ok).toBe(false);

    const ok = await submitPublicBooking(db(), input(toddler.id, { signatures: [signed("flex-agreement-sprouts")] }));
    expect(ok.ok).toBe(true);
    const [sub] = await db().select().from(s.formSubmissions).where(eq(s.formSubmissions.templateId, "flex-agreement-sprouts"));
    expect(sub.status).toBe("signed");
    expect(sub.expiresOn).toBe(addDaysISO(todayLA(), 365));
    expect((sub.data as { answers: Record<string, string> }).answers["read-understood"]).toBe("yes");
    expect(sub.signatureText).toBe("Robin Flex");

    // Signed in, the same child isn't asked again.
    const [g] = await db().select().from(s.guardians);
    const [child] = await db().select().from(s.children);
    const again = await previewAgreements(db(), { familyId: g.familyId, sessionIds: [at(addDaysISO(monday, 1), 24).id], children: [{ key: child.id, existingId: child.id, firstName: child.firstName }] });
    expect(again).toHaveLength(0);

    // A year later it has expired and must be signed again.
    await db().update(s.formSubmissions).set({ expiresOn: addDaysISO(todayLA(), -1) }).where(and(eq(s.formSubmissions.id, sub.id)));
    const expired = await previewAgreements(db(), { familyId: g.familyId, sessionIds: [at(addDaysISO(monday, 1), 24).id], children: [{ key: child.id, existingId: child.id, firstName: child.firstName }] });
    expect(expired.map((x) => x.templateId)).toEqual(["flex-agreement-sprouts"]);
  });
});
