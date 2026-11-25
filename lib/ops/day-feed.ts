/**
 * The day feed: a child's day at Yalla (photos, food, naps, potty and messages), posted by the team
 * and shown to the family in the Family Portal on the day.
 *
 * Who can see and post:
 * - Staff with "feed.manage" (the owner): every child, any time, and they assign the team to sessions.
 * - Staff with "feed.post": only children expected in a session they're assigned to, and only from 6pm
 *   Pacific the evening before that session until 11:59pm on the day. Outside that window the child's
 *   profile, feed and messages are closed to them. Every check happens on the server.
 * - Families: their own children's feed for today, on the Family Portal home page. The next day the
 *   home page goes back to normal.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { OpsError, audit, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import {
  authorizedPickups,
  bookingItems,
  bookings,
  children,
  dayFeedEntries,
  dayFeedPhotos,
  emergencyContacts,
  guardians,
  programs,
  sessionStaff,
  sessions,
  staffUsers,
} from "@/lib/db/schema";
import type { Permission } from "@/lib/auth/permissions";
import { addDaysISO, ageLabel, fmtTime, todayLA, zonedDateTime } from "@/lib/time";
import { roster } from "./attendance";

export type FeedStaff = { id: string; name: string; permissions: readonly Permission[] };
export type FeedEntry = typeof dayFeedEntries.$inferSelect;
export type FeedKind = "photo" | "food" | "nap" | "potty" | "message";

const ROSTER_PERMS: Permission[] = ["children.care", "families.view"];

// ── Choices (modelled on Brightwheel's activity options) ─────────────────────────────────────────
export const MEALS = [
  { key: "breakfast", label: "Breakfast" },
  { key: "am_snack", label: "Morning snack" },
  { key: "lunch", label: "Lunch" },
  { key: "pm_snack", label: "Afternoon snack" },
  { key: "dinner", label: "Dinner" },
] as const;
export const AMOUNTS = [
  { key: "all", label: "Ate all" },
  { key: "most", label: "Ate most" },
  { key: "some", label: "Ate some" },
  { key: "none", label: "Ate none" },
] as const;
export const POTTY = {
  diaper: { label: "Diaper", results: [
    { key: "wet", label: "Wet" },
    { key: "bm", label: "BM" },
    { key: "wet_bm", label: "Wet + BM" },
    { key: "dry", label: "Dry" },
  ] },
  toilet: { label: "Toilet", results: [
    { key: "pee", label: "Pee" },
    { key: "bm", label: "BM" },
    { key: "pee_bm", label: "Pee + BM" },
    { key: "tried", label: "Tried" },
    { key: "accident", label: "Accident" },
  ] },
} as const;
export type PottyType = keyof typeof POTTY;

const label = <T extends readonly { key: string; label: string }[]>(list: T, key: string | null | undefined) => list.find((x) => x.key === key)?.label ?? null;

/** "Lunch · Ate most", "Diaper · Wet + BM", "Nap · 12:10pm – 1:25pm (1 hr 15 min)". */
export function entryTitle(e: Pick<FeedEntry, "kind" | "data" | "occurredAt">): string {
  const d = e.data ?? {};
  if (e.kind === "food") return [label(MEALS, d.meal) ?? "Food", label(AMOUNTS, d.amount)].filter(Boolean).join(" · ");
  if (e.kind === "potty") {
    const t = POTTY[d.type as PottyType];
    return t ? [t.label, label(t.results, d.result)].filter(Boolean).join(" · ") : "Potty";
  }
  if (e.kind === "nap") {
    if (!d.endedAt) return `Nap · asleep since ${fmtTime(e.occurredAt)}`;
    const mins = Math.max(0, Math.round((new Date(d.endedAt).getTime() - new Date(e.occurredAt).getTime()) / 60000));
    const len = mins >= 60 ? `${Math.floor(mins / 60)} hr${mins % 60 ? ` ${mins % 60} min` : ""}` : `${mins} min`;
    return `Nap · ${fmtTime(e.occurredAt)} – ${fmtTime(d.endedAt)} (${len})`;
  }
  if (e.kind === "photo") return "Photo";
  return d.from === "family" ? "Message from family" : "Message";
}

// ── The access window ────────────────────────────────────────────────────────────────────────────
/** 6pm Pacific the evening before, until 11:59pm Pacific on the day (exclusive of midnight). */
export function feedWindow(localDate: string) {
  return { opens: zonedDateTime(addDaysISO(localDate, -1), "18:00"), closes: zonedDateTime(addDaysISO(localDate, 1), "00:00") };
}
export const windowOpen = (localDate: string, now = new Date()) => {
  const w = feedWindow(localDate);
  return now >= w.opens && now < w.closes;
};

const manages = (s: FeedStaff) => s.permissions.includes("feed.manage");
const posts = (s: FeedStaff) => s.permissions.includes("feed.post") || manages(s);

/** Today's sessions (and tomorrow's from 6pm) this person can open: assigned ones, or all for managers. */
export async function myFeedSessions(db: Executor, staff: FeedStaff, now = new Date()) {
  if (!posts(staff)) return [];
  const today = todayLA(now);
  const dates = [today, addDaysISO(today, 1)].filter((d) => windowOpen(d, now));
  if (!dates.length) return [];
  const rows = await db
    .select({ s: sessions, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(inArray(sessions.localDate, dates), eq(sessions.status, "scheduled")))
    .orderBy(asc(sessions.startsAt));
  let list = rows;
  if (!manages(staff)) {
    const mine = new Set((await db.select({ id: sessionStaff.sessionId }).from(sessionStaff).where(eq(sessionStaff.staffId, staff.id))).map((r) => r.id));
    list = rows.filter((r) => mine.has(r.s.id));
  }
  const out = [];
  for (const r of list) {
    const kids = await sessionChildren(db, r.s.id);
    if (!kids.length && !manages(staff)) continue;
    out.push({ session: r.s, program: r.p, children: kids });
  }
  return out;
}

/** The children expected in a session, with what the team needs at a glance. */
export async function sessionChildren(db: Executor, sessionId: string) {
  const r = await roster(db, sessionId, ROSTER_PERMS);
  return r.children
    .filter((c) => c.expected || c.attendance?.status === "checked_in" || c.attendance?.status === "checked_out")
    .map((c) => ({ childId: c.childId, familyId: c.familyId, name: c.name, preferredName: c.preferredName, age: c.age, allergies: c.care?.allergies?.trim() || null, medications: c.care?.medicalNotes?.trim() || null, status: c.attendance?.status ?? "expected" }));
}

/**
 * The gate for everything a team member does with a child: the child is expected in the session, and the
 * person manages the feed, or is assigned to the session while its window is open.
 */
export async function childAccess(db: Executor, staff: FeedStaff, sessionId: string, childId: string, now = new Date()) {
  const denied = () => new OpsError("forbidden", "This child’s profile isn’t open to you right now. It opens at 6pm the evening before a session you’re on, and closes at 11:59pm on the day.");
  if (!posts(staff)) throw denied();
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!s) throw denied();
  if (!manages(staff)) {
    if (!windowOpen(s.localDate, now)) throw denied();
    const [assigned] = await db.select({ id: sessionStaff.id }).from(sessionStaff).where(and(eq(sessionStaff.sessionId, sessionId), eq(sessionStaff.staffId, staff.id)));
    if (!assigned) throw denied();
  }
  const kid = (await sessionChildren(db, sessionId)).find((c) => c.childId === childId);
  if (!kid) throw denied();
  return { session: s, child: kid };
}

/** The child's profile for the team: care details, parents and who may collect them. */
export async function childProfile(db: Executor, childId: string) {
  const [c] = await db.select().from(children).where(eq(children.id, childId));
  if (!c) throw new OpsError("not_found", "Child not found.");
  const [gs, pickups, emerg] = await Promise.all([
    db.select().from(guardians).where(eq(guardians.familyId, c.familyId)),
    db.select().from(authorizedPickups).where(eq(authorizedPickups.familyId, c.familyId)),
    db.select().from(emergencyContacts).where(eq(emergencyContacts.familyId, c.familyId)),
  ]);
  return {
    child: { id: c.id, familyId: c.familyId, name: `${c.firstName} ${c.lastName}`, firstName: c.preferredName || c.firstName, preferredName: c.preferredName, birthDate: c.birthDate, age: ageLabel(c.birthDate, todayLA()), allergies: c.allergies, medications: c.medicalNotes, careNotes: c.careNotes },
    parents: gs
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
      .map((g) => ({ id: g.id, name: `${g.firstName} ${g.lastName}`, relationship: g.relationship, phone: g.phone })),
    pickups: pickups.filter((p) => !p.childId || p.childId === c.id).map((p) => ({ id: p.id, name: p.name, relationship: p.relationship, phone: p.phone, restricted: p.isRestricted, note: p.restrictionNote })),
    emergency: emerg.filter((e) => !e.childId || e.childId === c.id).map((e) => ({ id: e.id, name: e.name, relationship: e.relationship, phone: e.phone })),
  };
}

/** A child's feed for one day, oldest first. */
export async function feedFor(db: Executor, childId: string, localDate: string) {
  return db
    .select()
    .from(dayFeedEntries)
    .where(and(eq(dayFeedEntries.childId, childId), eq(dayFeedEntries.localDate, localDate), isNull(dayFeedEntries.deletedAt)))
    .orderBy(asc(dayFeedEntries.occurredAt), asc(dayFeedEntries.createdAt));
}

// ── Posting ──────────────────────────────────────────────────────────────────────────────────────
const hhmm = (s: string | null | undefined) => (s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null);
/** "HH:MM" now in Pacific time, for the time pickers. */
export const nowHHMM = (now = new Date()) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);

const clip = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n) || null;

/** JPEG, PNG or WebP only, checked by their first bytes (not the name or the browser's claim). */
export function imageType(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}
export const MAX_PHOTO_BYTES = 2_500_000;

export type NewEntry =
  | { kind: "photo"; photo: Buffer; caption?: string | null; time?: string | null }
  | { kind: "food"; meal: string; amount?: string | null; items?: string | null; note?: string | null; time?: string | null }
  | { kind: "nap"; start: string; end?: string | null; note?: string | null }
  | { kind: "potty"; type: string; result: string; note?: string | null; time?: string | null }
  | { kind: "message"; body: string };

export async function addEntry(db: Executor, staff: FeedStaff, input: { sessionId: string; childId: string; entry: NewEntry; baseUrl?: string }, now = new Date()) {
  const { session, child } = await childAccess(db, staff, input.sessionId, input.childId, now);
  const day = session.localDate;
  const at = (t: string | null | undefined) => zonedDateTime(day, hhmm(t) ?? (day === todayLA(now) ? nowHHMM(now) : "09:00"));
  const e = input.entry;
  let row: Omit<typeof dayFeedEntries.$inferInsert, "childId" | "familyId" | "sessionId" | "localDate" | "authorStaffId" | "authorName">;
  if (e.kind === "photo") {
    if (!e.photo?.length) throw new OpsError("invalid", "Choose a photo.");
    if (e.photo.length > MAX_PHOTO_BYTES) throw new OpsError("invalid", "That photo is too large. Try a smaller one.");
    const mime = imageType(e.photo);
    if (!mime) throw new OpsError("invalid", "Photos need to be JPEG, PNG or WebP.");
    const [p] = await db.insert(dayFeedPhotos).values({ childId: child.childId, mimeType: mime, size: e.photo.length, data: e.photo }).returning({ id: dayFeedPhotos.id });
    row = { kind: "photo", occurredAt: at(e.time), note: clip(e.caption, 500), photoId: p.id, data: {} };
  } else if (e.kind === "food") {
    if (!MEALS.some((m) => m.key === e.meal)) throw new OpsError("invalid", "Choose which meal or snack.");
    if (e.amount && !AMOUNTS.some((a) => a.key === e.amount)) throw new OpsError("invalid", "Choose how much they ate.");
    row = { kind: "food", occurredAt: at(e.time), data: { meal: e.meal, amount: e.amount || null, items: clip(e.items, 300) }, note: clip(e.note, 500) };
  } else if (e.kind === "nap") {
    const start = hhmm(e.start);
    if (!start) throw new OpsError("invalid", "Enter when the nap started.");
    const end = hhmm(e.end);
    if (end && end <= start) throw new OpsError("invalid", "The nap has to end after it starts.");
    row = { kind: "nap", occurredAt: zonedDateTime(day, start), data: { endedAt: end ? zonedDateTime(day, end).toISOString() : null }, note: clip(e.note, 500) };
  } else if (e.kind === "potty") {
    const t = POTTY[e.type as PottyType];
    if (!t) throw new OpsError("invalid", "Choose diaper or toilet.");
    if (!t.results.some((r) => r.key === e.result)) throw new OpsError("invalid", `Choose what happened (${t.results.map((r) => r.label).join(", ")}).`);
    row = { kind: "potty", occurredAt: at(e.time), data: { type: e.type, result: e.result }, note: clip(e.note, 500) };
  } else if (e.kind === "message") {
    const body = clip(e.body, 2000);
    if (!body) throw new OpsError("invalid", "Write a message.");
    row = { kind: "message", occurredAt: now, data: { from: "team" }, note: body };
  } else throw new OpsError("invalid", "Unknown entry.");

  const [saved] = await db
    .insert(dayFeedEntries)
    .values({ ...row, childId: child.childId, familyId: child.familyId, sessionId: session.id, localDate: day, authorStaffId: staff.id, authorName: staff.name })
    .returning();
  const actor: Actor = { type: "staff", id: staff.id, name: staff.name, permissions: staff.permissions };
  await audit(db, actor, { action: `feed.${saved.kind}`, entityType: "child", entityId: child.childId, summary: `Added ${entryTitle(saved).toLowerCase()} to ${child.name.split(" ")[0]}’s day` });
  if (saved.kind === "message") {
    const { notifyFamily } = await import("@/lib/notify");
    await notifyFamily(db, {
      key: "day_feed_message",
      familyId: child.familyId,
      vars: { child_name: child.preferredName || child.name.split(" ")[0], author_name: staff.name.split(" ")[0], message: saved.note ?? "", link: `${input.baseUrl ?? ""}/portal/home` },
      related: { type: "child", id: child.childId },
      createdBy: staff.name,
    }).catch((err) => console.error("[feed message email failed]", (err as Error).message?.slice(0, 120)));
  }
  return saved;
}

async function ownEntry(db: Executor, staff: FeedStaff, entryId: string, now: Date) {
  const [e] = await db.select().from(dayFeedEntries).where(and(eq(dayFeedEntries.id, entryId), isNull(dayFeedEntries.deletedAt)));
  if (!e || !e.sessionId) throw new OpsError("not_found", "That entry isn’t there anymore.");
  await childAccess(db, staff, e.sessionId, e.childId, now);
  if (e.authorGuardianId) throw new OpsError("forbidden", "That’s a message from the family.");
  return e;
}

/** Wakes a child from a nap that's still going. */
export async function endNap(db: Executor, staff: FeedStaff, entryId: string, time?: string | null, now = new Date()) {
  const e = await ownEntry(db, staff, entryId, now);
  if (e.kind !== "nap" || e.data?.endedAt) throw new OpsError("invalid", "That nap has already ended.");
  const end = hhmm(time) ? zonedDateTime(e.localDate, hhmm(time)!) : now;
  if (end <= e.occurredAt) throw new OpsError("invalid", "The nap has to end after it starts.");
  await db.update(dayFeedEntries).set({ data: { ...e.data, endedAt: end.toISOString() } }).where(eq(dayFeedEntries.id, e.id));
}

/** Takes an entry off the feed (kept for the record, not shown). */
export async function removeEntry(db: Executor, staff: FeedStaff, entryId: string, now = new Date()) {
  const e = await ownEntry(db, staff, entryId, now);
  await db.update(dayFeedEntries).set({ deletedAt: now }).where(eq(dayFeedEntries.id, e.id));
  await audit(db, { type: "staff", id: staff.id, name: staff.name }, { action: "feed.remove", entityType: "child", entityId: e.childId, summary: `Removed ${entryTitle(e).toLowerCase()} from a child’s day` });
}

// ── Families ─────────────────────────────────────────────────────────────────────────────────────
/** Each of the family's children who are at Yalla today (or already have something posted today). */
export async function familyTodayFeeds(db: Executor, familyId: string, now = new Date()) {
  const today = todayLA(now);
  const booked = await db
    .select({ childId: bookingItems.childId, sessionId: sessions.id, program: programs.name, startsAt: sessions.startsAt, endsAt: sessions.endsAt })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(eq(bookings.familyId, familyId), eq(bookings.status, "confirmed"), eq(bookingItems.status, "confirmed"), eq(sessions.localDate, today), eq(sessions.status, "scheduled")))
    .orderBy(asc(sessions.startsAt));
  const posted = await db
    .select({ childId: dayFeedEntries.childId })
    .from(dayFeedEntries)
    .where(and(eq(dayFeedEntries.familyId, familyId), eq(dayFeedEntries.localDate, today), isNull(dayFeedEntries.deletedAt)));
  const ids = [...new Set([...booked.map((b) => b.childId), ...posted.map((p) => p.childId)])].filter((x): x is string => !!x);
  if (!ids.length) return [];
  const kids = await db.select().from(children).where(and(inArray(children.id, ids), eq(children.familyId, familyId)));
  const out = [];
  for (const k of kids.sort((a, b) => a.birthDate.localeCompare(b.birthDate))) {
    const today_ = booked.filter((b) => b.childId === k.id);
    out.push({
      childId: k.id,
      name: k.preferredName || k.firstName,
      sessions: today_.map((b) => ({ id: b.sessionId, program: b.program, startsAt: b.startsAt, endsAt: b.endsAt })),
      entries: await feedFor(db, k.id, today),
    });
  }
  return out;
}

/** A parent's reply, shown to the child's team on the day. */
export async function familyReply(db: Executor, g: { guardianId: string; familyId: string; firstName: string; lastName: string }, childId: string, body: string, now = new Date()) {
  const text = clip(body, 2000);
  if (!text) throw new OpsError("invalid", "Write a message.");
  const feed = (await familyTodayFeeds(db, g.familyId, now)).find((f) => f.childId === childId);
  if (!feed) throw new OpsError("forbidden", "You can message the team on days your child is at Yalla.");
  const [saved] = await db
    .insert(dayFeedEntries)
    .values({
      childId,
      familyId: g.familyId,
      sessionId: feed.sessions[0]?.id ?? feed.entries.find((e) => e.sessionId)?.sessionId ?? null,
      localDate: todayLA(now),
      kind: "message",
      occurredAt: now,
      data: { from: "family" },
      note: text,
      authorGuardianId: g.guardianId,
      authorName: `${g.firstName} ${g.lastName}`.trim(),
    })
    .returning();
  return saved;
}

// ── Photos ───────────────────────────────────────────────────────────────────────────────────────
async function photoEntry(db: Executor, photoId: string) {
  const [e] = await db.select().from(dayFeedEntries).where(and(eq(dayFeedEntries.photoId, photoId), isNull(dayFeedEntries.deletedAt)));
  if (!e) return null;
  const [p] = await db.select().from(dayFeedPhotos).where(eq(dayFeedPhotos.id, photoId));
  return p ? { e, p } : null;
}

/** A photo for the child's own family. */
export async function photoForFamily(db: Executor, familyId: string, photoId: string) {
  const r = await photoEntry(db, photoId);
  return r && r.e.familyId === familyId ? r.p : null;
}

/** A photo for a team member who can open that child's day right now. */
export async function photoForStaff(db: Executor, staff: FeedStaff, photoId: string, now = new Date()) {
  const r = await photoEntry(db, photoId);
  if (!r || !r.e.sessionId) return null;
  try {
    await childAccess(db, staff, r.e.sessionId, r.e.childId, now);
  } catch {
    if (!manages(staff)) return null;
  }
  return r.p;
}

// ── Assigning the team ───────────────────────────────────────────────────────────────────────────
/** Staff who can be put on a session's team: anyone whose role can post to the feed. */
export async function feedTeam(db: Executor) {
  const { roles } = await import("@/lib/db/schema");
  const rows = await db.select({ s: staffUsers, r: roles }).from(staffUsers).innerJoin(roles, eq(roles.id, staffUsers.roleId)).where(eq(staffUsers.status, "active"));
  return rows
    .filter((x) => x.r.key === "owner" || x.r.permissions.includes("feed.post") || x.r.permissions.includes("feed.manage"))
    .map((x) => ({ id: x.s.id, name: x.s.name, role: x.r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function sessionTeam(db: Executor, sessionId: string) {
  return db.select({ id: staffUsers.id, name: staffUsers.name }).from(sessionStaff).innerJoin(staffUsers, eq(staffUsers.id, sessionStaff.staffId)).where(eq(sessionStaff.sessionId, sessionId));
}

export async function setSessionTeam(db: Executor, actor: Actor, sessionId: string, staffIds: string[]) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!s) throw new OpsError("not_found", "Session not found.");
  const allowed = new Set((await feedTeam(db)).map((t) => t.id));
  const want = [...new Set(staffIds)].filter((id) => allowed.has(id));
  await db.delete(sessionStaff).where(eq(sessionStaff.sessionId, sessionId));
  if (want.length) await db.insert(sessionStaff).values(want.map((staffId) => ({ sessionId, staffId, createdBy: actor.name })));
  await audit(db, actor, { action: "session.team", entityType: "session", entityId: sessionId, summary: `Session team set (${want.length} ${want.length === 1 ? "person" : "people"}) for ${s.localDate}` });
  return want.length;
}

/** Children whose latest message today is from their family (so the team knows to look). */
export async function awaitingReply(db: Executor, childIds: string[], localDate: string) {
  if (!childIds.length) return new Set<string>();
  const rows = await db
    .select({ childId: dayFeedEntries.childId, from: dayFeedEntries.data, at: dayFeedEntries.createdAt })
    .from(dayFeedEntries)
    .where(and(inArray(dayFeedEntries.childId, childIds), eq(dayFeedEntries.localDate, localDate), eq(dayFeedEntries.kind, "message"), isNull(dayFeedEntries.deletedAt)))
    .orderBy(asc(dayFeedEntries.createdAt));
  const last = new Map<string, string | null | undefined>();
  for (const r of rows) last.set(r.childId, r.from?.from);
  return new Set([...last].filter(([, from]) => from === "family").map(([id]) => id));
}
