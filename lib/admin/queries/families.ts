import "server-only";
/**
 * Read models for the Families, Children, Club Yalla and Forms screens.
 * Every loader takes the staff context and strips fields the viewer may not see,
 * so permissions are enforced on the server, not by hiding UI.
 */
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { StaffContext } from "@/lib/auth/staff";
import { can, staffActor } from "@/lib/auth/staff";
import { audit } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import {
  attendanceRecords,
  auditLog,
  authorizedPickups,
  bookingItems,
  bookings,
  children,
  cohorts,
  emergencyContacts,
  families,
  familyNotes,
  formRequirements,
  formSubmissions,
  formTemplates,
  formVersions,
  guardians,
  membershipChanges,
  membershipExceptions,
  memberships,
  messages,
  programPrices,
  programs,
  scheduledCharges,
  sessions,
  staffUsers,
  documents,
} from "@/lib/db/schema";
import { familyLedger } from "@/lib/ops/billing";
import { paperworkStatus, type PaperworkItem } from "@/lib/ops/forms";
import { searchFamilies } from "@/lib/ops/families";
import { todayLA } from "@/lib/time";

export type Paperwork = Map<string, PaperworkItem[]>;

/** Programs a family is currently engaged with (for working out which forms apply). */
async function engagedPrograms(db: Executor, familyId: string) {
  const today = todayLA();
  const booked = await db
    .selectDistinct({ programId: sessions.programId, sessionId: sessions.id })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .where(and(eq(bookings.familyId, familyId), inArray(bookingItems.status, ["confirmed", "held"]), gte(sessions.localDate, today)));
  const member = await db
    .selectDistinct({ programId: memberships.programId })
    .from(memberships)
    .where(and(eq(memberships.familyId, familyId), inArray(memberships.status, ["active", "upcoming", "paused"])));
  return {
    programIds: [...new Set([...booked.map((b) => b.programId), ...member.map((m) => m.programId)])],
    sessionIds: [...new Set(booked.map((b) => b.sessionId))],
  };
}

export async function familyPaperwork(db: Executor, familyId: string, childIds: string[]) {
  const ctx = await engagedPrograms(db, familyId);
  return paperworkStatus(db, { familyId, childIds, ...ctx });
}

export const openPaperworkCount = (p: Paperwork) => [...p.values()].flat().filter((i) => i.state !== "complete" && i.enforcement !== "informational").length;

/* ── Directory ── */

export async function familyDirectory(db: Executor, staff: StaffContext, q: string, opts: { archived?: boolean } = {}) {
  let rows = await searchFamilies(db, q, 60);
  if (!opts.archived) rows = rows.filter((f) => f.status === "active");
  else rows = rows.filter((f) => f.status === "archived");
  if (opts.archived && !q.trim()) rows = await db.select().from(families).where(eq(families.status, "archived")).orderBy(asc(families.name)).limit(60);
  const ids = rows.map((f) => f.id);
  if (!ids.length) return [];
  const [gs, kids, mems] = await Promise.all([
    db.select().from(guardians).where(inArray(guardians.familyId, ids)).orderBy(desc(guardians.isPrimary)),
    db.select().from(children).where(inArray(children.familyId, ids)).orderBy(asc(children.birthDate)),
    db
      .select({ familyId: memberships.familyId, childId: memberships.childId, status: memberships.status })
      .from(memberships)
      .where(and(inArray(memberships.familyId, ids), inArray(memberships.status, ["active", "upcoming", "paused"]))),
  ]);
  const showMoney = can(staff, "billing.view");
  const showForms = can(staff, "forms.view");
  return Promise.all(
    rows.map(async (f) => {
      const fk = kids.filter((k) => k.familyId === f.id);
      let balance: number | null = null;
      let credit: number | null = null;
      if (showMoney) {
        const l = await familyLedger(db, f.id);
        balance = l.outstanding;
        credit = l.credit;
      }
      let paperworkIssues: number | null = null;
      if (showForms)
        paperworkIssues = openPaperworkCount(
          await familyPaperwork(
            db,
            f.id,
            fk.map((k) => k.id),
          ),
        );
      return {
        family: f,
        guardians: gs.filter((g) => g.familyId === f.id).map((g) => ({ id: g.id, name: `${g.firstName} ${g.lastName}`, email: g.email, phone: g.phone, isPrimary: g.isPrimary })),
        children: fk.map((k) => ({ id: k.id, name: k.preferredName || k.firstName, lastName: k.lastName, birthDate: k.birthDate, member: mems.some((m) => m.childId === k.id) })),
        isMember: mems.some((m) => m.familyId === f.id),
        balance,
        credit,
        paperworkIssues,
      };
    }),
  );
}

/* ── Family profile ── */

export async function familyProfile(db: Executor, staff: StaffContext, familyId: string) {
  const [family] = await db.select().from(families).where(eq(families.id, familyId));
  if (!family) return null;
  const care = can(staff, "children.care");
  const [gs, kids, cohortRows, mems, notesRows] = await Promise.all([
    db.select().from(guardians).where(eq(guardians.familyId, familyId)).orderBy(desc(guardians.isPrimary), asc(guardians.createdAt)),
    db.select().from(children).where(eq(children.familyId, familyId)).orderBy(asc(children.birthDate)),
    db.select().from(cohorts).orderBy(asc(cohorts.sortOrder)),
    db
      .select({ m: memberships, c: children, co: cohorts })
      .from(memberships)
      .innerJoin(children, eq(children.id, memberships.childId))
      .innerJoin(cohorts, eq(cohorts.id, memberships.cohortId))
      .where(eq(memberships.familyId, familyId))
      .orderBy(desc(memberships.startsOn)),
    db
      .select()
      .from(familyNotes)
      .where(and(eq(familyNotes.familyId, familyId), care ? undefined : eq(familyNotes.visibility, "staff")))
      .orderBy(desc(familyNotes.createdAt))
      .limit(40),
  ]);
  const today = todayLA();
  const bookingRows = await db
    .select({ b: bookings, i: bookingItems, s: sessions, p: programs, c: children })
    .from(bookings)
    .innerJoin(bookingItems, eq(bookingItems.bookingId, bookings.id))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .leftJoin(children, eq(children.id, bookingItems.childId))
    .where(eq(bookings.familyId, familyId))
    .orderBy(desc(sessions.startsAt))
    .limit(200);
  const grouped = new Map<string, { booking: typeof bookings.$inferSelect; firstDate: string; lastDate: string; programs: Set<string>; children: Set<string>; items: number }>();
  for (const r of bookingRows) {
    if (r.b.status === "expired" && r.b.source !== "admin") continue;
    const g = grouped.get(r.b.id) ?? { booking: r.b, firstDate: r.s.localDate, lastDate: r.s.localDate, programs: new Set(), children: new Set(), items: 0 };
    if (r.s.localDate < g.firstDate) g.firstDate = r.s.localDate;
    if (r.s.localDate > g.lastDate) g.lastDate = r.s.localDate;
    g.programs.add(r.p.name);
    if (r.c) g.children.add(r.c.preferredName || r.c.firstName);
    g.items++;
    grouped.set(r.b.id, g);
  }
  const allBookings = [...grouped.values()].map((g) => ({ ...g, programs: [...g.programs], children: [...g.children] }));
  const upcoming = allBookings.filter((b) => b.lastDate >= today && !["cancelled", "expired"].includes(b.booking.status)).sort((a, b) => a.firstDate.localeCompare(b.firstDate));
  const past = allBookings.filter((b) => !upcoming.includes(b)).slice(0, 25);

  const ledger = can(staff, "billing.view") ? await familyLedger(db, familyId) : null;
  const paperwork = can(staff, "forms.view")
    ? await familyPaperwork(
        db,
        familyId,
        kids.map((k) => k.id),
      )
    : null;
  const pickups = care ? await db.select().from(authorizedPickups).where(eq(authorizedPickups.familyId, familyId)).orderBy(asc(authorizedPickups.name)) : null;
  const emergency = await db.select().from(emergencyContacts).where(eq(emergencyContacts.familyId, familyId)).orderBy(asc(emergencyContacts.priority));
  const comms = can(staff, "communications.view")
    ? await db.select().from(messages).where(eq(messages.familyId, familyId)).orderBy(desc(messages.createdAt)).limit(8)
    : null;
  const history = can(staff, "audit.view")
    ? await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityType, "family"), eq(auditLog.entityId, familyId)))
        .orderBy(desc(auditLog.at))
        .limit(15)
    : null;

  return {
    family,
    guardians: gs,
    children: kids.map((k) => ({
      ...k,
      allergies: care ? k.allergies : null,
      medicalNotes: care ? k.medicalNotes : null,
      careNotes: care ? k.careNotes : null,
      staffNotes: can(staff, "children.staffNotes") ? k.staffNotes : null,
      cohortName: cohortRows.find((c) => c.id === k.cohortId)?.name ?? null,
    })),
    cohorts: cohortRows,
    memberships: can(staff, "memberships.view") ? mems : [],
    upcoming,
    past,
    ledger,
    paperwork,
    pickups,
    emergency,
    notes: notesRows,
    comms,
    history,
  };
}

/* ── Child profile ── */

export async function childProfile(db: Executor, staff: StaffContext, childId: string) {
  const [child] = await db.select().from(children).where(eq(children.id, childId));
  if (!child) return null;
  const [family] = await db.select().from(families).where(eq(families.id, child.familyId));
  const care = can(staff, "children.care");
  const staffNotesOk = can(staff, "children.staffNotes");
  const today = todayLA();
  const [cohortRows, mems, itemRows, att, emergency, pickups, gs] = await Promise.all([
    db.select().from(cohorts).orderBy(asc(cohorts.sortOrder)),
    db
      .select({ m: memberships, co: cohorts })
      .from(memberships)
      .innerJoin(cohorts, eq(cohorts.id, memberships.cohortId))
      .where(eq(memberships.childId, childId))
      .orderBy(desc(memberships.startsOn)),
    db
      .select({ i: bookingItems, b: bookings, s: sessions, p: programs })
      .from(bookingItems)
      .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
      .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
      .innerJoin(programs, eq(programs.id, sessions.programId))
      .where(and(eq(bookingItems.childId, childId), sql`${bookings.status} <> 'expired'`))
      .orderBy(desc(sessions.startsAt))
      .limit(100),
    db
      .select({ a: attendanceRecords, s: sessions, p: programs })
      .from(attendanceRecords)
      .innerJoin(sessions, eq(sessions.id, attendanceRecords.sessionId))
      .innerJoin(programs, eq(programs.id, sessions.programId))
      .where(eq(attendanceRecords.childId, childId))
      .orderBy(desc(sessions.startsAt))
      .limit(60),
    db
      .select()
      .from(emergencyContacts)
      .where(and(eq(emergencyContacts.familyId, child.familyId), or(sql`${emergencyContacts.childId} IS NULL`, eq(emergencyContacts.childId, childId))))
      .orderBy(asc(emergencyContacts.priority)),
    care
      ? db
          .select()
          .from(authorizedPickups)
          .where(and(eq(authorizedPickups.familyId, child.familyId), or(sql`${authorizedPickups.childId} IS NULL`, eq(authorizedPickups.childId, childId))))
      : Promise.resolve(null),
    db.select().from(guardians).where(eq(guardians.familyId, child.familyId)).orderBy(desc(guardians.isPrimary)),
  ]);
  const upcomingItems = itemRows.filter((r) => r.s.localDate >= today && r.i.status === "confirmed").sort((a, b) => a.s.localDate.localeCompare(b.s.localDate));
  const nextSessionDate = upcomingItems[0]?.s.localDate ?? null;
  const paperwork = can(staff, "forms.view") ? (await familyPaperwork(db, child.familyId, [childId])) : null;
  const notes = await db
    .select()
    .from(familyNotes)
    .where(and(eq(familyNotes.childId, childId), care ? undefined : eq(familyNotes.visibility, "staff")))
    .orderBy(desc(familyNotes.createdAt))
    .limit(30);
  return {
    child: {
      ...child,
      allergies: care ? child.allergies : null,
      medicalNotes: care ? child.medicalNotes : null,
      careNotes: care ? child.careNotes : null,
      staffNotes: staffNotesOk ? child.staffNotes : null,
    },
    family,
    guardians: gs.map((g) => ({ id: g.id, name: `${g.firstName} ${g.lastName}`, relationship: g.relationship, phone: can(staff, "families.view") ? g.phone : null, email: g.email, isPrimary: g.isPrimary })),
    cohorts: cohortRows,
    memberships: mems,
    upcoming: upcomingItems,
    history: itemRows.filter((r) => !upcomingItems.includes(r)),
    attendance: att,
    emergency,
    pickups,
    paperwork,
    nextSessionDate,
    notes,
    canCare: care,
    canStaffNotes: staffNotesOk,
  };
}

/* ── Memberships ── */

export async function membershipList(db: Executor, f: { status?: string; cohortId?: string; weekday?: number; q?: string }) {
  const rows = await db
    .select({ m: memberships, c: children, f: families, co: cohorts })
    .from(memberships)
    .innerJoin(children, eq(children.id, memberships.childId))
    .innerJoin(families, eq(families.id, memberships.familyId))
    .innerJoin(cohorts, eq(cohorts.id, memberships.cohortId))
    .where(
      and(
        f.status ? eq(memberships.status, f.status) : inArray(memberships.status, ["active", "upcoming", "paused"]),
        f.cohortId ? eq(memberships.cohortId, f.cohortId) : undefined,
        f.weekday != null ? sql`${f.weekday} = ANY(${memberships.weekdays})` : undefined,
        f.q ? or(sql`${children.firstName} ILIKE ${"%" + f.q + "%"}`, sql`${children.lastName} ILIKE ${"%" + f.q + "%"}`, sql`${families.name} ILIKE ${"%" + f.q + "%"}`) : undefined,
      ),
    )
    .orderBy(asc(cohorts.sortOrder), asc(children.firstName));
  return rows;
}

export async function clubPriceTable(db: Executor) {
  const [club] = await db.select().from(programs).where(eq(programs.kind, "membership")).limit(1);
  if (!club) return { club: null, prices: [] as (typeof programPrices.$inferSelect)[] };
  const prices = await db
    .select()
    .from(programPrices)
    .where(and(eq(programPrices.programId, club.id), eq(programPrices.unit, "month"), eq(programPrices.active, true)));
  return { club, prices };
}

export async function membershipDetail(db: Executor, id: string) {
  const [row] = await db
    .select({ m: memberships, c: children, f: families, co: cohorts, p: programs })
    .from(memberships)
    .innerJoin(children, eq(children.id, memberships.childId))
    .innerJoin(families, eq(families.id, memberships.familyId))
    .innerJoin(cohorts, eq(cohorts.id, memberships.cohortId))
    .innerJoin(programs, eq(programs.id, memberships.programId))
    .where(eq(memberships.id, id));
  if (!row) return null;
  const [changes, exceptions, charges, history, related] = await Promise.all([
    db.select().from(membershipChanges).where(eq(membershipChanges.membershipId, id)).orderBy(desc(membershipChanges.effectiveOn)),
    db.select().from(membershipExceptions).where(eq(membershipExceptions.membershipId, id)).orderBy(desc(membershipExceptions.date)).limit(60),
    db.select().from(scheduledCharges).where(eq(scheduledCharges.membershipId, id)).orderBy(asc(scheduledCharges.scheduledFor)),
    db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "membership"), eq(auditLog.entityId, id)))
      .orderBy(desc(auditLog.at))
      .limit(40),
    // Earlier/later memberships for the same child (planned changes split memberships).
    db
      .select({ m: memberships, co: cohorts })
      .from(memberships)
      .innerJoin(cohorts, eq(cohorts.id, memberships.cohortId))
      .where(and(eq(memberships.childId, row.c.id), sql`${memberships.id} <> ${id}`))
      .orderBy(desc(memberships.startsOn)),
  ]);
  return { ...row, changes, exceptions, charges, history, related };
}

/* ── Forms ── */

export async function formsOverview(db: Executor) {
  const ts = await db.select().from(formTemplates).orderBy(asc(formTemplates.status), asc(formTemplates.title));
  const ids = ts.map((t) => t.id);
  if (!ids.length) return [];
  const [vers, reqs, subs] = await Promise.all([
    db.select().from(formVersions).where(inArray(formVersions.templateId, ids)),
    db.select().from(formRequirements).where(and(inArray(formRequirements.templateId, ids), eq(formRequirements.active, true))),
    db
      .select({ templateId: formSubmissions.templateId, versionId: formSubmissions.versionId, n: sql<number>`count(*)::int` })
      .from(formSubmissions)
      .where(and(inArray(formSubmissions.templateId, ids), inArray(formSubmissions.status, ["submitted", "signed"])))
      .groupBy(formSubmissions.templateId, formSubmissions.versionId),
  ]);
  return ts.map((t) => {
    const current = vers.find((v) => v.id === t.currentVersionId);
    return {
      template: t,
      current,
      versions: vers.filter((v) => v.templateId === t.id).length,
      requirements: reqs.filter((r) => r.templateId === t.id),
      completedCurrent: subs.filter((s) => s.templateId === t.id && s.versionId === t.currentVersionId).reduce((a, s) => a + s.n, 0),
      completedAny: subs.filter((s) => s.templateId === t.id).reduce((a, s) => a + s.n, 0),
    };
  });
}

export async function formDetail(db: Executor, id: string) {
  const [t] = await db.select().from(formTemplates).where(eq(formTemplates.id, id));
  if (!t) return null;
  const [vers, reqs, subs] = await Promise.all([
    db.select().from(formVersions).where(eq(formVersions.templateId, id)).orderBy(desc(formVersions.version)),
    db
      .select({ r: formRequirements, p: programs, f: families, c: children })
      .from(formRequirements)
      .leftJoin(programs, eq(programs.id, formRequirements.programId))
      .leftJoin(families, eq(families.id, formRequirements.familyId))
      .leftJoin(children, eq(children.id, formRequirements.childId))
      .where(and(eq(formRequirements.templateId, id), eq(formRequirements.active, true)))
      .orderBy(asc(formRequirements.createdAt)),
    db
      .select({ s: formSubmissions, f: families, c: children, v: formVersions })
      .from(formSubmissions)
      .innerJoin(families, eq(families.id, formSubmissions.familyId))
      .innerJoin(formVersions, eq(formVersions.id, formSubmissions.versionId))
      .leftJoin(children, eq(children.id, formSubmissions.childId))
      .where(eq(formSubmissions.templateId, id))
      .orderBy(desc(formSubmissions.createdAt))
      .limit(200),
  ]);
  return { template: t, versions: vers, requirements: reqs, submissions: subs };
}

export async function submissionDetail(db: Executor, id: string) {
  const [row] = await db
    .select({ s: formSubmissions, t: formTemplates, v: formVersions, f: families, c: children })
    .from(formSubmissions)
    .innerJoin(formTemplates, eq(formTemplates.id, formSubmissions.templateId))
    .innerJoin(formVersions, eq(formVersions.id, formSubmissions.versionId))
    .innerJoin(families, eq(families.id, formSubmissions.familyId))
    .leftJoin(children, eq(children.id, formSubmissions.childId))
    .where(eq(formSubmissions.id, id));
  if (!row) return null;
  const [doc] = row.s.documentId
    ? await db.select({ id: documents.id, filename: documents.filename, size: documents.size, mimeType: documents.mimeType, createdAt: documents.createdAt }).from(documents).where(eq(documents.id, row.s.documentId))
    : [];
  const [recorder] = row.s.recordedByStaffId ? await db.select({ name: staffUsers.name }).from(staffUsers).where(eq(staffUsers.id, row.s.recordedByStaffId)) : [];
  return { ...row, document: doc ?? null, recordedBy: recorder?.name ?? null };
}

/** Private document access: only staff with forms.documents; every download is audited. */
export async function openDocument(db: Executor, staff: StaffContext | null, documentId: string) {
  if (!staff || (staff.mfaEnabled && !staff.mfaVerified)) return { status: 401 as const };
  if (!can(staff, "forms.documents")) return { status: 403 as const };
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) return { status: 404 as const };
  await audit(db, staffActor(staff), { action: "documents.download", entityType: "document", entityId: doc.id, summary: `Downloaded ${doc.filename}` });
  return { status: 200 as const, doc };
}

/** Children & families with outstanding paperwork among those attending in a date range. */
export async function outstandingPaperwork(db: Executor, f: { from: string; to: string; programId?: string }) {
  const items = await db
    .selectDistinct({ childId: bookingItems.childId, familyId: bookings.familyId, programId: sessions.programId, sessionId: sessions.id })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .where(and(eq(bookingItems.status, "confirmed"), gte(sessions.localDate, f.from), lte(sessions.localDate, f.to), f.programId ? eq(sessions.programId, f.programId) : undefined));
  const mem = await db
    .select({ childId: memberships.childId, familyId: memberships.familyId, programId: memberships.programId })
    .from(memberships)
    .where(
      and(
        inArray(memberships.status, ["active", "upcoming", "paused"]),
        lte(memberships.startsOn, f.to),
        or(sql`${memberships.endsOn} IS NULL`, gte(memberships.endsOn, f.from)),
        f.programId ? eq(memberships.programId, f.programId) : undefined,
      ),
    );
  const byFamily = new Map<string, { childIds: Set<string>; programIds: Set<string>; sessionIds: Set<string> }>();
  for (const r of [...items, ...mem.map((m) => ({ ...m, sessionId: null as string | null }))]) {
    const e = byFamily.get(r.familyId) ?? { childIds: new Set(), programIds: new Set(), sessionIds: new Set() };
    if (r.childId) e.childIds.add(r.childId);
    e.programIds.add(r.programId);
    if (r.sessionId) e.sessionIds.add(r.sessionId);
    byFamily.set(r.familyId, e);
  }
  if (!byFamily.size) return [];
  const famRows = await db.select().from(families).where(inArray(families.id, [...byFamily.keys()]));
  const kidRows = await db
    .select()
    .from(children)
    .where(
      inArray(
        children.id,
        [...byFamily.values()].flatMap((e) => [...e.childIds]),
      ),
    );
  const out: { family: typeof families.$inferSelect; rows: { childId: string | null; childName: string | null; items: PaperworkItem[] }[] }[] = [];
  for (const [familyId, e] of byFamily) {
    const status = await paperworkStatus(db, { familyId, childIds: [...e.childIds], programIds: [...e.programIds], sessionIds: [...e.sessionIds], onDate: f.from });
    const rows: (typeof out)[number]["rows"] = [];
    for (const [key, list] of status) {
      const open = list.filter((i) => i.state !== "complete" && i.enforcement !== "informational");
      if (!open.length) continue;
      const kid = kidRows.find((k) => k.id === key);
      rows.push({ childId: key === "family" ? null : key, childName: kid ? `${kid.preferredName || kid.firstName} ${kid.lastName}` : null, items: open });
    }
    if (rows.length) out.push({ family: famRows.find((x) => x.id === familyId)!, rows });
  }
  return out.sort((a, b) => a.family.name.localeCompare(b.family.name));
}
