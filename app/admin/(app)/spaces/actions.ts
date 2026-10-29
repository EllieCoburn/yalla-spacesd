"use server";

import { OpsError } from "@/lib/audit";
import { adminAction } from "@/lib/admin/action";
import { can } from "@/lib/auth/staff";
import { addEntitlement, addRate, archiveEntitlement, createBlock, disableRate, removeBlock, setStaffNote, updateWorkspace } from "@/lib/spaces/admin";
import { getSpaceConfig, saveSpaceConfig, type SpaceConfig, type Window } from "@/lib/spaces/config";
import { cancelSpaceGroup, createReservation, moveSpaceGroup, type ReserveInput } from "@/lib/spaces/engine";

function reserveInput(str: (k: string) => string, num: (k: string) => number | null): ReserveInput {
  return {
    workspaceId: str("workspaceId"),
    bookingType: str("bookingType") as ReserveInput["bookingType"],
    date: str("date"),
    start: str("start") || undefined,
    minutes: num("minutes") ?? undefined,
    half: (str("half") || undefined) as ReserveInput["half"],
  };
}

export const createReservationAction = adminAction("spaces.manage", async ({ db, actor, staff, str, num, bool }) => {
  const override = bool("override");
  if (override && !can(staff, "spaces.configure")) throw new OpsError("forbidden", "Overriding booking rules needs the “Edit workspaces, rates and reservation policies” permission.");
  if (!str("familyId")) throw new OpsError("invalid", "Choose a family.");
  const charge = (str("charge") || "none") as "invoice" | "none";
  if (!["invoice", "none"].includes(charge)) throw new OpsError("invalid", "Choose how to charge.");
  const g = await createReservation(db, actor, reserveInput(str, num), { familyId: str("familyId"), source: "admin", override, charge, staffNote: str("note") || null });
  return { message: `Reserved · ${g.reference}`, data: { id: g.id } };
});

export const cancelReservationAction = adminAction("spaces.manage", async ({ db, actor, str }) => {
  const reason = str("reason");
  if (!reason) throw new OpsError("invalid", "Give a reason. Families see it on their cancelled reservation.");
  const g = await cancelSpaceGroup(db, actor, str("groupId"), { reason });
  return g.totalCents > 0 ? "Cancelled. The space is free again. To refund or credit the payment, open the invoice in Billing." : "Cancelled. The space is free again.";
});

export const moveReservationAction = adminAction("spaces.manage", async ({ db, actor, staff, str, num, bool }) => {
  const override = bool("override");
  if (override && !can(staff, "spaces.configure")) throw new OpsError("forbidden", "Overriding booking rules needs the “Edit workspaces, rates and reservation policies” permission.");
  await moveSpaceGroup(db, actor, str("groupId"), reserveInput(str, num), { override });
  return "Moved. The family has been sent the new time.";
});

export const noteAction = adminAction("spaces.manage", async ({ db, actor, str }) => {
  await setStaffNote(db, actor, str("groupId"), str("note").slice(0, 2000));
  return "Note saved.";
});

export const createBlockAction = adminAction("spaces.manage", async ({ db, actor, str, bool }) => {
  await createBlock(db, actor, {
    workspaceId: str("workspaceId") || null,
    date: str("date"),
    endDate: str("endDate") || null,
    start: str("start") || "00:00",
    end: str("end") || "23:59",
    kind: str("kind"),
    reason: str("reason") || null,
    override: bool("override"),
  });
  return "Closure added. Families see that time as unavailable.";
});

export const removeBlockAction = adminAction("spaces.manage", async ({ db, actor, str }) => {
  await removeBlock(db, actor, str("blockId"));
  return "Closure removed.";
});

export const updateWorkspaceAction = adminAction("spaces.configure", async ({ db, actor, str, num, bool, all }) => {
  const hoursText = str("hours");
  let hours: Record<string, [string, string]> | null = null;
  if (hoursText) {
    hours = {};
    for (const part of hoursText.split(/[;\n]/).map((p) => p.trim()).filter(Boolean)) {
      const m = part.match(/^([0-6])\s*=\s*(\d\d:\d\d)\s*-\s*(\d\d:\d\d)$/);
      if (!m) throw new OpsError("invalid", `Custom hours look like “1=08:30-16:30; 2=08:30-16:30” (0 = Sunday). Couldn’t read “${part}”.`);
      hours[m[1]] = [m[2], m[3]];
    }
  }
  const list = (k: string) =>
    str(k)
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  await updateWorkspace(db, actor, str("id"), {
    name: str("name"),
    category: str("category") as "private_office",
    summary: str("summary"),
    description: str("description") || null,
    amenities: list("amenities"),
    photos: list("photos"),
    capacity: num("capacity") ?? 1,
    active: bool("active"),
    displayOrder: num("displayOrder") ?? 0,
    bookingTypes: all("bookingTypes"),
    complimentaryEligible: bool("complimentaryEligible"),
    minNoticeMinutes: num("minNoticeMinutes") ?? 0,
    maxAdvanceDays: num("maxAdvanceDays") ?? 60,
    hours,
  });
  return "Workspace saved.";
});

export const addRateAction = adminAction("spaces.configure", async ({ db, actor, str, cents }) => {
  await addRate(db, actor, { scope: str("scope"), bookingType: str("bookingType"), priceCents: cents("price") ?? 0, effectiveFrom: str("effectiveFrom") });
  return "Price added. Existing reservations keep the price they were booked at.";
});

export const disableRateAction = adminAction("spaces.configure", async ({ db, actor, str }) => {
  await disableRate(db, actor, str("rateId"));
  return "Price turned off. That booking type can’t be bought online until a new price is added.";
});

export const addEntitlementAction = adminAction("spaces.configure", async ({ db, actor, str, num }) => {
  await addEntitlement(db, actor, {
    familyId: str("familyId"),
    mode: str("mode") as "grant" | "revoke",
    dailyMinutes: num("dailyMinutes"),
    effectiveFrom: str("effectiveFrom") || null,
    effectiveUntil: str("effectiveUntil") || null,
    note: str("note") || null,
  });
  return "Exception saved.";
});

export const archiveEntitlementAction = adminAction("spaces.configure", async ({ db, actor, str }) => {
  await archiveEntitlement(db, actor, str("id"));
  return "Exception removed.";
});

export const saveConfigAction = adminAction("spaces.configure", async ({ db, actor, str, num, bool, all }) => {
  const cur = await getSpaceConfig(db);
  const win = (prefix: string): Window | null => (str(`${prefix}Start`) && str(`${prefix}End`) ? { start: str(`${prefix}Start`), end: str(`${prefix}End`) } : null);
  const hours: SpaceConfig["hours"] = {};
  for (const d of all("openDays")) if (str(`open_${d}`) && str(`close_${d}`)) hours[d] = [str(`open_${d}`), str(`close_${d}`)];
  const ints = (k: string) =>
    str(k)
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
  const full = win("full");
  if (!full) throw new OpsError("invalid", "Set the full-day start and end.");
  const next: SpaceConfig = {
    hours,
    slotMinutes: num("slotMinutes") ?? cur.slotMinutes,
    halfDay: { morning: win("morning"), afternoon: win("afternoon") },
    fullDay: full,
    week: { mode: str("weekMode") === "rolling" ? "rolling" : "calendar", days: num("weekDays") ?? 5 },
    complimentary: {
      dailyMinutes: num("dailyMinutes") ?? 60,
      shared: bool("shared"),
      eligibility: (["active_membership", "all_families", "manual"].includes(str("eligibility")) ? str("eligibility") : "active_membership") as SpaceConfig["complimentary"]["eligibility"],
      durations: ints("compDurations"),
    },
    hourly: { durations: ints("hourlyDurations") },
    cancellation: {
      complimentaryCutoffMinutes: num("compCutoff") ?? 0,
      paidFamilyCancel: str("paidFamilyCancel") === "cancel" ? "cancel" : "contact",
      paidCutoffHours: num("paidCutoff") ?? 24,
      paidRefund: (["staff_decides", "credit", "none"].includes(str("paidRefund")) ? str("paidRefund") : "staff_decides") as SpaceConfig["cancellation"]["paidRefund"],
    },
  };
  if (Object.values(next.complimentary.durations).some((n) => !Number.isFinite(n))) throw new OpsError("invalid", "Durations are minutes separated by commas, like 15, 30, 45, 60.");
  await saveSpaceConfig(db, actor, next);
  return "Settings saved.";
});
