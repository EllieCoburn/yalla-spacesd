/** A second parent who can't see health details is never asked to re-answer them, and can't wipe them. */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { submitPublicBooking, type PublicBookingInput } from "@/lib/ops/public-booking";
import { db, family, program, reset, session } from "./helpers";

beforeEach(reset);

async function setup(onFile: { allergies: string | null; medicalNotes: string | null }) {
  const f = await family("TwoParents");
  const child = f.children[0];
  await db().update(s.children).set(onFile).where(eq(s.children.id, child.id));
  await db().update(s.guardians).set({ phone: "6195550100" }).where(eq(s.guardians.id, f.guardian.id));
  const p = await program();
  const sess = await session(p.id, { capacity: 5 });
  // A second parent: can book, can't see health details.
  const ctx = { sessionId: "x", guardianId: f.guardian.id, familyId: f.family.id, familyName: "", firstName: "Sam", lastName: "Second", email: f.guardian.email, canBook: true, canViewBilling: false, canViewSensitive: false, emailVerified: true, hasPassword: true };
  const book = (care: { allergies: string | null; medications: string | null }) =>
    submitPublicBooking(db(), {
      signedIn: ctx,
      guardian: { firstName: "", lastName: "", email: "" },
      children: [{ key: child.id, existingId: child.id, firstName: child.firstName, lastName: child.lastName, birthDate: child.birthDate, ...care }],
      lines: [{ sessionId: sess.id, childKeys: [child.id] }],
      signatures: [],
      meta: {},
      baseUrl: "http://localhost:3000",
    } as PublicBookingInput);
  const onRecord = async () => (await db().select().from(s.children).where(eq(s.children.id, child.id)))[0];
  return { book, onRecord };
}

describe("Health details and a second parent", () => {
  it("books without re-answering when answers are on file, and keeps them exactly", async () => {
    const { book, onRecord } = await setup({ allergies: "Peanuts (EpiPen in bag)", medicalNotes: "" });
    const r = await book({ allergies: null, medications: null });
    expect(r.ok).toBe(true);
    expect((await onRecord()).allergies).toBe("Peanuts (EpiPen in bag)");
  });

  it("never overwrites what's on file, even if answers are sent", async () => {
    const { book, onRecord } = await setup({ allergies: "Peanuts (EpiPen in bag)", medicalNotes: "" });
    expect((await book({ allergies: "", medications: "" })).ok).toBe(true);
    expect((await onRecord()).allergies).toBe("Peanuts (EpiPen in bag)");
  });

  it("asks when nothing is on file yet, and saves the first answers", async () => {
    const { book, onRecord } = await setup({ allergies: null, medicalNotes: null });
    expect((await book({ allergies: null, medications: null })).ok).toBe(false);
    expect((await book({ allergies: "Dairy", medications: "" })).ok).toBe(true);
    expect((await onRecord()).allergies).toBe("Dairy");
  });
});
