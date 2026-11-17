/** Each team member gets only the emails chosen for them, and Flex cohort teams hear about their drop-ins. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { staffCancelBooking } from "@/lib/ops/yalla-cancellations";
import { setPolicy } from "@/lib/ops/settings";
import { setStaffNotices, teamRecipients, upcomingDropIns } from "@/lib/ops/team-notices";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

async function person(email: string, roleKey = "operations", status = "active") {
  const [role] = await db().select().from(s.roles).where(eq(s.roles.key, roleKey));
  const [u] = await db().insert(s.staffUsers).values({ email, name: email.split("@")[0], roleId: role.id, status }).returning();
  return u;
}

async function book(sessionId: string, childId: string, familyId: string, addons: string[] = []) {
  const hold = await createHold(db(), owner, { familyId, items: [{ sessionId, childId, addons }], source: "admin", acknowledgePaperwork: true });
  await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
  return hold.booking;
}

const sent = (key: string) => db().select().from(s.messages).where(eq(s.messages.templateKey, key));

describe("Who gets which team emails", () => {
  it("each person gets only the topics turned on for them; shared inboxes still get everything", async () => {
    await setPolicy(db(), owner, "notifications.staffEmails", "hello@yalla.test, club.director@yalla.test");
    const club = await person("club.director@yalla.test");
    const camp = await person("camp.director@yalla.test");
    const gone = await person("former@yalla.test", "operations", "disabled");
    await setStaffNotices(db(), owner, club.id, { notices: ["club", "enquiries"], flexCohorts: [] });
    await setStaffNotices(db(), owner, camp.id, { notices: ["camp"], flexCohorts: [] });
    await setStaffNotices(db(), owner, gone.id, { notices: ["camp", "after_hours"], flexCohorts: [] });

    // The Club Yalla director's address is on the shared list, but their own choices win.
    expect((await teamRecipients(db(), "after_hours")).sort()).toEqual(["hello@yalla.test"]);
    expect((await teamRecipients(db(), "camp")).sort()).toEqual(["camp.director@yalla.test", "hello@yalla.test"]);
    expect((await teamRecipients(db(), "flex")).sort()).toEqual(["hello@yalla.test"]);
    expect(await teamRecipients(db(), "club")).toContain("club.director@yalla.test");

    // A real camp booking: the camp director hears about it; the Club Yalla director doesn't.
    const p = await program({ kind: "camp", name: "Camp Yalla" });
    const sess = await session(p.id, { capacity: 8 });
    const f = await family("Doe");
    await book(sess.id, f.children[0].id, f.family.id);
    const notices = await sent("staff_new_booking");
    expect(notices.map((m) => m.toAddress).sort()).toEqual(["camp.director@yalla.test", "hello@yalla.test"]);

    // An After Hours booking reaches neither director.
    const ah = await program({ kind: "parents_night", name: "After Hours Evenings" });
    const evening = await session(ah.id, { capacity: 8 }, 3, "17:30", "21:00");
    await book(evening.id, f.children[0].id, f.family.id);
    const all = await sent("staff_new_booking");
    expect(all.filter((m) => m.toAddress.includes("director"))).toHaveLength(1);
  });

  it("ignores unknown topics and cohorts", async () => {
    const u = await person("someone@yalla.test");
    const saved = await setStaffNotices(db(), owner, u.id, { notices: ["flex", "nonsense"], flexCohorts: ["wildflowers", "moon"] });
    expect(saved.notices).toEqual(["flex"]);
    expect(saved.flexCohorts).toEqual(["wildflowers"]);
  });
});

describe("Flex drop-in emails to the cohort's team", () => {
  async function setup() {
    await setPolicy(db(), owner, "notifications.staffEmails", "hello@yalla.test");
    const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex" });
    const wild = await session(flex.id, { capacity: 2, minAgeMonths: 36, maxAgeMonths: 59, title: "Yalla Flex · 3 – 4 years" }, 1);
    const later = await session(flex.id, { capacity: 2, minAgeMonths: 36, maxAgeMonths: 59, title: "Yalla Flex · 3 – 4 years" }, 9);
    const sprouts = await session(flex.id, { capacity: 2, minAgeMonths: 20, maxAgeMonths: 35, title: "Yalla Flex · 20 – 35 months" }, 1);
    const wf = await person("wildflowers.guide@yalla.test", "cohort_team");
    const sp = await person("sprouts.guide@yalla.test", "cohort_team");
    await setStaffNotices(db(), owner, wf.id, { notices: [], flexCohorts: ["wildflowers"] });
    await setStaffNotices(db(), owner, sp.id, { notices: [], flexCohorts: ["sprouts"] });
    const f = await family("Doe", [{ first: "Jane", birth: addDaysISO(todayLA(), -365 * 3 - 60) }]);
    return { wild, later, sprouts, f };
  }

  it("says who's coming, when, for how long, whether they're new, and their allergies and medication", async () => {
    const { wild, later, f } = await setup();
    await book(wild.id, f.children[0].id, f.family.id);
    const [m, ...rest] = await sent("cohort_drop_in");
    expect(rest).toHaveLength(0);
    expect(m.toAddress).toBe("wildflowers.guide@yalla.test");
    expect(m.subject).toBe(`Drop-in tomorrow: Jane ${f.children[0].lastName} · Wildflowers`);
    expect(m.body).toContain("Hi Wildflower team,");
    expect(m.body).toContain(`Jane ${f.children[0].lastName} will drop into Wildflowers tomorrow for a full day (8:30am–4:30pm).`);
    expect(m.body).toContain("This is a new Flex friend.");
    expect(m.body).toContain("Jane has no known allergies and takes no known medication.");
    // The team inbox gets the usual booking notice; the cohort team gets nothing else.
    expect((await sent("staff_new_booking")).map((x) => x.toAddress)).toEqual(["hello@yalla.test"]);

    // Next time she's a returning friend, with a half day and what the family told us.
    await db().update(s.children).set({ allergies: "Peanuts", medicalNotes: "Inhaler as needed" }).where(eq(s.children.id, f.children[0].id));
    await book(later.id, f.children[0].id, f.family.id, ["half"]);
    const second = (await sent("cohort_drop_in")).find((x) => x.id !== m.id)!;
    expect(second.body).toContain("for a half day (8:30am–12:00pm).");
    expect(second.body).toContain("We have a returning Flex friend.");
    expect(second.body).toContain("Allergies: Peanuts");
    expect(second.body).toContain("Medication and medical notes: Inhaler as needed");
  });

  it("only the right cohort hears, and hears again if it's cancelled", async () => {
    const { sprouts, f } = await setup();
    const kid = (await db().insert(s.children).values({ familyId: f.family.id, firstName: "Max", lastName: "Doe", birthDate: addDaysISO(todayLA(), -700) }).returning())[0];
    const b = await book(sprouts.id, kid.id, f.family.id);
    expect((await sent("cohort_drop_in")).map((x) => x.toAddress)).toEqual(["sprouts.guide@yalla.test"]);

    await staffCancelBooking(db(), owner, { bookingId: b.id, reason: "Family asked", notify: false, mode: "family_none" });
    const [c] = await sent("cohort_drop_in_cancelled");
    expect(c.toAddress).toBe("sprouts.guide@yalla.test");
    expect(c.body).toContain("Max Doe won’t be dropping into Sprouts tomorrow after all.");
  });

  it("the drop-ins page lists only the person's own cohort", async () => {
    const { wild, sprouts, f } = await setup();
    const kid = (await db().insert(s.children).values({ familyId: f.family.id, firstName: "Max", lastName: "Doe", birthDate: addDaysISO(todayLA(), -700) }).returning())[0];
    await book(wild.id, f.children[0].id, f.family.id);
    await book(sprouts.id, kid.id, f.family.id);
    const mine = await upcomingDropIns(db(), { cohorts: ["wildflowers"] });
    expect(mine.map((r) => [r.child.firstName, r.cohort.cohort, r.isNew])).toEqual([["Jane", "Wildflowers", true]]);
    expect(await upcomingDropIns(db(), { cohorts: [] })).toEqual([]);
    expect((await upcomingDropIns(db(), { cohorts: null })).map((r) => r.child.firstName).sort()).toEqual(["Jane", "Max"]);
  });
});
