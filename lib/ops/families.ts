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
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { audit, diff, OpsError, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { authorizedPickups, children, emergencyContacts, families, familyNotes, guardians } from "@/lib/db/schema";

const clean = (s?: string | null) => (s ?? "").trim();

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
  input: { name?: string; guardian: { firstName: string; lastName: string; email: string; phone?: string; relationship?: string }; marketingOptIn?: boolean; isSample?: boolean },
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
    .values({ familyId: f.id, firstName: clean(g.firstName), lastName: clean(g.lastName), email: clean(g.email).toLowerCase(), phone: clean(g.phone) || null, relationship: clean(g.relationship) || "Parent", isPrimary: true, canViewBilling: true, canViewSensitive: true })
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

export async function addChild(db: Executor, actor: Actor, familyId: string, input: { firstName: string; lastName: string; preferredName?: string; birthDate: string; allergies?: string; medicalNotes?: string; careNotes?: string; cohortId?: string | null }) {
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
      infoUpdatedAt: new Date(),
      infoUpdatedBy: actor.name,
    })
    .returning();
  await audit(db, actor, { action: "family.child_add", entityType: "child", entityId: c.id, summary: `Added child ${c.firstName}` });
  return { child: c, existed: false };
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
    summary: `${input.id ? "Updated" : "Added"} ${input.isRestricted ? "pickup restriction" : "authorized pickup"}: ${values.name}`,
  });
}

export async function removePickup(db: Executor, actor: Actor, familyId: string, pickupId: string) {
  const [p] = await db.delete(authorizedPickups).where(and(eq(authorizedPickups.id, pickupId), eq(authorizedPickups.familyId, familyId))).returning();
  if (p) await audit(db, actor, { action: "family.pickup_remove", entityType: "family", entityId: familyId, summary: `Removed pickup contact ${p.name}` });
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
