/**
 * Daily rosters and attendance. The roster's sensitive fields are filtered by the viewer's
 * permissions on the server: care alerts and pickups need `children.care`, paperwork needs
 * `forms.view`, contact details need `families.view`. Billing never appears on a roster.
 */
import { and, eq, inArray } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { Permission } from "@/lib/auth/permissions";
import type { DB, Executor } from "@/lib/db";
import { attendanceRecords, authorizedPickups, bookingItems, bookings, children, cohorts, emergencyContacts, guardians, membershipExceptions, programs, sessions } from "@/lib/db/schema";
import { ageLabel } from "@/lib/time";
import { paperworkStatus, type PaperworkItem } from "./forms";
import { membershipsForCohortDay } from "./memberships";
import { getPolicy } from "./settings";

export type RosterChild = {
  childId: string;
  familyId: string;
  name: string;
  preferredName: string | null;
  age: string;
  cohort: string | null;
  source: "booking" | "membership";
  bookingId: string | null;
  bookingReference: string | null;
  bookingItemId: string | null;
  membershipId: string | null;
  expected: boolean;
  /** Absent or cancelled children stay visible with a reason. */
  notExpectedReason: string | null;
  attendance: typeof attendanceRecords.$inferSelect | null;
  care?: { allergies: string | null; medicalNotes: string | null; careNotes: string | null };
  pickups?: { id: string; name: string; relationship: string | null; phone: string | null; isRestricted: boolean; restrictionNote: string | null }[];
  contacts?: { name: string; relationship: string | null; phone: string | null; email?: string }[];
  paperwork?: PaperworkItem[];
};

export async function roster(db: Executor, sessionId: string, perms: readonly Permission[]) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!s) throw new OpsError("not_found", "Session not found.");
  const [p] = await db.select().from(programs).where(eq(programs.id, s.programId));
  const cohortRows = await db.select().from(cohorts);
  const cohortName = new Map(cohortRows.map((c) => [c.id, c.name]));

  const items = await db
    .select({ i: bookingItems, b: bookings, c: children })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(children, eq(children.id, bookingItems.childId))
    .where(and(eq(bookingItems.sessionId, sessionId), inArray(bookingItems.status, ["confirmed", "cancelled"])));

  const members = s.cohortId ? await membershipsForCohortDay(db, s.cohortId, s.programId, s.localDate) : [];
  const exceptions = members.length
    ? await db
        .select()
        .from(membershipExceptions)
        .where(
          and(
            inArray(
              membershipExceptions.membershipId,
              members.map((m) => m.m.id),
            ),
            eq(membershipExceptions.date, s.localDate),
          ),
        )
    : [];
  const att = await db.select().from(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId));
  const attByChild = new Map(att.map((a) => [a.childId, a]));

  const list: RosterChild[] = [];
  const seen = new Set<string>();
  for (const { i, b, c } of items) {
    if (seen.has(c.id) && i.status === "cancelled") continue;
    seen.add(c.id);
    list.push({
      childId: c.id,
      familyId: c.familyId,
      name: `${c.firstName} ${c.lastName}`,
      preferredName: c.preferredName,
      age: ageLabel(c.birthDate, s.localDate),
      cohort: c.cohortId ? (cohortName.get(c.cohortId) ?? null) : null,
      source: "booking",
      bookingId: b.id,
      bookingReference: b.reference,
      bookingItemId: i.id,
      membershipId: null,
      expected: i.status === "confirmed" && i.attendance !== "absent",
      notExpectedReason: i.status === "cancelled" ? "Booking cancelled" : i.attendance === "absent" ? "Absent" : null,
      attendance: attByChild.get(c.id) ?? null,
    });
  }
  for (const { m, c } of members) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const ex = exceptions.find((e) => e.membershipId === m.id);
    list.push({
      childId: c.id,
      familyId: c.familyId,
      name: `${c.firstName} ${c.lastName}`,
      preferredName: c.preferredName,
      age: ageLabel(c.birthDate, s.localDate),
      cohort: cohortName.get(m.cohortId) ?? null,
      source: "membership",
      bookingId: null,
      bookingReference: null,
      bookingItemId: null,
      membershipId: m.id,
      expected: !ex,
      notExpectedReason: ex ? ex.kind[0].toUpperCase() + ex.kind.slice(1) : null,
      attendance: attByChild.get(c.id) ?? null,
    });
  }

  const childIds = list.map((r) => r.childId);
  const familyIds = [...new Set(list.map((r) => r.familyId))];
  if (perms.includes("children.care") && childIds.length) {
    const kids = await db.select().from(children).where(inArray(children.id, childIds));
    const pickups = await db.select().from(authorizedPickups).where(inArray(authorizedPickups.familyId, familyIds));
    const guards = await db.select().from(guardians).where(inArray(guardians.familyId, familyIds));
    for (const r of list) {
      const k = kids.find((x) => x.id === r.childId)!;
      r.care = { allergies: k.allergies, medicalNotes: k.medicalNotes, careNotes: k.careNotes };
      r.pickups = [
        ...guards.filter((g) => g.familyId === r.familyId).map((g) => ({ id: `guardian:${g.id}`, name: `${g.firstName} ${g.lastName}`, relationship: g.relationship ?? "Guardian", phone: g.phone, isRestricted: false, restrictionNote: null })),
        ...pickups
          .filter((pk) => pk.familyId === r.familyId && (!pk.childId || pk.childId === r.childId))
          .map((pk) => ({ id: pk.id, name: pk.name, relationship: pk.relationship, phone: pk.phone, isRestricted: pk.isRestricted, restrictionNote: pk.restrictionNote })),
      ];
    }
  }
  if (perms.includes("families.view") && familyIds.length) {
    const guards = await db.select().from(guardians).where(inArray(guardians.familyId, familyIds));
    const emerg = await db.select().from(emergencyContacts).where(inArray(emergencyContacts.familyId, familyIds));
    for (const r of list) {
      r.contacts = [
        ...guards.filter((g) => g.familyId === r.familyId).map((g) => ({ name: `${g.firstName} ${g.lastName}`, relationship: g.relationship, phone: g.phone, email: g.email })),
        ...emerg.filter((e) => e.familyId === r.familyId && (!e.childId || e.childId === r.childId)).map((e) => ({ name: e.name, relationship: `Emergency · ${e.relationship ?? ""}`.trim(), phone: e.phone })),
      ];
    }
  }
  if (perms.includes("forms.view")) {
    for (const fid of familyIds) {
      const kids = list.filter((r) => r.familyId === fid).map((r) => r.childId);
      const status = await paperworkStatus(db, { familyId: fid, childIds: kids, programIds: [s.programId], sessionIds: [s.id], onDate: s.localDate });
      for (const r of list.filter((x) => x.familyId === fid))
        r.paperwork = [...(status.get(r.childId) ?? []), ...(status.get("family") ?? [])].filter((i) => i.state !== "complete");
    }
  }
  list.sort((a, b) => Number(b.expected) - Number(a.expected) || a.name.localeCompare(b.name));
  return { session: s, program: p, children: list };
}

async function ensureRecord(db: Executor, sessionId: string, childId: string) {
  const [existing] = await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.childId, childId)));
  if (existing) return existing;
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  const [item] = await db
    .select()
    .from(bookingItems)
    .where(and(eq(bookingItems.sessionId, sessionId), eq(bookingItems.childId, childId), eq(bookingItems.status, "confirmed")));
  const member = s.cohortId ? (await membershipsForCohortDay(db, s.cohortId, s.programId, s.localDate)).find((m) => m.c.id === childId) : undefined;
  if (!item && !member) throw new OpsError("not_expected", "This child isn’t booked for this session.");
  const [rec] = await db
    .insert(attendanceRecords)
    .values({ sessionId, childId, bookingItemId: item?.id ?? null, membershipId: member?.m.id ?? null })
    .onConflictDoNothing()
    .returning();
  return rec ?? (await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.childId, childId))))[0];
}

export async function checkIn(db: DB, actor: Actor, input: { sessionId: string; childId: string; note?: string; at?: Date }) {
  const rec = await ensureRecord(db, input.sessionId, input.childId);
  if (rec.status === "checked_in") return rec;
  const [r] = await db
    .update(attendanceRecords)
    .set({ status: "checked_in", checkedInAt: input.at ?? new Date(), checkedInBy: actor.name, notes: input.note ?? rec.notes, updatedAt: new Date() })
    .where(eq(attendanceRecords.id, rec.id))
    .returning();
  if (rec.bookingItemId) await db.update(bookingItems).set({ attendance: "present" }).where(eq(bookingItems.id, rec.bookingItemId));
  await audit(db, actor, { action: "attendance.check_in", entityType: "child", entityId: input.childId, summary: "Checked in" });
  return r;
}

/** Check-out requires an authorized adult. Restricted people are refused. */
export async function checkOut(db: DB, actor: Actor, input: { sessionId: string; childId: string; pickupId: string; note?: string; at?: Date }) {
  const rec = await ensureRecord(db, input.sessionId, input.childId);
  if (rec.status !== "checked_in") throw new OpsError("invalid", "Check the child in before checking out.");
  const [child] = await db.select().from(children).where(eq(children.id, input.childId));
  let collectedBy: string;
  let pickupId: string | null = null;
  if (input.pickupId.startsWith("guardian:")) {
    const [g] = await db.select().from(guardians).where(and(eq(guardians.id, input.pickupId.slice(9)), eq(guardians.familyId, child.familyId)));
    if (!g) throw new OpsError("not_authorized", "That person isn’t a guardian for this child.");
    collectedBy = `${g.firstName} ${g.lastName}`;
  } else {
    const [pk] = await db.select().from(authorizedPickups).where(eq(authorizedPickups.id, input.pickupId));
    if (!pk || pk.familyId !== child.familyId || (pk.childId && pk.childId !== child.id)) throw new OpsError("not_authorized", "That person isn’t authorized to collect this child.");
    if (pk.isRestricted) throw new OpsError("restricted", `${pk.name} is NOT permitted to collect this child. ${pk.restrictionNote ?? ""}`.trim());
    collectedBy = pk.name;
    pickupId = pk.id;
  }
  const [r] = await db
    .update(attendanceRecords)
    .set({ status: "checked_out", checkedOutAt: input.at ?? new Date(), checkedOutBy: actor.name, collectedByPickupId: pickupId, collectedByName: collectedBy, notes: input.note ?? rec.notes, updatedAt: new Date() })
    .where(eq(attendanceRecords.id, rec.id))
    .returning();
  await audit(db, actor, { action: "attendance.check_out", entityType: "child", entityId: input.childId, summary: `Checked out, collected by ${collectedBy}` });
  return r;
}

/** Records an absence. Never cancels, refunds or (unless policy allows) releases a member's spot. */
export async function markAbsent(db: DB, actor: Actor, input: { sessionId: string; childId: string; note?: string }) {
  const rec = await ensureRecord(db, input.sessionId, input.childId);
  await db.update(attendanceRecords).set({ status: "absent", notes: input.note ?? rec.notes, updatedAt: new Date() }).where(eq(attendanceRecords.id, rec.id));
  if (rec.bookingItemId) await db.update(bookingItems).set({ attendance: "absent" }).where(eq(bookingItems.id, rec.bookingItemId));
  if (rec.membershipId) {
    const [s] = await db.select().from(sessions).where(eq(sessions.id, input.sessionId));
    const release = (await getPolicy(db, "membership.absenceReleasesSpot")) === true && s.startsAt > new Date();
    await db
      .insert(membershipExceptions)
      .values({ membershipId: rec.membershipId, date: s.localDate, kind: "absence", releasesSpot: release, note: input.note ?? null, createdBy: actor.name })
      .onConflictDoNothing();
  }
  await audit(db, actor, { action: "attendance.absent", entityType: "child", entityId: input.childId, summary: "Marked absent" });
}

export async function undoAttendance(db: DB, actor: Actor, input: { sessionId: string; childId: string }) {
  const rec = await ensureRecord(db, input.sessionId, input.childId);
  await db
    .update(attendanceRecords)
    .set({ status: "expected", checkedInAt: null, checkedInBy: null, checkedOutAt: null, checkedOutBy: null, collectedByName: null, collectedByPickupId: null, updatedAt: new Date() })
    .where(eq(attendanceRecords.id, rec.id));
  if (rec.bookingItemId) await db.update(bookingItems).set({ attendance: "expected" }).where(eq(bookingItems.id, rec.bookingItemId));
  await audit(db, actor, { action: "attendance.reset", entityType: "child", entityId: input.childId, summary: "Reset attendance" });
}

