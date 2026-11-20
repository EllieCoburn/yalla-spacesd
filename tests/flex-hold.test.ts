import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { flexEligibility } from "@/lib/booking/flex-hold";
import { createHold } from "@/lib/ops/bookings";
import { setFlexHold } from "@/lib/ops/families";
import { inviteToPortal } from "@/lib/family-auth";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

/** A child who is 14 months old a week from today: Saplings (12–19 months) by age. */
const birth14mo = () => {
  const d = new Date(`${addDaysISO(todayLA(), 7)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 14);
  return d.toISOString().slice(0, 10);
};

async function setup() {
  const flex = await program({ slug: "yalla-flex", name: "Yalla Flex", kind: "drop_in", priceCents: 15000 });
  const seedlings = await session(flex.id, { capacity: 4, minAgeMonths: 4, maxAgeMonths: 11, title: "Yalla Flex · Seedlings" });
  const saplings = await session(flex.id, { capacity: 4, minAgeMonths: 12, maxAgeMonths: 19, title: "Yalla Flex · Saplings" });
  const fam = await family("Lee", [{ first: "Mila", birth: birth14mo() }]);
  return { flex, seedlings, saplings, fam, child: fam.children[0] };
}

const book = (familyId: string, sessionId: string, childId: string, source: "public" | "admin" = "public") => createHold(db(), owner, { familyId, items: [{ sessionId, childId }], source });

describe("Yalla Flex cohort holds", () => {
  it("the rule: a held child fits their held cohort whatever their age, and no other Flex cohort", () => {
    const seedlingsAges = { min: 4, max: 11 };
    const saplingsAges = { min: 12, max: 19 };
    expect(flexEligibility({ isFlex: true, minAge: 4, ages: seedlingsAges, age: 14, hold: "seedlings" })).toEqual({ ok: true, held: true });
    expect(flexEligibility({ isFlex: true, minAge: 12, ages: saplingsAges, age: 14, hold: "seedlings" })).toMatchObject({ ok: false, reason: "held_elsewhere", heldIn: "Seedlings" });
    expect(flexEligibility({ isFlex: true, minAge: 12, ages: saplingsAges, age: 14, hold: null })).toEqual({ ok: true, held: false });
    expect(flexEligibility({ isFlex: true, minAge: 4, ages: seedlingsAges, age: 14, hold: null })).toMatchObject({ ok: false, reason: "age" });
    // Holds only touch Yalla Flex.
    expect(flexEligibility({ isFlex: false, minAge: 12, ages: saplingsAges, age: 14, hold: "seedlings" })).toEqual({ ok: true, held: false });
  });

  it("a held 14-month-old books Seedlings, can't book Saplings until staff release the hold", async () => {
    const { seedlings, saplings, fam, child } = await setup();

    // By age alone: Saplings yes, Seedlings no.
    await expect(book(fam.family.id, seedlings.id, child.id)).rejects.toThrow(/age range/);

    await setFlexHold(db(), owner, child.id, "seedlings");
    expect((await book(fam.family.id, seedlings.id, child.id)).booking).toBeTruthy();
    await expect(book(fam.family.id, saplings.id, child.id)).rejects.toThrow(/staying in Seedlings/);

    // Staff can still place a held child elsewhere if they need to.
    const saplingsLater = await session(saplings.programId, { capacity: 4, minAgeMonths: 12, maxAgeMonths: 19 }, 9);
    expect((await book(fam.family.id, saplingsLater.id, child.id, "admin")).booking).toBeTruthy();

    // Released: back to booking by age.
    await setFlexHold(db(), owner, child.id, null);
    const [c] = await db().select().from(s.children).where(eq(s.children.id, child.id));
    expect(c.flexHold).toBeNull();
    const saplings2 = await session(saplings.programId, { capacity: 4, minAgeMonths: 12, maxAgeMonths: 19 }, 8);
    expect((await book(fam.family.id, saplings2.id, child.id)).booking).toBeTruthy();
    const audits = await db().select().from(s.auditLog).where(eq(s.auditLog.entityId, child.id));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["family.flex_hold", "family.flex_hold_release"]));
  });

  it("refuses an unknown cohort, and the invitation says the child's place is kept", async () => {
    const { fam, child } = await setup();
    await expect(setFlexHold(db(), owner, child.id, "nursery")).rejects.toThrow(/Choose a Yalla Flex cohort/);
    await setFlexHold(db(), owner, child.id, "seedlings");
    await inviteToPortal(db(), owner, { email: fam.guardian.email, name: `${fam.guardian.firstName} ${fam.guardian.lastName}` }, "http://localhost");
    const [m] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "family_invite"));
    expect(m.body).toContain("kept their place in Seedlings for Yalla Flex");
    expect(m.body).toContain("Mila");
  });
});
