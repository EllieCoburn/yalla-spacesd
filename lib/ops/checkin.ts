/**
 * Family check-in codes and the lobby kiosk.
 *
 * - Every family has one 4-digit check-in code. At the lobby kiosk they enter it, then tap which of
 *   their children are arriving (or leaving). It covers everything except Yalla Flex and Club Yalla,
 *   which check in through Brightwheel: Camp Yalla, weekend sessions, Happenings and so on.
 * - Codes are random and unique, never a run (1234), four of a kind (7777) or a door code.
 * - The kiosk screen is never public. Staff open it on the kiosk from Admin each day; that sets a
 *   kiosk session that ends at midnight (or when staff end it). Every kiosk request checks it.
 * - The kiosk only ever shows a family's children who are booked today, by first name.
 */
import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { DB, Executor } from "@/lib/db";
import { attendanceRecords, authorizedPickups, bookingItems, bookings, children, families, guardians, kioskSessions, programs, sessions } from "@/lib/db/schema";
import { OpsError, type Actor } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/auth/crypto";
import { addDaysISO, fmtTime, todayLA, zonedDateTime } from "@/lib/time";
import { FRONT_DOOR_CODE, COHORT_DOOR_CODES } from "./flex-welcome";
import { checkIn, checkOut } from "./attendance";

export const KIOSK_COOKIE = "yalla_kiosk";
export const KIOSK_ACTOR: Actor = { type: "system", name: "Lobby kiosk" };

/** Yalla Flex and Club Yalla check in through Brightwheel; everything else uses the family's code. */
export const usesCheckinCode = (p: { slug: string; kind: string }) => p.slug !== "yalla-flex" && p.kind !== "membership" && p.kind !== "drop_in";

const RUNS = new Set(["0123", "1234", "2345", "3456", "4567", "5678", "6789", "9876", "8765", "7654", "6543", "5432", "4321", "3210"]);
/** A code families can't guess and won't confuse with a door code. */
export function acceptableCode(c: string) {
  if (!/^\d{4}$/.test(c) || c.startsWith("0")) return false;
  if (/^(\d)\1{3}$/.test(c) || RUNS.has(c)) return false;
  if (c === FRONT_DOOR_CODE || Object.values(COHORT_DOOR_CODES).includes(c)) return false;
  return true;
}

/** The family's check-in code, created the first time it's needed. */
export async function ensureCheckinCode(db: Executor, familyId: string): Promise<string> {
  const [f] = await db.select({ code: families.checkinCode }).from(families).where(eq(families.id, familyId));
  if (!f) throw new OpsError("not_found", "Family not found.");
  if (f.code) return f.code;
  for (let i = 0; i < 50; i++) {
    const c = String(randomInt(1000, 10000));
    if (!acceptableCode(c)) continue;
    const [taken] = await db.select({ id: families.id }).from(families).where(eq(families.checkinCode, c));
    if (taken) continue;
    try {
      const [set] = await db
        .update(families)
        .set({ checkinCode: c })
        .where(and(eq(families.id, familyId), isNull(families.checkinCode)))
        .returning({ code: families.checkinCode });
      if (set?.code) return set.code;
      // Someone else set it first.
      const [again] = await db.select({ code: families.checkinCode }).from(families).where(eq(families.id, familyId));
      if (again?.code) return again.code;
    } catch {
      // Unique clash with a family created at the same moment: try another.
    }
  }
  throw new OpsError("invalid", "Couldn’t create a check-in code. Please try again.");
}

/* ── Kiosk sessions ── */

/** Opens the kiosk on this device until midnight tonight. Returns the token for the kiosk cookie. */
export async function startKioskSession(db: Executor, actor: Actor, now = new Date()) {
  const token = randomToken();
  const expiresAt = zonedDateTime(addDaysISO(todayLA(now), 1), "00:00");
  await db.insert(kioskSessions).values({ tokenHash: sha256(token), startedBy: actor.name, expiresAt });
  return { token, expiresAt };
}

export async function kioskSessionValid(db: Executor, token: string | undefined | null, now = new Date()) {
  if (!token) return false;
  const [k] = await db
    .select({ id: kioskSessions.id })
    .from(kioskSessions)
    .where(and(eq(kioskSessions.tokenHash, sha256(token)), gt(kioskSessions.expiresAt, now), isNull(kioskSessions.revokedAt)));
  return !!k;
}

/** Ends every open kiosk session (e.g. the kiosk was left open). */
export async function endKioskSessions(db: Executor, now = new Date()) {
  const ended = await db.update(kioskSessions).set({ revokedAt: now }).where(and(isNull(kioskSessions.revokedAt), gt(kioskSessions.expiresAt, now))).returning({ id: kioskSessions.id });
  return ended.length;
}

/* ── The kiosk ── */

export type KioskChild = {
  sessionId: string;
  childId: string;
  name: string;
  what: string;
  time: string;
  status: "expected" | "checked_in" | "checked_out" | "absent";
};
export type KioskFamily = { familyName: string; children: KioskChild[]; collectors: { id: string; name: string }[] };

/** The family with this code and their children booked today (code programs only), or null. */
export async function kioskLookup(db: Executor, code: string, now = new Date()): Promise<KioskFamily | null> {
  if (!/^\d{4}$/.test(code)) return null;
  const [f] = await db.select().from(families).where(eq(families.checkinCode, code));
  if (!f) return null;
  const today = todayLA(now);
  const rows = await db
    .select({ item: bookingItems, session: sessions, program: programs, child: children })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(children, eq(children.id, bookingItems.childId))
    .where(and(eq(bookings.familyId, f.id), eq(bookings.status, "confirmed"), eq(bookingItems.status, "confirmed"), eq(sessions.localDate, today)))
    .orderBy(sessions.startsAt, children.birthDate);
  const list = rows.filter((r) => usesCheckinCode(r.program) && r.session.status !== "cancelled");
  const recs = list.length
    ? await db
        .select()
        .from(attendanceRecords)
        .where(inArray(attendanceRecords.sessionId, [...new Set(list.map((r) => r.session.id))]))
    : [];
  const kids: KioskChild[] = list.map((r) => {
    const rec = recs.find((x) => x.sessionId === r.session.id && x.childId === r.child.id);
    return {
      sessionId: r.session.id,
      childId: r.child.id,
      name: (r.child.preferredName || r.child.firstName).trim(),
      what: r.program.name,
      time: `${fmtTime(r.session.startsAt)}–${fmtTime(r.session.endsAt)}`,
      status: (rec?.status as KioskChild["status"]) ?? "expected",
    };
  });
  const gs = await db.select().from(guardians).where(eq(guardians.familyId, f.id));
  const pk = await db.select().from(authorizedPickups).where(and(eq(authorizedPickups.familyId, f.id), eq(authorizedPickups.isRestricted, false)));
  const collectors = [
    ...gs.map((g) => ({ id: `guardian:${g.id}`, name: `${g.firstName} ${g.lastName}`.trim() })),
    ...pk.map((p) => ({ id: p.id, name: p.name })),
  ];
  return { familyName: f.name, children: kids, collectors };
}

/** Only children this family has booked today (in a code program) can be checked in or out. */
async function verified(db: Executor, code: string, picks: { sessionId: string; childId: string }[], now: Date) {
  const fam = await kioskLookup(db, code, now);
  if (!fam) throw new OpsError("not_found", "That code didn’t match. Please try again.");
  const ok = picks.filter((p) => fam.children.some((c) => c.sessionId === p.sessionId && c.childId === p.childId));
  if (!ok.length || ok.length !== picks.length) throw new OpsError("invalid", "Please choose a child from the list.");
  return { fam, picks: ok };
}

export async function kioskCheckIn(db: DB, code: string, picks: { sessionId: string; childId: string }[], now = new Date()) {
  const { fam, picks: ok } = await verified(db, code, picks, now);
  const names: string[] = [];
  for (const p of ok) {
    await checkIn(db, KIOSK_ACTOR, { ...p, at: now });
    names.push(fam.children.find((c) => c.childId === p.childId)!.name);
  }
  return [...new Set(names)];
}

export async function kioskCheckOut(db: DB, code: string, picks: { sessionId: string; childId: string }[], pickupId: string, now = new Date()) {
  const { fam, picks: ok } = await verified(db, code, picks, now);
  if (!fam.collectors.some((c) => c.id === pickupId)) throw new OpsError("invalid", "Please choose who is picking up.");
  const names: string[] = [];
  for (const p of ok) {
    const c = fam.children.find((x) => x.childId === p.childId && x.sessionId === p.sessionId)!;
    if (c.status !== "checked_in") throw new OpsError("invalid", `${c.name} isn’t checked in yet.`);
    await checkOut(db, KIOSK_ACTOR, { ...p, pickupId, at: now });
    names.push(c.name);
  }
  return [...new Set(names)];
}
