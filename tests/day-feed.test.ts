/** The day feed: who on the team can open a child's day and when, what they post, and what families see. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import {
  addEntry,
  awaitingReply,
  childAccess,
  endNap,
  entryTitle,
  familyReply,
  familyTodayFeeds,
  feedFor,
  myFeedSessions,
  photoForFamily,
  photoForStaff,
  removeEntry,
  setSessionTeam,
  type FeedStaff,
} from "@/lib/ops/day-feed";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
import { addDaysISO, todayLA, zonedDateTime } from "@/lib/time";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const today = () => todayLA();
const tomorrow = () => addDaysISO(todayLA(), 1);
const at = (date: string, hhmm: string) => zonedDateTime(date, hhmm);

async function staffUser(name: string, roleKey: string) {
  const [r] = await db().select().from(s.roles).where(eq(s.roles.key, roleKey));
  const [u] = await db()
    .insert(s.staffUsers)
    .values({ email: `${name.toLowerCase()}@yalla.test`, name: `${name} Team`, roleId: r.id })
    .returning();
  return { id: u.id, name: u.name, permissions: roleKey === "owner" ? ALL_PERMISSIONS : (r.permissions as FeedStaff["permissions"]) } as FeedStaff;
}

async function family(last: string, kids: string[]) {
  const [f] = await db().insert(s.families).values({ name: `${last} family` }).returning();
  const [g] = await db().insert(s.guardians).values({ familyId: f.id, firstName: "Jordan", lastName: last, email: `jordan.${last.toLowerCase()}@example.com`, phone: "619-555-0101", isPrimary: true, portalAccess: true }).returning();
  const children = [];
  for (const k of kids) children.push((await db().insert(s.children).values({ familyId: f.id, firstName: k, lastName: last, birthDate: addDaysISO(today(), -900), allergies: k === "Ava" ? "Peanuts" : null }).returning())[0]);
  return { familyId: f.id, guardian: { guardianId: g.id, familyId: f.id, firstName: g.firstName, lastName: g.lastName }, children };
}

async function book(familyId: string, items: { sessionId: string; childId: string }[]) {
  const hold = await createHold(db(), owner, { familyId, items, source: "admin", acknowledgePaperwork: true, now: at(today(), "07:00") });
  await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
}

/** A camp day tomorrow with Ava (Rivera) booked, and Sam on the session team. */
async function setup(daysAhead = 1) {
  const camp = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla" });
  const day = await session(camp.id, { capacity: 6, minAgeMonths: 18, maxAgeMonths: 47 }, daysAhead, "09:00", "15:00");
  const other = await session(camp.id, { capacity: 6, minAgeMonths: 18, maxAgeMonths: 47 }, daysAhead, "15:30", "17:00");
  const rivera = await family("Rivera", ["Ava", "Leo"]);
  const chen = await family("Chen", ["Mia"]);
  await book(rivera.familyId, [{ sessionId: day.id, childId: rivera.children[0].id }]);
  await book(chen.familyId, [{ sessionId: other.id, childId: chen.children[0].id }]);
  const sam = await staffUser("Sam", "session_team");
  const kim = await staffUser("Kim", "session_team");
  const boss = await staffUser("Boss", "owner");
  await setSessionTeam(db(), owner, day.id, [sam.id]);
  return { day, other, rivera, chen, sam, kim, boss, ava: rivera.children[0], leo: rivera.children[1], mia: chen.children[0] };
}

describe("Who can open a child's day, and when", () => {
  it("a session team member: from 6pm the evening before until 11:59pm on the day, only their session's children", async () => {
    const { day, sam, kim, ava, mia, leo } = await setup(1);
    const d = day.localDate;
    // 5:59pm the evening before: not yet.
    await expect(childAccess(db(), sam, day.id, ava.id, at(today(), "17:59"))).rejects.toThrow(/opens at 6pm/);
    // 6pm the evening before: open.
    await expect(childAccess(db(), sam, day.id, ava.id, at(today(), "18:00"))).resolves.toBeTruthy();
    // On the day, late evening: still open.
    await expect(childAccess(db(), sam, day.id, ava.id, at(d, "23:58"))).resolves.toBeTruthy();
    // Midnight after: closed.
    await expect(childAccess(db(), sam, day.id, ava.id, at(addDaysISO(d, 1), "00:00"))).rejects.toThrow();
    // Not their session's child, or a sibling not booked, or someone not on the team.
    await expect(childAccess(db(), sam, day.id, mia.id, at(d, "10:00"))).rejects.toThrow();
    await expect(childAccess(db(), sam, day.id, leo.id, at(d, "10:00"))).rejects.toThrow();
    await expect(childAccess(db(), kim, day.id, ava.id, at(d, "10:00"))).rejects.toThrow();
  });

  it("their list shows their sessions only inside the window; the owner sees every session", async () => {
    const { sam, boss, day } = await setup(1);
    expect(await myFeedSessions(db(), sam, at(today(), "17:00"))).toHaveLength(0);
    const evening = await myFeedSessions(db(), sam, at(today(), "18:30"));
    expect(evening.map((x) => x.session.id)).toEqual([day.id]);
    expect(evening[0].children.map((c) => c.name)).toEqual(["Ava Rivera"]);
    expect(evening[0].children[0].allergies).toBe("Peanuts");
    expect((await myFeedSessions(db(), boss, at(today(), "18:30"))).length).toBe(2);
    // The owner can open any child in any session, even outside the window.
    await expect(childAccess(db(), boss, day.id, (await db().select().from(s.children).where(eq(s.children.firstName, "Ava")))[0].id, at(today(), "08:00"))).resolves.toBeTruthy();
  });

  it("roles without the feed permission get nothing", async () => {
    const { day, ava } = await setup(1);
    const educator = await staffUser("Edu", "educator");
    await expect(childAccess(db(), educator, day.id, ava.id, at(day.localDate, "10:00"))).rejects.toThrow();
  });
});

describe("Posting to the feed", () => {
  it("photo, food, nap, potty (diaper and toilet) and messages, in time order; the family sees today's feed", async () => {
    const { day, sam, ava, rivera } = await setup(0);
    const d = day.localDate;
    const now = at(d, "14:00");
    const post = (entry: Parameters<typeof addEntry>[2]["entry"]) => addEntry(db(), sam, { sessionId: day.id, childId: ava.id, entry, baseUrl: "https://yalla.test" }, now);
    await post({ kind: "food", meal: "am_snack", amount: "most", items: "Apple slices", time: "09:30" });
    await post({ kind: "potty", type: "diaper", result: "wet_bm", time: "10:05" });
    await post({ kind: "potty", type: "toilet", result: "pee", time: "11:40" });
    const nap = await post({ kind: "nap", start: "12:10" });
    await post({ kind: "photo", photo: JPEG, caption: "Mud kitchen", time: "10:30" });
    await post({ kind: "message", body: "Ava had a wonderful morning!" });

    const feed = await feedFor(db(), ava.id, d);
    expect(feed.map(entryTitle)).toEqual(["Morning snack · Ate most", "Diaper · Wet + BM", "Photo", "Toilet · Pee", "Nap · asleep since 12:10pm", "Message"]);
    await endNap(db(), sam, nap.id, "13:25", now);
    expect(entryTitle((await feedFor(db(), ava.id, d)).find((e) => e.kind === "nap")!)).toBe("Nap · 12:10pm – 1:25pm (1 hr 15 min)");

    // The family is emailed about the message (captured, not sent, in tests).
    const [m] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "day_feed_message"));
    expect(m.toAddress).toBe("jordan.rivera@example.com");
    expect(m.body).toContain("Ava had a wonderful morning!");

    // The family's portal shows Ava's day today, and nothing the next day.
    const feeds = await familyTodayFeeds(db(), rivera.familyId, now);
    expect(feeds.map((f) => [f.name, f.entries.length])).toEqual([["Ava", 6]]);
    expect(await familyTodayFeeds(db(), rivera.familyId, at(addDaysISO(d, 1), "09:00"))).toEqual([]);
  });

  it("checks what's posted: the right potty choices, real images, a time for naps", async () => {
    const { day, sam, ava } = await setup(0);
    const now = at(day.localDate, "12:00");
    const post = (entry: Parameters<typeof addEntry>[2]["entry"]) => addEntry(db(), sam, { sessionId: day.id, childId: ava.id, entry }, now);
    await expect(post({ kind: "potty", type: "diaper", result: "pee" })).rejects.toThrow(/Wet, BM, Wet \+ BM, Dry/);
    await expect(post({ kind: "potty", type: "toilet", result: "dry" })).rejects.toThrow(/Pee, BM, Pee \+ BM, Tried, Accident/);
    await expect(post({ kind: "potty", type: "bucket", result: "wet" })).rejects.toThrow(/diaper or toilet/);
    await expect(post({ kind: "photo", photo: Buffer.from("<svg onload=alert(1)>") })).rejects.toThrow(/JPEG, PNG or WebP/);
    await expect(post({ kind: "nap", start: "13:00", end: "12:00" })).rejects.toThrow(/end after/);
    await expect(post({ kind: "food", meal: "brunch" })).rejects.toThrow(/meal/);
    await expect(post({ kind: "message", body: "   " })).rejects.toThrow(/Write a message/);
  });

  it("removing an entry hides it from the family", async () => {
    const { day, sam, ava, rivera } = await setup(0);
    const now = at(day.localDate, "12:00");
    const e = await addEntry(db(), sam, { sessionId: day.id, childId: ava.id, entry: { kind: "food", meal: "lunch" } }, now);
    await removeEntry(db(), sam, e.id, now);
    expect((await familyTodayFeeds(db(), rivera.familyId, now))[0].entries).toHaveLength(0);
  });
});

describe("Families and photos", () => {
  it("parents reply on the day; the team sees it waiting; other families can't", async () => {
    const { day, sam, ava, rivera, chen } = await setup(0);
    const now = at(day.localDate, "11:00");
    await addEntry(db(), sam, { sessionId: day.id, childId: ava.id, entry: { kind: "message", body: "Ava is having fun" } }, now);
    await familyReply(db(), rivera.guardian, ava.id, "Thank you! She didn't sleep well last night.", now);
    expect([...(await awaitingReply(db(), [ava.id], day.localDate))]).toEqual([ava.id]);
    const feed = await feedFor(db(), ava.id, day.localDate);
    expect(feed.at(-1)).toMatchObject({ kind: "message", authorName: "Jordan Rivera", data: { from: "family" } });
    await expect(familyReply(db(), chen.guardian, ava.id, "Hi", now)).rejects.toThrow();
    // A child with no session today can't be messaged about.
    await expect(familyReply(db(), rivera.guardian, rivera.children[1].id, "Hi", now)).rejects.toThrow();
  });

  it("photos: the child's family, and the team only while their window is open", async () => {
    const { day, sam, kim, ava, rivera, chen } = await setup(0);
    const now = at(day.localDate, "11:00");
    const e = await addEntry(db(), sam, { sessionId: day.id, childId: ava.id, entry: { kind: "photo", photo: JPEG } }, now);
    expect(await photoForFamily(db(), rivera.familyId, e.photoId!)).toBeTruthy();
    expect(await photoForFamily(db(), chen.familyId, e.photoId!)).toBeNull();
    expect(await photoForStaff(db(), sam, e.photoId!, now)).toBeTruthy();
    expect(await photoForStaff(db(), kim, e.photoId!, now)).toBeNull();
    expect(await photoForStaff(db(), sam, e.photoId!, at(addDaysISO(day.localDate, 1), "08:00"))).toBeNull();
  });

  it("only people whose role can post can be put on a session's team", async () => {
    const { day, sam } = await setup(1);
    const ops = await staffUser("Billing", "billing");
    expect(await setSessionTeam(db(), owner, day.id, [sam.id, ops.id])).toBe(1);
    void tomorrow;
  });
});
