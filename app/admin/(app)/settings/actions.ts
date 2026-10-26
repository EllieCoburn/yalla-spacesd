"use server";

import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { requestMeta } from "@/lib/auth/session";
import { POLICIES, saveCohort, saveLocation, savePool, setOperatingHours, setPolicy, type OperatingHours, type PolicyKey } from "@/lib/ops/settings";
import { changeRole, createRole, inviteStaff, resendInvite, setStaffStatus, updateRolePermissions } from "@/lib/ops/staff-admin";

async function baseUrl() {
  const m = await requestMeta();
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  const local = m.host?.startsWith("localhost") || m.host?.startsWith("127.");
  return `${local ? "http" : "https"}://${m.host}`;
}
const showLink = (mode: string) => mode === "test" && process.env.NODE_ENV !== "production";

export const policyAction = adminAction("settings.manage", async ({ db, actor, str }) => {
  const key = str("key") as PolicyKey;
  const def = POLICIES[key];
  if (!def) throw new OpsError("invalid", "Unknown policy.");
  const raw = str("value");
  let value: unknown = raw;
  if (typeof def.default === "number") {
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < 0) throw new OpsError("invalid", "Enter a number of 0 or more.");
    if (key === "booking.holdMinutes" && (n < 5 || n > 24 * 60)) throw new OpsError("invalid", "Holds must be between 5 minutes and 24 hours.");
    if (key.endsWith("Percent") && n > 100) throw new OpsError("invalid", "Percentages can’t exceed 100.");
    value = n;
  } else if (typeof def.default === "boolean") value = raw === "true";
  else if ("options" in def && def.options && !def.options.some((o) => o.value === raw)) throw new OpsError("invalid", "Choose one of the options.");
  await setPolicy(db, actor, key, value);
  return `Saved “${def.label}”.`;
});

export const locationAction = adminAction("settings.manage", async ({ db, actor, str, bool }) => {
  await saveLocation(db, actor, { id: str("id") || undefined, name: str("name"), address: str("address"), arrivalInstructions: str("arrivalInstructions"), active: bool("active") });
  return "Location saved.";
});

export const cohortAction = adminAction("settings.manage", async ({ db, actor, str, num, bool }) => {
  await saveCohort(db, actor, {
    id: str("id") || undefined,
    name: str("name"),
    minAgeMonths: num("minAgeMonths"),
    maxAgeMonths: num("maxAgeMonths"),
    ratio: str("ratio") || null,
    maxSize: num("maxSize"),
    locationId: str("locationId") || null,
    sortOrder: num("sortOrder") ?? 0,
    active: bool("active"),
  });
  return "Cohort saved.";
});

export const poolAction = adminAction(["settings.manage", "capacity.override"], async ({ db, actor, str, num }) => {
  const cap = num("capacity");
  await savePool(db, actor, { id: str("id") || undefined, name: str("name"), capacity: cap ?? 0, locationId: str("locationId") || null, description: str("description") });
  return "Capacity pool saved.";
});

export const hoursAction = adminAction("settings.manage", async ({ db, actor, str }) => {
  const hours: OperatingHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: str(`open_${day}`) || null, close: str(`close_${day}`) || null }));
  await setOperatingHours(db, actor, hours);
  return "Operating hours saved.";
});

export const inviteAction = adminAction("staff.manage", async ({ db, actor, str }) => {
  const res = await inviteStaff(db, actor, { email: str("email"), name: str("name"), roleKey: str("roleKey") }, await baseUrl());
  return {
    message: res.mode === "test" ? `Invitation for ${res.user.name} captured (test mode — no email sent).` : `Invitation sent to ${res.user.email}.`,
    data: showLink(res.mode) ? { link: res.link } : undefined,
  };
});

export const resendInviteAction = adminAction("staff.manage", async ({ db, actor, str }) => {
  const res = await resendInvite(db, actor, str("staffId"), await baseUrl());
  return { message: res.mode === "test" ? "New invitation captured (test mode)." : "Invitation re-sent.", data: showLink(res.mode) ? { link: res.link } : undefined };
});

export const roleAction = adminAction("staff.manage", async ({ db, actor, str }) => {
  await changeRole(db, actor, str("staffId"), str("roleKey"));
  return "Role updated.";
});

export const statusAction = adminAction("staff.manage", async ({ db, actor, str }) => {
  const status = str("status") === "disabled" ? "disabled" : "active";
  await setStaffStatus(db, actor, str("staffId"), status);
  return status === "disabled" ? "Account disabled and signed out everywhere." : "Account re-enabled.";
});

export const permissionsAction = adminAction("staff.manage", async ({ db, actor, str, all }) => {
  await updateRolePermissions(db, actor, str("roleId"), all("permissions"));
  return "Permissions saved. They apply on each person’s next page load.";
});

export const createRoleAction = adminAction("staff.manage", async ({ db, actor, str }) => {
  const r = await createRole(db, actor, { name: str("name"), description: str("description"), copyFrom: str("copyFrom") || undefined });
  return `Created ${r.name}. Choose its permissions below.`;
});
