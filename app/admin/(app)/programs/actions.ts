"use server";

import { redirect } from "next/navigation";
import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { addRequirement } from "@/lib/ops/forms";
import {
  addPrice,
  createProgram,
  deactivateRequirement,
  deleteDraftProgram,
  setProgramCohorts,
  setProgramStatus,
  updatePrice,
  updateProgram,
  type ProgramInput,
  STATUSES,
} from "@/lib/ops/programs";

type Ctx = Parameters<Parameters<typeof adminAction>[1]>[0];

function programInput({ str, num, bool, cents }: Ctx): ProgramInput {
  const int = (k: string) => {
    const v = num(k);
    if (v != null && !Number.isInteger(v)) throw new OpsError("invalid", "Use whole numbers for ages, capacity, days and hours.");
    return v;
  };
  return {
    name: str("name"),
    slug: str("slug"),
    kind: str("kind"),
    tagline: str("tagline") || null,
    description: str("description") || null,
    imageUrl: str("imageUrl") || null,
    locationId: str("locationId") || null,
    arrivalInstructions: str("arrivalInstructions") || null,
    minAgeMonths: int("minAgeMonths"),
    maxAgeMonths: int("maxAgeMonths"),
    parentPresence: str("parentPresence"),
    bookingUnit: str("bookingUnit"),
    bookingMode: str("bookingMode"),
    seriesMode: str("seriesMode"),
    defaultCapacity: int("defaultCapacity"),
    showRemaining: bool("showRemaining"),
    lowAvailabilityThreshold: int("lowAvailabilityThreshold") ?? 2,
    waitlistEnabled: bool("waitlistEnabled"),
    waitlistAutoOffer: bool("waitlistAutoOffer"),
    offerWindowHours: int("offerWindowHours") ?? 24,
    advanceBookingDays: int("advanceBookingDays"),
    minNoticeHours: int("minNoticeHours") ?? 0,
    cancellationDeadlineHours: int("cancellationDeadlineHours"),
    priceCents: cents("priceCents"),
    priceUnit: str("priceUnit") || "session",
    depositCents: cents("depositCents"),
  };
}

export const createProgramAction = adminAction("programs.manage", async (ctx) => {
  const p = await createProgram(ctx.db, ctx.actor, programInput(ctx));
  redirect(`/admin/programs/${p.id}?created=1`);
});

export const updateProgramAction = adminAction("programs.manage", async (ctx) => {
  await updateProgram(ctx.db, ctx.actor, ctx.str("id"), programInput(ctx));
  return "Program saved.";
});

export const setStatusAction = adminAction("programs.manage", async ({ db, actor, str }) => {
  const status = str("status") as (typeof STATUSES)[number];
  await setProgramStatus(db, actor, str("id"), status);
  return status === "archived" ? "Program archived. Its sessions, bookings and records are kept." : `Program is now ${status}.`;
});

export const deleteDraftAction = adminAction("programs.manage", async ({ db, actor, str }) => {
  await deleteDraftProgram(db, actor, str("id"));
  redirect("/admin/programs?deleted=1");
});

export const saveCohortsAction = adminAction("programs.manage", async ({ db, actor, str, all }) => {
  await setProgramCohorts(db, actor, str("id"), all("cohortId"));
  return "Cohorts saved.";
});

export const addPriceAction = adminAction("programs.manage", async ({ db, actor, str, num, cents }) => {
  const amount = cents("amount");
  if (amount == null) throw new OpsError("invalid", "Enter an amount.");
  await addPrice(db, actor, str("id"), { label: str("label"), amountCents: amount, unit: str("unit"), cohortId: str("cohortId") || null, dayLength: str("dayLength") || null, daysPerWeek: num("daysPerWeek") });
  return "Price added.";
});

export const updatePriceAction = adminAction("programs.manage", async ({ db, actor, str, num, cents, bool }) => {
  const amount = cents("amount");
  if (amount == null) throw new OpsError("invalid", "Enter an amount.");
  await updatePrice(db, actor, str("priceId"), { label: str("label"), amountCents: amount, unit: str("unit"), cohortId: str("cohortId") || null, dayLength: str("dayLength") || null, daysPerWeek: num("daysPerWeek"), active: bool("active") });
  return "Price updated. Existing bookings keep the price they were charged.";
});

export const addRequirementAction = adminAction(["programs.manage", "forms.view"], async ({ db, actor, str }) => {
  if (!str("templateId")) throw new OpsError("invalid", "Choose a form.");
  await addRequirement(db, actor, { templateId: str("templateId"), scope: "program", programId: str("id") });
  return "Requirement added.";
});

export const removeRequirementAction = adminAction("programs.manage", async ({ db, actor, str }) => {
  await deactivateRequirement(db, actor, str("requirementId"));
  return "Requirement removed. Earlier submissions are kept.";
});
