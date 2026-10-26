"use server";

import { redirect } from "next/navigation";
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
  setPickup,
  updateChild,
  updateFamily,
  updateGuardian,
} from "@/lib/ops/families";

const nullable = (s: string) => (s === "" ? null : s);

/** Creating a family uses its own handler so a duplicate email can link to the existing family. */
export async function createFamilyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") values[k] = v;
  const staff = await getStaff();
  if (!staff || !can(staff, "families.manage")) return { ok: false, error: "You don’t have permission to add families.", values };
  let familyId: string;
  try {
    const res = await createFamily(getDb(), staffActor(staff), {
      name: values.name,
      guardian: { firstName: values.firstName ?? "", lastName: values.lastName ?? "", email: values.email ?? "", phone: values.phone, relationship: values.relationship },
      marketingOptIn: values.marketingOptIn === "on",
    });
    familyId = res.family.id;
  } catch (e) {
    if (e instanceof OpsError) return { ok: false, error: e.message, values, data: e.details, at: Date.now() };
    return { ok: false, error: "Something went wrong and nothing was saved.", values, at: Date.now() };
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
  return bool("isRestricted") ? "Pickup restriction saved. It will show on rosters and block check-out." : "Authorized pickup saved.";
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
