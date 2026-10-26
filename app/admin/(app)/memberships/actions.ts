"use server";

import { redirect } from "next/navigation";
import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { addException, applyDueChanges, createMembership, planChange, updateMembership } from "@/lib/ops/memberships";
import { fmtDate } from "@/lib/time";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const createMembershipAction = adminAction("memberships.manage", async ({ db, actor, str, all, bool, cents }) => {
  const weekdays = all("weekdays").map(Number).filter((n) => n >= 0 && n <= 6);
  if (!DATE.test(str("startsOn"))) throw new OpsError("invalid", "Choose a start date.");
  if (str("endsOn") && !DATE.test(str("endsOn"))) throw new OpsError("invalid", "The end date isn’t valid.");
  const price = cents("price");
  if (price == null) throw new OpsError("invalid", "Enter the membership price.");
  const m = await createMembership(db, actor, {
    familyId: str("familyId"),
    childId: str("childId"),
    programId: str("programId"),
    cohortId: str("cohortId"),
    weekdays,
    dayLength: str("dayLength") === "half" ? "half" : "full",
    earlyBird: bool("earlyBird"),
    startsOn: str("startsOn"),
    endsOn: str("endsOn") || null,
    priceCents: price,
    billingFrequency: (["monthly", "weekly", "term"].includes(str("billingFrequency")) ? str("billingFrequency") : "monthly") as "monthly",
    notes: str("notes") || null,
  });
  redirect(`/admin/memberships/${m.id}?created=1`);
});

export const updateMembershipAction = adminAction("memberships.manage", async ({ db, actor, str, cents, bool }) => {
  const price = cents("price");
  if (price == null || price < 0) throw new OpsError("invalid", "Enter the membership price.");
  if (str("endsOn") && !DATE.test(str("endsOn"))) throw new OpsError("invalid", "The end date isn’t valid.");
  const status = str("status");
  if (!["upcoming", "active", "paused", "ended"].includes(status)) throw new OpsError("invalid", "Choose a status.");
  await updateMembership(db, actor, str("membershipId"), {
    priceCents: price,
    billingFrequency: str("billingFrequency") as "monthly",
    endsOn: str("endsOn") || null,
    notes: str("notes") || null,
    earlyBird: bool("earlyBird"),
    status,
  });
  return "Membership updated. Billing for already-scheduled charges isn’t changed automatically.";
});

export const planChangeAction = adminAction("memberships.manage", async ({ db, actor, str, all, cents }) => {
  if (!DATE.test(str("effectiveOn"))) throw new OpsError("invalid", "Choose the date the change takes effect.");
  const weekdays = all("weekdays").map(Number);
  const changes: Parameters<typeof planChange>[4] = {};
  if (weekdays.length) changes.weekdays = weekdays;
  if (str("dayLength")) changes.dayLength = str("dayLength") as "full" | "half";
  if (str("cohortId")) changes.cohortId = str("cohortId");
  const price = cents("price");
  if (price != null) changes.priceCents = price;
  if (!Object.keys(changes).length) throw new OpsError("invalid", "Choose at least one thing to change.");
  await planChange(db, actor, str("membershipId"), str("effectiveOn"), changes);
  return `Change planned for ${fmtDate(str("effectiveOn"))}. It applies on that date; until then the current schedule stays in place.`;
});

export const applyDueChangesAction = adminAction("memberships.manage", async ({ db, actor }) => {
  const n = await applyDueChanges(db, actor);
  return n ? `Applied ${n} planned change${n === 1 ? "" : "s"}.` : "No planned changes are due yet.";
});

export const addExceptionAction = adminAction("memberships.manage", async ({ db, actor, str }) => {
  if (!DATE.test(str("date"))) throw new OpsError("invalid", "Choose a date.");
  const kind = str("kind") as "absence" | "closure" | "pause" | "makeup";
  if (!["absence", "closure", "pause", "makeup"].includes(kind)) throw new OpsError("invalid", "Choose the type of exception.");
  const res = await addException(db, actor, { membershipId: str("membershipId"), date: str("date"), kind, note: str("note") || undefined });
  return res.releasesSpot
    ? "Recorded. Under your current policy this spot is released for drop-in booking that day."
    : "Recorded. The membership, invoice and spot are unchanged.";
});
