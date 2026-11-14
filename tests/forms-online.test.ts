/**
 * Online forms: questions with follow-ups, drawn initials and signatures, and requirements narrowed
 * by a child's age and the kinds of offering they're in.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { GuardianContext } from "@/lib/family-auth";
import { validateAnswers, type FormField } from "@/lib/forms/fields";
import { createHold } from "@/lib/ops/bookings";
import { addRequirement, createTemplate, paperworkStatus, publishVersion } from "@/lib/ops/forms";
import { familySignForm } from "@/lib/ops/public-booking";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const INK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const SUNSCREEN: FormField[] = [
  { id: "permission", type: "choice", label: "May Yalla staff apply sunscreen?", required: true, options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
  { id: "standards", type: "initials", label: "I’ll provide sunscreen that meets the standards.", required: true, showIf: { field: "permission", equals: "yes" } },
  { id: "allergy", type: "choice", label: "Allergies", required: true, options: [{ value: "none", label: "None" }, { value: "some", label: "Some" }] },
  { id: "allowed", type: "text", label: "Use only", required: true, showIf: { field: "allergy", equals: "some" } },
  { id: "instructions", type: "textarea", label: "Anything else?" },
  { id: "signature", type: "signature", label: "Signature" },
];

const ctx = (f: Awaited<ReturnType<typeof family>>): GuardianContext => ({
  sessionId: "t",
  guardianId: f.guardian.id,
  familyId: f.family.id,
  familyName: f.family.name,
  firstName: f.guardian.firstName,
  lastName: f.guardian.lastName,
  email: f.guardian.email,
  canBook: true,
  canViewBilling: true,
  canViewSensitive: true,
});

const birthMonthsAgo = (m: number) => addDaysISO(todayLA(), -Math.round(m * 30.44) - 3);

describe("Answers", () => {
  it("require follow-ups only when they apply, and need drawn initials and a signature", () => {
    expect(validateAnswers(SUNSCREEN, { permission: "no", allergy: "none", signature: INK })).toMatchObject({ ok: true });
    expect(validateAnswers(SUNSCREEN, { permission: "yes", allergy: "none", signature: INK })).toMatchObject({ ok: false, error: expect.stringMatching(/initials/) });
    expect(validateAnswers(SUNSCREEN, { permission: "no", allergy: "some", signature: INK })).toMatchObject({ ok: false, error: expect.stringMatching(/Use only/) });
    expect(validateAnswers(SUNSCREEN, { permission: "no", allergy: "none" })).toMatchObject({ ok: false, error: expect.stringMatching(/sign/) });
    expect(validateAnswers(SUNSCREEN, { permission: "no", allergy: "none", signature: "not-a-drawing" })).toMatchObject({ ok: false });
    // Answers to questions that no longer apply are dropped.
    const r = validateAnswers(SUNSCREEN, { permission: "no", allergy: "none", standards: INK, signature: INK });
    expect(r.ok && r.answers.standards).toBeFalsy();
  });
});

async function sunscreenForm() {
  const { template } = await createTemplate(db(), owner, { title: "Sunscreen permission", kind: "form", perChild: true, requiresSignature: true, frequency: "once", enforcement: "before_attendance", body: "Send SPF 30+." });
  await publishVersion(db(), owner, template.id, "Send SPF 30+.", true, true, SUNSCREEN);
  return template;
}

describe("Signing online", () => {
  it("saves answers and the drawn signature with the exact version signed", async () => {
    const t = await sunscreenForm();
    await addRequirement(db(), owner, { templateId: t.id, scope: "all" });
    const f = await family("Sun");
    const sub = await familySignForm(db(), ctx(f), {
      templateId: t.id,
      childId: f.children[0].id,
      signatureText: `${f.guardian.firstName} ${f.guardian.lastName}`,
      consent: true,
      answers: { permission: "yes", standards: INK, allergy: "none", signature: INK, instructions: "Before afternoon play" },
    });
    expect(sub.status).toBe("signed");
    expect((sub.data as { answers: Record<string, string> }).answers).toMatchObject({ permission: "yes", standards: INK, signature: INK });
    const status = await paperworkStatus(db(), { familyId: f.family.id, childIds: [f.children[0].id] });
    expect(status.get(f.children[0].id)![0].state).toBe("complete");
  });

  it("refuses a submission without the required initials", async () => {
    const t = await sunscreenForm();
    await addRequirement(db(), owner, { templateId: t.id, scope: "all" });
    const f = await family("NoInitials");
    await expect(
      familySignForm(db(), ctx(f), { templateId: t.id, childId: f.children[0].id, signatureText: "Pat Parent", consent: true, answers: { permission: "yes", allergy: "none", signature: INK } }),
    ).rejects.toThrow(/initials/);
  });
});

describe("Who a form is required for", () => {
  it("narrows by the child’s age", async () => {
    const t = await sunscreenForm();
    await addRequirement(db(), owner, { templateId: t.id, scope: "all", minAgeMonths: 24, maxAgeMonths: 71 });
    const f = await family("Ages", [
      { first: "Baby", birth: birthMonthsAgo(10) },
      { first: "Preschooler", birth: birthMonthsAgo(40) },
    ]);
    const status = await paperworkStatus(db(), { familyId: f.family.id, childIds: f.children.map((c) => c.id) });
    expect(status.get(f.children[0].id)).toHaveLength(0);
    expect(status.get(f.children[1].id)).toHaveLength(1);
  });

  it("narrows by what the child is enrolled in or booked for", async () => {
    const t = await sunscreenForm();
    await addRequirement(db(), owner, { templateId: t.id, scope: "all", programKinds: ["camp"] });
    const camp = await program({ kind: "camp", priceCents: 16000 });
    const flex = await program({ kind: "drop_in", priceCents: 15000 });
    const f = await family("Kinds", [
      { first: "Camper", birth: "2020-05-01" },
      { first: "Flexer", birth: "2023-05-01" },
    ]);
    await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: (await session(camp.id)).id, childId: f.children[0].id }], source: "admin", acknowledgePaperwork: true });
    await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: (await session(flex.id)).id, childId: f.children[1].id }], source: "admin", acknowledgePaperwork: true });
    const status = await paperworkStatus(db(), { familyId: f.family.id, childIds: f.children.map((c) => c.id) });
    expect(status.get(f.children[0].id)).toHaveLength(1);
    expect(status.get(f.children[1].id)).toHaveLength(0);
    // A family booking camp right now is asked for it too.
    const g = await family("New camper", [{ first: "Next", birth: "2021-01-01" }]);
    const during = await paperworkStatus(db(), { familyId: g.family.id, childIds: [g.children[0].id], programIds: [camp.id] });
    expect(during.get(g.children[0].id)).toHaveLength(1);
    const [req] = await db().select().from(s.formRequirements).where(eq(s.formRequirements.templateId, t.id));
    expect(req.programKinds).toEqual(["camp"]);
  });
});
