/** The Yalla Flex first-day welcome: once per family, on the morning of their first visit. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { setPolicy } from "@/lib/ops/settings";
import { sendFlexWelcomes } from "@/lib/ops/flex-welcome";
import { runHousekeeping } from "@/lib/jobs";
import { safeNextPath } from "@/lib/family-auth";
import { emailHtml } from "@/lib/notify/html";
import { addDaysISO, todayLA, zonedDateTime } from "@/lib/time";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

// The first visit is tomorrow; "now" is 6:00am that morning in San Diego.
const day = () => addDaysISO(todayLA(), 1);
const morning = () => zonedDateTime(day(), "06:00");
const GROUP = { seedlings: [4, 11], saplings: [12, 19], sprouts: [20, 35], wildflowers: [36, 59] } as const;
type Cohort = keyof typeof GROUP;

async function setup() {
  const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex" });
  const sessions = {} as Record<Cohort, typeof s.sessions.$inferSelect>;
  for (const k of Object.keys(GROUP) as Cohort[]) sessions[k] = await session(flex.id, { capacity: 4, minAgeMonths: GROUP[k][0], maxAgeMonths: GROUP[k][1] }, 1);
  const [f] = await db().insert(s.families).values({ name: "Rivera family" }).returning();
  await db().insert(s.guardians).values({ familyId: f.id, firstName: "Jordan", lastName: "Rivera", email: "jordan.rivera@example.com", isPrimary: true, portalAccess: true });
  await db().insert(s.guardians).values({ familyId: f.id, firstName: "Sam", lastName: "Rivera", email: "sam.rivera@example.com", isPrimary: false, portalAccess: true });
  return { flex, sessions, familyId: f.id };
}

async function child(familyId: string, first: string, cohort: Cohort, preferred: string | null = null) {
  const months = Math.round((GROUP[cohort][0] + GROUP[cohort][1]) / 2);
  const [c] = await db().insert(s.children).values({ familyId, firstName: first, preferredName: preferred, lastName: "Rivera", birthDate: addDaysISO(day(), -Math.round(months * 30.44)) }).returning();
  return c;
}

async function book(familyId: string, items: { sessionId: string; childId: string; addons?: string[] }[]) {
  const hold = await createHold(db(), owner, { familyId, items, source: "admin", acknowledgePaperwork: true });
  await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
  return hold.booking;
}

const welcomes = () => db().select().from(s.messages).where(eq(s.messages.templateKey, "flex_welcome"));

async function onlyWelcome() {
  const list = await welcomes();
  expect(list).toHaveLength(1);
  const m = list[0];
  // Every placeholder is filled in.
  expect(m.body).not.toMatch(/\{\{|\bundefined\b|\bnull\b|\[Child|\[Parent|\[Cohort/);
  expect(m.body).not.toMatch(/teacher|classroom|daycare|school|preschool/i);
  return m;
}

describe("Yalla Flex first-day welcome email", () => {
  for (const [cohort, name, code] of [
    ["wildflowers", "Wildflowers", "2424"],
    ["sprouts", "Sprouts", "2424"],
    ["saplings", "Saplings", "2022"],
  ] as const) {
    it(`one child in ${name}: the front door code and the ${name} code`, async () => {
      const { sessions, familyId } = await setup();
      const c = await child(familyId, "Jane", cohort);
      await book(familyId, [{ sessionId: sessions[cohort].id, childId: c.id }]);
      expect((await sendFlexWelcomes(db(), { now: morning(), baseUrl: "https://yalla.test" })).sent).toBe(1);
      const m = await onlyWelcome();
      expect(m.toAddress).toBe("jordan.rivera@example.com");
      expect(m.subject).toBe("Welcome to your first day of Yalla Flex!");
      expect(m.body).toContain("Hi Jordan,");
      expect(m.body).toContain(`We’re so glad you and Jane are joining us today! A member of Team Yalla will be onsite to welcome you, show you to the ${name} cohort where Jane will spend their day, and introduce you to our coworking spaces and amenities.`);
      expect(m.body).toContain("Please plan to pick up Jane at 4:30pm.");
      expect(m.body).toContain("Front door code: 2252");
      expect(m.body).toContain(`${name} door code: ${code}`);
      expect(m.body.match(/door code:/g)).toHaveLength(2);
      expect(m.body).not.toContain("#2");
      expect(m.body).toContain("Network: YallaSanDiego\nPassword: YallaSpaceSD");
      expect(m.body).toContain("[View our parking guide](https://yalla.test/parking)");
      expect(m.body).toContain("[Reserve a space](https://yalla.test/portal/spaces)");
    });
  }

  it("one child in Seedlings: the front door code only, with nothing said about a cohort code", async () => {
    const { sessions, familyId } = await setup();
    const c = await child(familyId, "Theodore", "seedlings", "Teddy");
    await book(familyId, [{ sessionId: sessions.seedlings.id, childId: c.id, addons: ["half"] }]);
    await sendFlexWelcomes(db(), { now: morning() });
    const m = await onlyWelcome();
    expect(m.body).toContain("Front door code: 2252");
    expect(m.body.match(/door code/gi)).toHaveLength(1);
    expect(m.body).not.toMatch(/Seedlings door|no code|code isn/i);
    // Preferred name, and a half day is a morning.
    expect(m.body).toContain("the Seedlings cohort where Teddy will spend their morning");
    expect(m.body).toContain("Please plan to pick up Teddy at 12:00pm.");
    expect(m.body).not.toContain("Theodore");
  });

  it("children in different cohorts with different pickups: one email, each child's day, each code once", async () => {
    const { sessions, familyId } = await setup();
    const jane = await child(familyId, "Jane", "wildflowers");
    const max = await child(familyId, "Max", "sprouts");
    const leo = await child(familyId, "Leo", "sprouts");
    await book(familyId, [
      { sessionId: sessions.wildflowers.id, childId: jane.id },
      { sessionId: sessions.sprouts.id, childId: max.id, addons: ["half"] },
      { sessionId: sessions.sprouts.id, childId: leo.id, addons: ["half"] },
    ]);
    await sendFlexWelcomes(db(), { now: morning() });
    const m = await onlyWelcome();
    expect(m.body).toContain("We’re so glad you, Jane, Max and Leo are joining us today!");
    expect(m.body).toContain("show you to the Wildflowers cohort where Jane will spend their day and the Sprouts cohort where Max and Leo will spend their morning");
    expect(m.body).toContain("their interests, their personalities");
    expect(m.body).toContain("throughout your children’s sessions. If any of them needs you");
    expect(m.body).toContain("Please plan to pick up Jane at 4:30pm and Max and Leo at 12:00pm.");
    expect(m.body).toContain("a place you all love coming back to");
    expect(m.body).toContain("Jane: Wildflowers · Full day, 8:30am–4:30pm · **Pick up at 4:30pm**");
    expect(m.body).toContain("Max: Sprouts · Half day, 8:30am–12:00pm · **Pick up at 12:00pm**");
    // Matching codes are still labeled separately, each cohort once.
    expect(m.body.match(/Wildflowers door code: 2424/g)).toHaveLength(1);
    expect(m.body.match(/Sprouts door code: 2424/g)).toHaveLength(1);
  });

  it("two children in the same cohort: that cohort's code once", async () => {
    const { sessions, familyId } = await setup();
    const a = await child(familyId, "Jane", "saplings");
    const b = await child(familyId, "Max", "saplings");
    await book(familyId, [
      { sessionId: sessions.saplings.id, childId: a.id },
      { sessionId: sessions.saplings.id, childId: b.id },
    ]);
    await sendFlexWelcomes(db(), { now: morning() });
    const m = await onlyWelcome();
    expect(m.body.match(/Saplings door code: 2022/g)).toHaveLength(1);
    expect(m.body).toContain("the Saplings cohort where Jane and Max will spend their day");
    expect(m.body).toContain("If either of them needs you");
    expect(m.body).toContain("Please plan to pick up Jane and Max at 4:30pm.");
  });

  it("separate bookings for the same family make one email, written from the bookings as they are when it's sent", async () => {
    const { sessions, familyId } = await setup();
    const jane = await child(familyId, "Jane", "wildflowers");
    const max = await child(familyId, "Max", "sprouts");
    await book(familyId, [{ sessionId: sessions.wildflowers.id, childId: jane.id }]);
    await book(familyId, [{ sessionId: sessions.sprouts.id, childId: max.id }]);
    // A change before the morning (Max's day becomes a half day) is reflected.
    await db().update(s.bookingItems).set({ addons: ["half"] }).where(eq(s.bookingItems.childId, max.id));
    await sendFlexWelcomes(db(), { now: morning() });
    const m = await onlyWelcome();
    expect(m.body).toContain("Jane at 4:30pm and Max at 12:00pm");
  });

  it("is never sent twice: repeated runs, the housekeeping run, or a booking added after it went out", async () => {
    const { sessions, familyId } = await setup();
    const jane = await child(familyId, "Jane", "wildflowers");
    await book(familyId, [{ sessionId: sessions.wildflowers.id, childId: jane.id }]);
    await Promise.all([sendFlexWelcomes(db(), { now: morning() }), sendFlexWelcomes(db(), { now: morning() })]);
    await sendFlexWelcomes(db(), { now: zonedDateTime(day(), "07:00") });
    await runHousekeeping(db(), { baseUrl: "http://test", now: morning(), reminders: false });
    const max = await child(familyId, "Max", "sprouts");
    await book(familyId, [{ sessionId: sessions.sprouts.id, childId: max.id }]);
    await sendFlexWelcomes(db(), { now: zonedDateTime(day(), "07:15") });
    await onlyWelcome();
  });

  it("isn't sent before the first day, after arrival, to returning families, or when turned off", async () => {
    const { flex, sessions, familyId } = await setup();
    const jane = await child(familyId, "Jane", "wildflowers");
    await book(familyId, [{ sessionId: sessions.wildflowers.id, childId: jane.id }]);
    // The day before, and after they've arrived.
    await sendFlexWelcomes(db(), { now: zonedDateTime(todayLA(), "06:00") });
    await sendFlexWelcomes(db(), { now: zonedDateTime(day(), "08:15") });
    expect(await welcomes()).toHaveLength(0);
    // Turned off in Settings.
    await setPolicy(db(), owner, "notifications.flexWelcome", false);
    await sendFlexWelcomes(db(), { now: morning() });
    expect(await welcomes()).toHaveLength(0);
    await setPolicy(db(), owner, "notifications.flexWelcome", true);

    // A family who already came to Flex before isn't new.
    const [f2] = await db().insert(s.families).values({ name: "Returning family" }).returning();
    await db().insert(s.guardians).values({ familyId: f2.id, firstName: "Ola", lastName: "Back", email: "ola@example.com", isPrimary: true });
    const kid = await child(f2.id, "Ivy", "wildflowers");
    const past = await session(flex.id, { capacity: 4, minAgeMonths: 36, maxAgeMonths: 59 }, -3);
    // (Booked when it was still upcoming.)
    const [pb] = await db().insert(s.bookings).values({ familyId: f2.id, reference: "YL-PAST1", status: "confirmed", source: "admin" }).returning();
    await db().insert(s.bookingItems).values({ bookingId: pb.id, sessionId: past.id, childId: kid.id, status: "confirmed" });
    await book(f2.id, [{ sessionId: sessions.wildflowers.id, childId: kid.id }]);
    await sendFlexWelcomes(db(), { now: morning() });
    const sent = await welcomes();
    expect(sent.map((m) => m.toAddress)).toEqual(["jordan.rivera@example.com"]);
  });

  it("renders as a letter, then the details, with working portal links", async () => {
    const { sessions, familyId } = await setup();
    const c = await child(familyId, "Jane", "wildflowers");
    await book(familyId, [{ sessionId: sessions.wildflowers.id, childId: c.id }]);
    await sendFlexWelcomes(db(), { now: morning(), baseUrl: "https://yalla.test" });
    const m = await onlyWelcome();
    const html = emailHtml({ key: "flex_welcome", subject: m.subject, body: m.body, audience: "family" });
    expect(html.indexOf("Welcome to Yalla. We’re happy you’re here")).toBeLessThan(html.indexOf("A few details for your first visit"));
    expect(html.indexOf("Team Yalla</p>")).toBeLessThan(html.indexOf("A few details for your first visit"));
    expect(html).toContain('href="https://yalla.test/parking"');
    expect(html).toContain('href="https://yalla.test/portal/spaces"');
    expect(html).not.toContain("###");
    // Signing in keeps families on their way to either page.
    expect(safeNextPath("/parking")).toBe("/parking");
    expect(safeNextPath("/portal/spaces")).toBe("/portal/spaces");
  });
});
