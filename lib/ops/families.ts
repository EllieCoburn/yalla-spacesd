/**
 * Families, guardians and children.
 *
 * - Guardians are individuals with their own email/login and their own access flags; linking an
 *   adult to a family does not automatically grant billing or sensitive access.
 * - Family-provided care information and staff-only notes are separate fields with their own
 *   "last updated" stamps.
 * - Existing customers are matched by guardian email (and children by name + birth date) so a
 *   returning family isn't duplicated.
 */
import { and, asc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { audit, diff, OpsError, type Actor } from "@/lib/audit";
import type { DB, Executor } from "@/lib/db";
import { attendanceRecords, authorizedPickups, bookingItems, bookings, children, documents, emergencyContacts, families, familyNotes, formRequirements, formSubmissions, guardians, lateFees, memberships, sessions, waitlistEntries } from "@/lib/db/schema";
import { flexHoldName, heldParagraph, isFlexHoldKey } from "@/lib/booking/flex-hold";

const clean = (s?: string | null) => (s ?? "").trim();

/** A phone number Yalla can call: at least 10 digits (spaces, dashes, dots and brackets are fine). */
export function phoneProblem(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? null : "Enter a phone number we can reach you on, with the area code.";
}

export async function findGuardianByEmail(db: Executor, email: string) {
  const [g] = await db
    .select()
    .from(guardians)
    .where(sql`lower(${guardians.email}) = ${clean(email).toLowerCase()}`);
  return g ?? null;
}

export async function createFamily(
  db: Executor,
  actor: Actor,
  input: { name?: string; guardian: { firstName: string; lastName: string; email: string; phone?: string; relationship?: string; portalAccess?: boolean }; marketingOptIn?: boolean; isSample?: boolean },
) {
  const g = input.guardian;
  if (!clean(g.firstName) || !clean(g.lastName)) throw new OpsError("invalid", "Enter the guardian’s first and last name.");
  if (!/^\S+@\S+\.\S+$/.test(clean(g.email))) throw new OpsError("invalid", "Enter a valid email address.");
  const existing = await findGuardianByEmail(db, g.email);
  if (existing) throw new OpsError("duplicate", "A guardian with that email already exists.", { familyId: existing.familyId });
  const [f] = await db
    .insert(families)
    .values({ name: clean(input.name) || `${clean(g.lastName)} family`, marketingOptIn: input.marketingOptIn ?? false, isSample: input.isSample ?? false })
    .returning();
  const [guardian] = await db
    .insert(guardians)
    .values({ familyId: f.id, firstName: clean(g.firstName), lastName: clean(g.lastName), email: clean(g.email).toLowerCase(), phone: clean(g.phone) || null, relationship: clean(g.relationship) || "Parent", isPrimary: true, canViewBilling: true, canViewSensitive: true, portalAccess: g.portalAccess ?? true })
    .returning();
  await audit(db, actor, { action: "family.create", entityType: "family", entityId: f.id, summary: `Created ${f.name}` });
  return { family: f, guardian };
}

export async function addGuardian(
  db: Executor,
  actor: Actor,
  familyId: string,
  g: { firstName: string; lastName: string; email: string; phone?: string; relationship?: string; canBook?: boolean; canViewBilling?: boolean; canViewSensitive?: boolean; portalAccess?: boolean },
) {
  if (!/^\S+@\S+\.\S+$/.test(clean(g.email))) throw new OpsError("invalid", "Enter a valid email address.");
  if (await findGuardianByEmail(db, g.email)) throw new OpsError("duplicate", "That email already belongs to a guardian.");
  const [row] = await db
    .insert(guardians)
    .values({
      familyId,
      firstName: clean(g.firstName),
      lastName: clean(g.lastName),
      email: clean(g.email).toLowerCase(),
      phone: clean(g.phone) || null,
      relationship: clean(g.relationship) || null,
      canBook: g.canBook ?? true,
      canViewBilling: g.canViewBilling ?? false,
      canViewSensitive: g.canViewSensitive ?? false,
      portalAccess: g.portalAccess ?? true,
    })
    .returning();
  await audit(db, actor, { action: "family.guardian_add", entityType: "family", entityId: familyId, summary: `Added guardian ${row.firstName} ${row.lastName}` });
  return row;
}

export async function updateGuardian(db: Executor, actor: Actor, guardianId: string, patch: Partial<typeof guardians.$inferInsert>) {
  const [g] = await db.select().from(guardians).where(eq(guardians.id, guardianId));
  if (!g) throw new OpsError("not_found", "Guardian not found.");
  if (patch.email && clean(patch.email).toLowerCase() !== g.email) {
    const other = await findGuardianByEmail(db, patch.email);
    if (other) throw new OpsError("duplicate", "That email already belongs to another guardian.");
    patch.email = clean(patch.email).toLowerCase();
  }
  await db.update(guardians).set({ ...patch, updatedAt: new Date() }).where(eq(guardians.id, guardianId));
  await audit(db, actor, { action: "family.guardian_update", entityType: "family", entityId: g.familyId, summary: `Updated ${g.firstName} ${g.lastName}`, changes: diff(g as Record<string, unknown>, patch as Record<string, unknown>) });
}

export async function addChild(db: Executor, actor: Actor, familyId: string, input: { firstName: string; lastName: string; preferredName?: string; birthDate: string; allergies?: string; medicalNotes?: string; careNotes?: string; cohortId?: string | null; flexHold?: string | null }) {
  if (!clean(input.firstName) || !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) throw new OpsError("invalid", "Enter the child’s name and date of birth.");
  const dup = await db
    .select()
    .from(children)
    .where(and(eq(children.familyId, familyId), sql`lower(${children.firstName}) = ${clean(input.firstName).toLowerCase()}`, eq(children.birthDate, input.birthDate)));
  if (dup.length) return { child: dup[0], existed: true };
  const [c] = await db
    .insert(children)
    .values({
      familyId,
      firstName: clean(input.firstName),
      lastName: clean(input.lastName),
      preferredName: clean(input.preferredName) || null,
      birthDate: input.birthDate,
      allergies: clean(input.allergies) || null,
      medicalNotes: clean(input.medicalNotes) || null,
      careNotes: clean(input.careNotes) || null,
      cohortId: input.cohortId ?? null,
      ...(isFlexHoldKey(input.flexHold) ? { flexHold: input.flexHold, flexHoldSetAt: new Date(), flexHoldSetBy: actor.name } : {}),
      infoUpdatedAt: new Date(),
      infoUpdatedBy: actor.name,
    })
    .returning();
  await audit(db, actor, { action: "family.child_add", entityType: "child", entityId: c.id, summary: `Added child ${c.firstName}${c.flexHold ? `, held in ${flexHoldName(c.flexHold)} for Yalla Flex` : ""}` });
  return { child: c, existed: false };
}

/**
 * Allergies and medications, asked of every family before payment. `""` means "none known";
 * null means we haven't asked yet. Medications are kept in the child's medical notes.
 */
export const careAnswered = (c: { allergies: string | null; medicalNotes: string | null }) => c.allergies !== null && c.medicalNotes !== null;
export const CARE_REQUIRED = "Tell us whether each child has any known allergies or takes any medications.";

/** Whether a family's answer is complete: "" for none, or the details. */
export const careValid = (v: unknown): v is string => typeof v === "string";

/** Saves a family's allergy and medication answers to the child's record. */
export async function recordCareAnswers(db: Executor, actor: Actor, childId: string, a: { allergies: string; medications: string }) {
  const allergies = clean(a.allergies).slice(0, 1000);
  const medicalNotes = clean(a.medications).slice(0, 1000);
  const [c] = await db.select().from(children).where(eq(children.id, childId));
  if (!c || (c.allergies === allergies && c.medicalNotes === medicalNotes)) return;
  await db.update(children).set({ allergies, medicalNotes, infoUpdatedAt: new Date(), infoUpdatedBy: actor.name }).where(eq(children.id, childId));
  await audit(db, actor, { action: "family.child_care", entityType: "child", entityId: childId, summary: `Allergies and medications updated for ${c.firstName}` });
}

export async function updateChild(
  db: Executor,
  actor: Actor,
  childId: string,
  patch: { firstName?: string; lastName?: string; preferredName?: string | null; birthDate?: string; cohortId?: string | null; allergies?: string | null; medicalNotes?: string | null; careNotes?: string | null; staffNotes?: string | null },
) {
  const [c] = await db.select().from(children).where(eq(children.id, childId));
  if (!c) throw new OpsError("not_found", "Child not found.");
  const familyFields = ["allergies", "medicalNotes", "careNotes"] as const;
  const now = new Date();
  const set: Record<string, unknown> = { ...patch };
  if (familyFields.some((f) => f in patch && patch[f] !== c[f])) {
    set.infoUpdatedAt = now;
    set.infoUpdatedBy = actor.name;
  }
  if ("staffNotes" in patch && patch.staffNotes !== c.staffNotes) {
    set.staffNotesUpdatedAt = now;
    set.staffNotesUpdatedBy = actor.name;
  }
  await db.update(children).set(set).where(eq(children.id, childId));
  await audit(db, actor, { action: "family.child_update", entityType: "child", entityId: childId, summary: `Updated ${c.firstName}’s profile`, changes: diff(c as Record<string, unknown>, patch as Record<string, unknown>) });
}

export async function setPickup(
  db: Executor,
  actor: Actor,
  familyId: string,
  input: { id?: string; childId?: string | null; name: string; relationship?: string; phone?: string; isRestricted?: boolean; restrictionNote?: string },
) {
  if (!clean(input.name)) throw new OpsError("invalid", "Enter the person’s name.");
  const values = {
    familyId,
    childId: input.childId ?? null,
    name: clean(input.name),
    relationship: clean(input.relationship) || null,
    phone: clean(input.phone) || null,
    isRestricted: input.isRestricted ?? false,
    restrictionNote: clean(input.restrictionNote) || null,
    updatedAt: new Date(),
    updatedBy: actor.name,
  };
  if (input.id) await db.update(authorizedPickups).set(values).where(and(eq(authorizedPickups.id, input.id), eq(authorizedPickups.familyId, familyId)));
  else await db.insert(authorizedPickups).values(values);
  await audit(db, actor, {
    action: input.isRestricted ? "family.pickup_restriction" : "family.pickup",
    entityType: "family",
    entityId: familyId,
    summary: `${input.id ? "Updated" : "Added"} ${input.isRestricted ? "departure restriction" : "departure contact"}: ${values.name}`,
  });
}

export async function removePickup(db: Executor, actor: Actor, familyId: string, pickupId: string) {
  const [p] = await db.delete(authorizedPickups).where(and(eq(authorizedPickups.id, pickupId), eq(authorizedPickups.familyId, familyId))).returning();
  if (p) await audit(db, actor, { action: "family.pickup_remove", entityType: "family", entityId: familyId, summary: `Removed departure contact ${p.name}` });
}

export async function setEmergencyContact(db: Executor, actor: Actor, familyId: string, input: { id?: string; childId?: string | null; name: string; relationship?: string; phone: string; priority?: number }) {
  if (!clean(input.name) || !clean(input.phone)) throw new OpsError("invalid", "Enter a name and phone number.");
  const values = { familyId, childId: input.childId ?? null, name: clean(input.name), relationship: clean(input.relationship) || null, phone: clean(input.phone), priority: input.priority ?? 1, updatedAt: new Date() };
  if (input.id) await db.update(emergencyContacts).set(values).where(and(eq(emergencyContacts.id, input.id), eq(emergencyContacts.familyId, familyId)));
  else await db.insert(emergencyContacts).values(values);
  await audit(db, actor, { action: "family.emergency_contact", entityType: "family", entityId: familyId, summary: `${input.id ? "Updated" : "Added"} emergency contact ${values.name}` });
}

export async function addFamilyNote(db: Executor, actor: Actor, input: { familyId: string; childId?: string | null; body: string; visibility: "staff" | "care" }) {
  if (!clean(input.body)) throw new OpsError("invalid", "Write a note first.");
  await db.insert(familyNotes).values({ familyId: input.familyId, childId: input.childId ?? null, body: clean(input.body), visibility: input.visibility, authorId: "id" in actor ? actor.id : null, authorName: actor.name });
  await audit(db, actor, { action: "family.note", entityType: "family", entityId: input.familyId, summary: `Added a ${input.visibility === "care" ? "care" : "staff"} note` });
}

export async function updateFamily(db: Executor, actor: Actor, familyId: string, patch: { name?: string; marketingOptIn?: boolean; communicationPrefs?: { email: boolean; sms: boolean } }) {
  const [f] = await db.select().from(families).where(eq(families.id, familyId));
  if (!f) throw new OpsError("not_found", "Family not found.");
  if (patch.name !== undefined && !clean(patch.name)) throw new OpsError("invalid", "The family needs a name.");
  const set = { ...patch, ...(patch.name !== undefined ? { name: clean(patch.name) } : {}) };
  await db
    .update(families)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(families.id, familyId));
  await audit(db, actor, { action: "family.update", entityType: "family", entityId: familyId, summary: "Updated family details & preferences", changes: diff(f as Record<string, unknown>, set as Record<string, unknown>) });
}

export async function removeEmergencyContact(db: Executor, actor: Actor, familyId: string, contactId: string) {
  const [c] = await db.delete(emergencyContacts).where(and(eq(emergencyContacts.id, contactId), eq(emergencyContacts.familyId, familyId))).returning();
  if (c) await audit(db, actor, { action: "family.emergency_contact_remove", entityType: "family", entityId: familyId, summary: `Removed emergency contact ${c.name}` });
}

export async function restoreFamily(db: Executor, actor: Actor, familyId: string) {
  await db.update(families).set({ status: "active", archivedAt: null }).where(eq(families.id, familyId));
  await audit(db, actor, { action: "family.restore", entityType: "family", entityId: familyId, summary: "Restored archived family" });
}

export async function archiveFamily(db: Executor, actor: Actor, familyId: string) {
  await db.update(families).set({ status: "archived", archivedAt: new Date() }).where(eq(families.id, familyId));
  await audit(db, actor, { action: "family.archive", entityType: "family", entityId: familyId, summary: "Archived family (records retained)" });
}

/** Fast directory search across family name, guardians and children. */
export async function searchFamilies(db: Executor, q: string, limit = 25) {
  const term = `%${clean(q)}%`;
  if (!clean(q)) {
    return db.select().from(families).where(eq(families.status, "active")).orderBy(asc(families.name)).limit(limit);
  }
  const g = await db
    .select({ familyId: guardians.familyId })
    .from(guardians)
    .where(or(ilike(guardians.firstName, term), ilike(guardians.lastName, term), ilike(guardians.email, term), ilike(guardians.phone, term)));
  const c = await db
    .select({ familyId: children.familyId })
    .from(children)
    .where(or(ilike(children.firstName, term), ilike(children.lastName, term), ilike(children.preferredName, term)));
  const ids = [...new Set([...g, ...c].map((x) => x.familyId))];
  return db
    .select()
    .from(families)
    .where(or(ilike(families.name, term), ids.length ? inArray(families.id, ids) : sql`false`))
    .orderBy(asc(families.name))
    .limit(limit);
}

/**
 * Holds a child in one Yalla Flex cohort (or releases the hold with null). Staff only: while held, the
 * child books that cohort's Flex days whatever their age, and no other Flex cohort.
 */
export async function setFlexHold(db: Executor, actor: Actor, childId: string, hold: string | null, opts: { baseUrl?: string } = {}) {
  if (hold !== null && !isFlexHoldKey(hold)) throw new OpsError("invalid", "Choose a Yalla Flex cohort.");
  const [c] = await db.select().from(children).where(eq(children.id, childId));
  if (!c) throw new OpsError("not_found", "Child not found.");
  if ((c.flexHold ?? null) === hold) return { ...c, notified: 0, unchanged: true };
  const [u] = await db
    .update(children)
    .set({ flexHold: hold, flexHoldSetAt: hold ? new Date() : null, flexHoldSetBy: hold ? actor.name : null })
    .where(eq(children.id, childId))
    .returning();
  const name = c.preferredName || c.firstName;
  await audit(db, actor, {
    action: hold ? "family.flex_hold" : "family.flex_hold_release",
    entityType: "child",
    entityId: childId,
    summary: hold ? `Held ${name} in ${flexHoldName(hold)} for Yalla Flex` : `Released ${name}’s Yalla Flex hold in ${flexHoldName(c.flexHold)}`,
    changes: { flexHold: { from: c.flexHold, to: hold } },
  });
  // Families who already have a Family Portal account hear about a new or changed hold straight
  // away. Families who don't learn about it in their invitation to the portal.
  const notified = hold && opts.baseUrl ? await emailFlexHoldToAccounts(db, u, opts.baseUrl) : 0;
  return { ...u, notified, unchanged: false };
}

/** Emails the hold notice to the family's guardians who have a Family Portal account. Returns how many. */
async function emailFlexHoldToAccounts(db: Executor, c: typeof children.$inferSelect, baseUrl: string) {
  if (!c.flexHold) return 0;
  const withAccount = (await db.select().from(guardians).where(eq(guardians.familyId, c.familyId))).filter((g) => g.portalAccess && (g.passwordHash || g.emailVerifiedAt));
  if (!withAccount.length) return 0;
  const { notifyFamily } = await import("@/lib/notify");
  const name = c.preferredName || c.firstName;
  const cohort = flexHoldName(c.flexHold) ?? c.flexHold;
  await notifyFamily(db, {
    key: "flex_hold_notice",
    familyId: c.familyId,
    guardianIds: withAccount.map((g) => g.id),
    vars: { child_name: name, cohort, held_note: heldParagraph(name, cohort), link: `${baseUrl}/programs/yalla-flex` },
    related: { type: "child", id: c.id },
  });
  return withAccount.length;
}

/**
 * Tells the family about a hold that's already in place (say, set before they were invited, or
 * re-sent on request). A family with a Family Portal account gets the hold email; a family without
 * one gets a fresh portal invitation (replacing any unused one), which explains the hold.
 */
export async function resendFlexHoldNotice(db: DB, actor: Actor, childId: string, baseUrl: string) {
  const [c] = await db.select().from(children).where(eq(children.id, childId));
  if (!c) throw new OpsError("not_found", "Child not found.");
  if (!c.flexHold) throw new OpsError("invalid", "This child isn’t held in a Flex cohort.");
  const emailed = await emailFlexHoldToAccounts(db, c, baseUrl);
  if (emailed) {
    await audit(db, actor, { action: "family.flex_hold_notice", entityType: "child", entityId: childId, summary: `Emailed the family about ${c.preferredName || c.firstName}’s hold in ${flexHoldName(c.flexHold)}` });
    return { via: "hold_email" as const, count: emailed };
  }
  const [g] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.familyId, c.familyId), eq(guardians.isPrimary, true)))
    .limit(1);
  if (!g) throw new OpsError("invalid", "This family has no primary guardian to email.");
  const { inviteToPortal } = await import("@/lib/family-auth");
  await inviteToPortal(db, actor, { email: g.email, name: `${g.firstName} ${g.lastName}` }, baseUrl);
  return { via: "invitation" as const, count: 1, email: g.email };
}

/**
 * What a child has on record. A child with any history (bookings, attendance, forms, documents, late
 * fees, a membership) can be removed from the family but not deleted, so those records stay whole.
 */
export async function childHistory(db: Executor, childId: string) {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const count = sql<number>`count(*)::int`;
  const [bookingsN, attendanceN, formsN, docsN, feesN, membershipsN, upcomingN] = await Promise.all([
    n(db.select({ n: count }).from(bookingItems).where(eq(bookingItems.childId, childId))),
    n(db.select({ n: count }).from(attendanceRecords).where(eq(attendanceRecords.childId, childId))),
    n(db.select({ n: count }).from(formSubmissions).where(eq(formSubmissions.childId, childId))),
    n(db.select({ n: count }).from(documents).where(eq(documents.childId, childId))),
    n(db.select({ n: count }).from(lateFees).where(eq(lateFees.childId, childId))),
    n(db.select({ n: count }).from(memberships).where(and(eq(memberships.childId, childId), inArray(memberships.status, ["active", "upcoming", "paused", "ended"])))),
    n(
      db
        .select({ n: count })
        .from(bookingItems)
        .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
        .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
        .where(and(eq(bookingItems.childId, childId), inArray(bookingItems.status, ["confirmed", "held"]), gt(sessions.startsAt, new Date()))),
    ),
  ]);
  const liveMembership = await n(db.select({ n: count }).from(memberships).where(and(eq(memberships.childId, childId), inArray(memberships.status, ["active", "upcoming", "paused"]))));
  const hasHistory = bookingsN + attendanceN + formsN + docsN + feesN + membershipsN > 0;
  return { bookings: bookingsN, attendance: attendanceN, forms: formsN, documents: docsN, lateFees: feesN, memberships: membershipsN, upcoming: upcomingN, liveMembership, hasHistory };
}

/** Removes a child from the family's portal and booking (status archived). History stays; staff can restore them. */
export async function setChildRemoved(db: Executor, actor: Actor, childId: string, removed: boolean) {
  const [c] = await db.select().from(children).where(eq(children.id, childId));
  if (!c) throw new OpsError("not_found", "Child not found.");
  const name = c.preferredName || c.firstName;
  if (removed) {
    const h = await childHistory(db, childId);
    if (h.upcoming) throw new OpsError("invalid", `${name} has ${h.upcoming} upcoming booking${h.upcoming === 1 ? "" : "s"}. Cancel ${h.upcoming === 1 ? "it" : "them"} first.`);
    if (h.liveMembership) throw new OpsError("invalid", `${name} has a Club Yalla membership that isn’t over. End it first.`);
  }
  await db.update(children).set({ status: removed ? "archived" : "active" }).where(eq(children.id, childId));
  await audit(db, actor, { action: removed ? "family.child_remove" : "family.child_restore", entityType: "child", entityId: childId, summary: removed ? `Removed ${name} from the family` : `Restored ${name} to the family` });
}

/** Deletes a child for good. Only for a child with no history (e.g. added by mistake). */
export async function deleteChild(db: Executor, actor: Actor, childId: string) {
  const [c] = await db.select().from(children).where(eq(children.id, childId));
  if (!c) throw new OpsError("not_found", "Child not found.");
  const name = c.preferredName || c.firstName;
  const h = await childHistory(db, childId);
  if (h.hasHistory) throw new OpsError("invalid", `${name} has bookings, attendance or forms on record, so they can be removed from the family but not deleted.`);
  // Unlink contacts and notes, drop child-specific form requirements, and take them off any waitlist.
  await db.update(authorizedPickups).set({ childId: null }).where(eq(authorizedPickups.childId, childId));
  await db.update(emergencyContacts).set({ childId: null }).where(eq(emergencyContacts.childId, childId));
  await db.update(familyNotes).set({ childId: null }).where(eq(familyNotes.childId, childId));
  await db.delete(formRequirements).where(eq(formRequirements.childId, childId));
  const onWaitlist = await db.select({ id: waitlistEntries.id, kids: waitlistEntries.childIds, status: waitlistEntries.status }).from(waitlistEntries).where(sql`${childId} = ANY(${waitlistEntries.childIds})`);
  for (const w of onWaitlist) {
    const kids = w.kids.filter((k) => k !== childId);
    await db
      .update(waitlistEntries)
      .set({ childIds: kids, partySize: Math.max(1, kids.length), status: !kids.length && w.status === "waiting" ? "removed" : w.status, updatedAt: new Date() })
      .where(eq(waitlistEntries.id, w.id));
  }
  await db.delete(children).where(eq(children.id, childId));
  await audit(db, actor, { action: "family.child_delete", entityType: "family", entityId: c.familyId, summary: `Deleted ${name} ${c.lastName} from the family (no history on record)` });
  return { familyId: c.familyId, name };
}
