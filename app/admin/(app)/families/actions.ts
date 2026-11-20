"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { trustedBaseUrl } from "@/lib/base-url";
import { guardians } from "@/lib/db/schema";
import { inviteToPortal } from "@/lib/family-auth";
import { adminAction, type ActionState } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { can, staffActor } from "@/lib/auth/staff";
import { getStaff } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  addChild,
  addFamilyNote,
  addGuardian,
  archiveFamily,
  createFamily,
  removeEmergencyContact,
  removePickup,
  restoreFamily,
  setEmergencyContact,
  setFlexHold,
  setPickup,
  updateChild,
  updateFamily,
  updateGuardian,
} from "@/lib/ops/families";
import { flexHoldName } from "@/lib/booking/flex-hold";

const nullable = (s: string) => (s === "" ? null : s);

/** Creating a family uses its own handler so a duplicate email can link to the existing family. */
export async function createFamilyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") values[k] = v;
  const staff = await getStaff();
  if (!staff || !can(staff, "families.manage")) return { ok: false, error: "You don’t have permission to add families.", values };
  // Children typed on the same form (rows left empty are skipped).
  const col = (k: string) => form.getAll(k).map((x) => String(x ?? "").trim());
  const [firsts, lasts, births, holds] = [col("childFirst"), col("childLast"), col("childBirth"), col("childHold")];
  const kids = firsts
    .map((firstName, i) => ({ firstName, lastName: lasts[i] ?? "", birthDate: births[i] ?? "", flexHold: holds[i] ?? "" }))
    .filter((k) => k.firstName || k.lastName || k.birthDate);
  const bad = kids.find((k) => !k.firstName || !/^\d{4}-\d{2}-\d{2}$/.test(k.birthDate));
  if (bad) return { ok: false, error: "Add each child’s first name and date of birth, or clear the row.", values, data: { children: kids }, at: Date.now() };
  let familyId: string;
  try {
    const res = await createFamily(getDb(), staffActor(staff), {
      name: values.name,
      // Portal access comes from an invitation (or a booking the team confirms), never just from being added.
      guardian: { firstName: values.firstName ?? "", lastName: values.lastName ?? "", email: values.email ?? "", phone: values.phone, relationship: values.relationship, portalAccess: false },
      marketingOptIn: values.marketingOptIn === "on",
    });
    familyId = res.family.id;
    for (const k of kids)
      await addChild(getDb(), staffActor(staff), familyId, { firstName: k.firstName, lastName: k.lastName || res.guardian.lastName, birthDate: k.birthDate, flexHold: k.flexHold || null });
    // Invited after the children are saved, so the email explains any Flex cohort hold.
    if (values.invite === "on") await inviteToPortal(getDb(), staffActor(staff), { email: res.guardian.email, name: `${res.guardian.firstName} ${res.guardian.lastName}` }, trustedBaseUrl((await headers()).get("host")));
  } catch (e) {
    if (e instanceof OpsError) return { ok: false, error: e.message, values, data: { ...((e.details as object) ?? {}), children: kids }, at: Date.now() };
    return { ok: false, error: "Something went wrong and nothing was saved.", values, data: { children: kids }, at: Date.now() };
  }
  redirect(`/admin/families/${familyId}?created=1`);
}

export const updateFamilyAction = adminAction("families.manage", async ({ db, actor, str, bool }) => {
  await updateFamily(db, actor, str("familyId"), {
    name: str("name"),
    marketingOptIn: bool("marketingOptIn"),
    communicationPrefs: { email: bool("prefEmail"), sms: bool("prefSms") },
  });
  return "Family details saved.";
});

export const archiveFamilyAction = adminAction("families.manage", async ({ db, actor, str }) => {
  await archiveFamily(db, actor, str("familyId"));
  return "Family archived. Their bookings, payments and signed paperwork are kept.";
});

export const restoreFamilyAction = adminAction("families.manage", async ({ db, actor, str }) => {
  await restoreFamily(db, actor, str("familyId"));
  return "Family restored.";
});

export const addGuardianAction = adminAction("families.manage", async ({ db, actor, str, bool }) => {
  await addGuardian(db, actor, str("familyId"), {
    firstName: str("firstName"),
    lastName: str("lastName"),
    email: str("email"),
    phone: str("phone"),
    relationship: str("relationship"),
    canBook: bool("canBook"),
    canViewBilling: bool("canViewBilling"),
    canViewSensitive: bool("canViewSensitive"),
    portalAccess: bool("portalAccess"),
  });
  return "Guardian added.";
});

export const updateGuardianAction = adminAction("families.manage", async ({ db, actor, str, bool }) => {
  if (!str("firstName") || !str("lastName")) throw new OpsError("invalid", "Enter a first and last name.");
  await updateGuardian(db, actor, str("guardianId"), {
    firstName: str("firstName"),
    lastName: str("lastName"),
    email: str("email"),
    phone: nullable(str("phone")),
    relationship: nullable(str("relationship")),
    canBook: bool("canBook"),
    canViewBilling: bool("canViewBilling"),
    canViewSensitive: bool("canViewSensitive"),
    portalAccess: bool("portalAccess"),
  });
  return "Guardian updated.";
});

export const addChildAction = adminAction("families.manage", async ({ db, actor, staff, str }) => {
  const care = can(staff, "children.care");
  const res = await addChild(db, actor, str("familyId"), {
    firstName: str("firstName"),
    lastName: str("lastName"),
    preferredName: str("preferredName"),
    birthDate: str("birthDate"),
    cohortId: nullable(str("cohortId")),
    allergies: care ? str("allergies") : undefined,
    careNotes: care ? str("careNotes") : undefined,
  });
  // A Yalla Flex cohort hold goes through setFlexHold, so a family who already has an account is emailed.
  if (!res.existed && str("flexHold")) await setFlexHold(db, actor, res.child.id, str("flexHold"), { baseUrl: trustedBaseUrl((await headers()).get("host")) });
  return res.existed ? `${res.child.firstName} is already on this family’s record — no duplicate was created.` : `${res.child.firstName} added.`;
});

/** Updates a child, writing only the fields this staff member is allowed to change. */
export const updateChildAction = adminAction("families.manage", async ({ db, actor, staff, str, form }) => {
  const patch: Parameters<typeof updateChild>[3] = {};
  const section = str("section");
  if (section === "basics") {
    if (!str("firstName") || !/^\d{4}-\d{2}-\d{2}$/.test(str("birthDate"))) throw new OpsError("invalid", "Enter a first name and a valid date of birth.");
    Object.assign(patch, { firstName: str("firstName"), lastName: str("lastName"), preferredName: nullable(str("preferredName")), birthDate: str("birthDate"), cohortId: nullable(str("cohortId")) });
  } else if (section === "care") {
    if (!can(staff, "children.care")) throw new OpsError("forbidden", "You don’t have permission to edit care information.");
    Object.assign(patch, { allergies: nullable(str("allergies")), medicalNotes: nullable(str("medicalNotes")), careNotes: nullable(str("careNotes")) });
  } else if (section === "staffNotes") {
    if (!can(staff, "children.staffNotes")) throw new OpsError("forbidden", "You don’t have permission to edit staff-only notes.");
    patch.staffNotes = nullable(String(form.get("staffNotes") ?? "").trim());
  } else throw new OpsError("invalid", "Unknown section.");
  await updateChild(db, actor, str("childId"), patch);
  return "Saved.";
});

export const savePickupAction = adminAction(["families.manage", "children.care"], async ({ db, actor, str, bool }) => {
  await setPickup(db, actor, str("familyId"), {
    id: str("pickupId") || undefined,
    childId: nullable(str("childId")),
    name: str("name"),
    relationship: str("relationship"),
    phone: str("phone"),
    isRestricted: bool("isRestricted"),
    restrictionNote: str("restrictionNote"),
  });
  return bool("isRestricted") ? "Departure restriction saved. It will show on cohort rosters and block check-out." : "Departure contact saved.";
});

export const removePickupAction = adminAction(["families.manage", "children.care"], async ({ db, actor, str }) => {
  await removePickup(db, actor, str("familyId"), str("pickupId"));
  return "Removed.";
});

export const saveEmergencyAction = adminAction("families.manage", async ({ db, actor, str, num }) => {
  await setEmergencyContact(db, actor, str("familyId"), {
    id: str("contactId") || undefined,
    childId: nullable(str("childId")),
    name: str("name"),
    relationship: str("relationship"),
    phone: str("phone"),
    priority: num("priority") ?? 1,
  });
  return "Emergency contact saved.";
});

export const removeEmergencyAction = adminAction("families.manage", async ({ db, actor, str }) => {
  await removeEmergencyContact(db, actor, str("familyId"), str("contactId"));
  return "Removed.";
});

export const addNoteAction = adminAction("families.manage", async ({ db, actor, staff, str }) => {
  const visibility = str("visibility") === "care" ? "care" : "staff";
  if (visibility === "care" && !can(staff, "children.care")) throw new OpsError("forbidden", "You can’t add care notes.");
  await addFamilyNote(db, actor, { familyId: str("familyId"), childId: nullable(str("childId")), body: str("body"), visibility });
  return "Note added.";
});

/** Email a guardian an invitation to create their Family Portal account. */
export const inviteGuardianAction = adminAction("families.manage", async ({ db, actor, str }) => {
  const [g] = await db.select().from(guardians).where(eq(guardians.id, str("guardianId")));
  if (!g) throw new OpsError("not_found", "Guardian not found.");
  const r = await inviteToPortal(db, actor, { email: g.email, name: `${g.firstName} ${g.lastName}` }, trustedBaseUrl((await headers()).get("host")));
  return `Invitation sent to ${r.email}. It works once, for 14 days.${r.devLink ? ` (Test mode link: ${r.devLink})` : ""}`;
});

/** Owners only: permanently delete a family's bookings and invoices (test data). */
export const purgeTestDataAction = adminAction("staff.manage", async ({ db, actor, staff, str }) => {
  if (staff.roleKey !== "owner") throw new OpsError("forbidden", "Only an owner can permanently delete bookings and invoices.");
  const { purgeFamilyBookingsAndInvoices } = await import("@/lib/ops/test-data");
  const r = await purgeFamilyBookingsAndInvoices(db, actor, { familyId: str("familyId"), confirmName: str("confirmName") });
  return `Deleted ${r.bookings} booking${r.bookings === 1 ? "" : "s"}, ${r.spaceReservations} workspace reservation${r.spaceReservations === 1 ? "" : "s"} and ${r.invoices} invoice${r.invoices === 1 ? "" : "s"} for good.`;
});

/** Hold a child in a Yalla Flex cohort, or release the hold (empty value). */
export const flexHoldAction = adminAction("families.manage", async ({ db, actor, str }) => {
  const hold = str("flexHold") || null;
  const c = await setFlexHold(db, actor, str("childId"), hold, { baseUrl: trustedBaseUrl((await headers()).get("host")) });
  const name = c.preferredName || c.firstName;
  if (!hold) return `Released. ${name} can now book the Flex group that fits their age.`;
  return `${name} is held in ${flexHoldName(hold)} for Yalla Flex.${c.notified ? " We’ve emailed the family to let them know." : " The family will hear about it when you invite them to the Family Portal."}`;
});
