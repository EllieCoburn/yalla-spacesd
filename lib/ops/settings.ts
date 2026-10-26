/**
 * Business policies. Nothing here is assumed: every policy that affects families or money
 * starts with a conservative default and is flagged "needs your decision" until someone at
 * Yalla saves it in Settings → Policies.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { audit, diff, OpsError, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { capacityPools, cohorts, locations, sessions, settings } from "@/lib/db/schema";

type PolicyDef<T> = { label: string; help: string; default: T; decision: boolean; group: string; options?: { value: string; label: string }[] };

export const POLICIES = {
  "booking.holdMinutes": {
    group: "Booking",
    label: "Checkout hold (minutes)",
    help: "How long spots are held while a family completes checkout. Expired holds release automatically.",
    default: 15,
    decision: false,
  } as PolicyDef<number>,
  "booking.refundOnCancel": {
    group: "Booking",
    label: "Refunds when a booking is cancelled",
    help: "Cancelling never issues a refund by itself. Choose whether staff should be prompted to refund, offer credit, or neither.",
    default: "prompt",
    decision: true,
    options: [
      { value: "prompt", label: "Prompt staff to decide each time" },
      { value: "credit", label: "Suggest account credit" },
      { value: "none", label: "No refund or credit suggested" },
    ],
  } as PolicyDef<string>,
  "membership.absenceReleasesSpot": {
    group: "Club Yalla",
    label: "Absences release the spot for drop-in resale",
    help: "When a member is marked absent ahead of time, may that spot be sold as Yalla Flex?",
    default: false,
    decision: true,
  } as PolicyDef<boolean>,
  "membership.makeupDays": {
    group: "Club Yalla",
    label: "Makeup days",
    help: "Whether members can make up missed days, and how.",
    default: "not_offered",
    decision: true,
    options: [
      { value: "not_offered", label: "Not offered" },
      { value: "same_month", label: "Within the same month, subject to space" },
      { value: "staff_discretion", label: "At staff discretion" },
    ],
  } as PolicyDef<string>,
  "membership.proration": {
    group: "Club Yalla",
    label: "Proration for mid-period starts and changes",
    help: "How the first or changed billing period is charged.",
    default: "none",
    decision: true,
    options: [
      { value: "none", label: "No proration (full period)" },
      { value: "daily", label: "Prorate by scheduled days" },
      { value: "staff_discretion", label: "Staff decide each time" },
    ],
  } as PolicyDef<string>,
  "membership.pause": {
    group: "Club Yalla",
    label: "Membership pauses",
    help: "Whether memberships can be paused, and whether the spot is held during a pause.",
    default: "not_offered",
    decision: true,
    options: [
      { value: "not_offered", label: "Not offered" },
      { value: "hold_spot", label: "Allowed; spot is held (billing continues unless staff adjust)" },
      { value: "release_spot", label: "Allowed; spot may be released" },
    ],
  } as PolicyDef<string>,
  "billing.siblingDiscountPercent": {
    group: "Billing",
    label: "Sibling discount (%)",
    help: "Applied to each additional child in the same booking or membership. 0 = none.",
    default: 0,
    decision: true,
  } as PolicyDef<number>,
  "billing.taxPercent": {
    group: "Billing",
    label: "Tax rate (%)",
    help: "Applied to taxable line items. Confirm with your accountant; childcare is often exempt.",
    default: 0,
    decision: true,
  } as PolicyDef<number>,
  "billing.depositsEnabled": {
    group: "Billing",
    label: "Deposits and installment plans",
    help: "Allow programs with a deposit amount to collect it first and the balance later.",
    default: false,
    decision: true,
  } as PolicyDef<boolean>,
  "waitlist.autoOfferDefault": {
    group: "Waitlist",
    label: "Automatic waitlist offers",
    help: "When a spot opens, automatically offer it to the next eligible family (programs can override).",
    default: false,
    decision: true,
  } as PolicyDef<boolean>,
  "security.requireMfaForOwners": {
    group: "Security",
    label: "Require two-step verification for owners",
    help: "Owners must set up an authenticator app before using the portal (enforced on production).",
    default: true,
    decision: false,
  } as PolicyDef<boolean>,
} as const;

export type PolicyKey = keyof typeof POLICIES;
type PolicyValue<K extends PolicyKey> = (typeof POLICIES)[K]["default"];

export async function getPolicy<K extends PolicyKey>(db: Executor, key: K): Promise<PolicyValue<K>> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return (row ? row.value : POLICIES[key].default) as PolicyValue<K>;
}

export async function listPolicies(db: Executor) {
  const keys = Object.keys(POLICIES) as PolicyKey[];
  const rows = await db.select().from(settings).where(inArray(settings.key, keys));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return keys.map((key) => {
    const def = POLICIES[key];
    const row = byKey.get(key);
    return {
      key,
      ...def,
      value: row ? row.value : def.default,
      needsDecision: def.decision && !row,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}

export async function setPolicy(db: Executor, actor: Actor, key: PolicyKey, value: unknown) {
  const before = await getPolicy(db, key);
  await db
    .insert(settings)
    .values({ key, value, updatedBy: actor.name })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date(), updatedBy: actor.name } });
  await audit(db, actor, {
    action: "settings.policy",
    entityType: "setting",
    entityId: key,
    summary: `Set “${POLICIES[key].label}”`,
    changes: { [key]: { from: before, to: value } },
  });
}

/* ── Operating hours ── */

export type OperatingHours = { day: number; open: string | null; close: string | null }[];
export const DEFAULT_HOURS: OperatingHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: day >= 1 && day <= 5 ? "08:00" : null, close: day >= 1 && day <= 5 ? "16:30" : null }));

export async function getOperatingHours(db: Executor): Promise<{ hours: OperatingHours; saved: boolean }> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "operations.hours"));
  return { hours: (row?.value as OperatingHours) ?? DEFAULT_HOURS, saved: !!row };
}

export async function setOperatingHours(db: Executor, actor: Actor, hours: OperatingHours) {
  for (const h of hours) {
    if ((h.open && !h.close) || (!h.open && h.close)) throw new OpsError("invalid", "Give both opening and closing times, or leave both empty for closed days.");
    if (h.open && h.close && h.close <= h.open) throw new OpsError("invalid", "Closing time must be after opening time.");
  }
  await db
    .insert(settings)
    .values({ key: "operations.hours", value: hours, updatedBy: actor.name })
    .onConflictDoUpdate({ target: settings.key, set: { value: hours, updatedAt: new Date(), updatedBy: actor.name } });
  await audit(db, actor, { action: "settings.hours", entityType: "setting", entityId: "operations.hours", summary: "Updated operating hours" });
}

/* ── Locations, cohorts & capacity pools ── */

export async function saveLocation(db: Executor, actor: Actor, input: { id?: string; name: string; address?: string | null; arrivalInstructions?: string | null; active: boolean }) {
  if (!input.name.trim()) throw new OpsError("invalid", "Name the location.");
  const values = { name: input.name.trim(), address: input.address?.trim() || null, arrivalInstructions: input.arrivalInstructions?.trim() || null, active: input.active };
  if (input.id) {
    const [before] = await db.select().from(locations).where(eq(locations.id, input.id));
    await db.update(locations).set(values).where(eq(locations.id, input.id));
    await audit(db, actor, { action: "settings.location", entityType: "location", entityId: input.id, summary: `Updated location ${values.name}`, changes: diff(before ?? {}, values) });
  } else {
    const [l] = await db.insert(locations).values(values).returning();
    await audit(db, actor, { action: "settings.location", entityType: "location", entityId: l.id, summary: `Added location ${values.name}` });
  }
}

export async function saveCohort(
  db: Executor,
  actor: Actor,
  input: { id?: string; name: string; minAgeMonths?: number | null; maxAgeMonths?: number | null; ratio?: string | null; maxSize?: number | null; locationId?: string | null; sortOrder?: number; active: boolean },
) {
  if (!input.name.trim()) throw new OpsError("invalid", "Name the cohort.");
  if (input.minAgeMonths != null && input.maxAgeMonths != null && input.maxAgeMonths < input.minAgeMonths) throw new OpsError("invalid", "The maximum age must be at least the minimum age.");
  if (input.ratio && !/^\d+:\d+$/.test(input.ratio)) throw new OpsError("invalid", "Write ratios like 1:4.");
  const values = {
    name: input.name.trim(),
    minAgeMonths: input.minAgeMonths ?? null,
    maxAgeMonths: input.maxAgeMonths ?? null,
    ratio: input.ratio || null,
    maxSize: input.maxSize ?? null,
    locationId: input.locationId || null,
    sortOrder: input.sortOrder ?? 0,
    active: input.active,
  };
  if (input.id) {
    const [before] = await db.select().from(cohorts).where(eq(cohorts.id, input.id));
    await db.update(cohorts).set(values).where(eq(cohorts.id, input.id));
    await audit(db, actor, { action: "settings.cohort", entityType: "cohort", entityId: input.id, summary: `Updated cohort ${values.name}`, changes: diff(before ?? {}, values) });
  } else {
    const [c] = await db.insert(cohorts).values(values).returning();
    await audit(db, actor, { action: "settings.cohort", entityType: "cohort", entityId: c.id, summary: `Added cohort ${values.name}` });
  }
}

/** Changing a pool's capacity affects live availability, so it's audited as a capacity change. */
export async function savePool(db: Executor, actor: Actor, input: { id?: string; name: string; capacity: number; locationId?: string | null; description?: string | null }) {
  if (!input.name.trim()) throw new OpsError("invalid", "Name the capacity pool.");
  if (!Number.isInteger(input.capacity) || input.capacity < 1) throw new OpsError("invalid", "Capacity must be a whole number of at least 1.");
  const values = { name: input.name.trim(), capacity: input.capacity, locationId: input.locationId || null, description: input.description?.trim() || null };
  if (input.id) {
    const [before] = await db.select().from(capacityPools).where(eq(capacityPools.id, input.id));
    await db.update(capacityPools).set(values).where(eq(capacityPools.id, input.id));
    await audit(db, actor, {
      action: "capacity.pool",
      entityType: "capacity_pool",
      entityId: input.id,
      summary: `Updated capacity pool ${values.name}${before && before.capacity !== values.capacity ? ` (capacity ${before.capacity} → ${values.capacity})` : ""}`,
      changes: diff(before ?? {}, values),
    });
  } else {
    const [p] = await db.insert(capacityPools).values(values).returning();
    await audit(db, actor, { action: "capacity.pool", entityType: "capacity_pool", entityId: p.id, summary: `Added capacity pool ${values.name} (${values.capacity})` });
  }
}

export async function poolUsage(db: Executor) {
  const rows = await db
    .select({ poolId: sessions.capacityPoolId, n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(sql`${sessions.capacityPoolId} IS NOT NULL AND ${sessions.localDate} >= current_date`)
    .groupBy(sessions.capacityPoolId);
  return new Map(rows.map((r) => [r.poolId!, r.n]));
}

export async function setSettingValue(db: Executor, key: string, value: unknown, actor: Actor) {
  await db
    .insert(settings)
    .values({ key, value, updatedBy: actor.name })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date(), updatedBy: actor.name } });
}
