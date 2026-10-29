/**
 * Book a Space for staff: calendars with family names, closures, workspace and rate setup,
 * complimentary-time exceptions and reporting. Callers check permissions (spaces.view / manage /
 * configure); every change is audited.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { audit, diff, OpsError, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import {
  families,
  guardians,
  invoices,
  spaceEntitlements,
  spaceReservationGroups,
  spaceReservations,
  workspaceBlocks,
  workspaceRates,
  workspaces,
} from "@/lib/db/schema";
import { invoiceTotals } from "@/lib/ops/billing";
import { addDaysISO, zonedDateTime } from "@/lib/time";
import { getSpaceConfig, toMinutes, type BookingType, type Category } from "./config";
import { paymentStatusOf } from "./engine";

export const BLOCK_KINDS = [
  { value: "maintenance", label: "Maintenance" },
  { value: "private_event", label: "Private event" },
  { value: "internal", label: "Internal team use" },
  { value: "unavailable", label: "Unavailable" },
  { value: "other", label: "Other" },
];

const ACTIVE = (now: Date) => or(eq(spaceReservations.status, "confirmed"), and(eq(spaceReservations.status, "held"), gt(spaceReservations.holdExpiresAt, now)));

/** Everything on the calendar between two local dates (inclusive), with family names. */
export async function adminCalendar(db: Executor, from: string, to: string, now = new Date()) {
  const start = zonedDateTime(from, "00:00");
  const end = zonedDateTime(addDaysISO(to, 1), "00:00");
  const ws = await db.select().from(workspaces).orderBy(asc(workspaces.displayOrder), asc(workspaces.name));
  const rows = await db
    .select({
      id: spaceReservations.id,
      groupId: spaceReservations.groupId,
      workspaceId: spaceReservations.workspaceId,
      localDate: spaceReservations.localDate,
      startsAt: spaceReservations.startsAt,
      endsAt: spaceReservations.endsAt,
      status: spaceReservations.status,
      reference: spaceReservationGroups.reference,
      bookingType: spaceReservationGroups.bookingType,
      groupStatus: spaceReservationGroups.status,
      totalCents: spaceReservationGroups.totalCents,
      familyId: families.id,
      familyName: families.name,
    })
    .from(spaceReservations)
    .innerJoin(spaceReservationGroups, eq(spaceReservationGroups.id, spaceReservations.groupId))
    .innerJoin(families, eq(families.id, spaceReservations.familyId))
    .where(and(lt(spaceReservations.startsAt, end), gt(spaceReservations.endsAt, start), ACTIVE(now)))
    .orderBy(asc(spaceReservations.startsAt));
  const blocks = await db
    .select()
    .from(workspaceBlocks)
    .where(and(isNull(workspaceBlocks.removedAt), lt(workspaceBlocks.startsAt, end), gt(workspaceBlocks.endsAt, start)))
    .orderBy(asc(workspaceBlocks.startsAt));
  return { workspaces: ws, reservations: rows, blocks };
}

export async function adminGroup(db: Executor, groupId: string) {
  const [g] = await db.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, groupId));
  if (!g) return null;
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, g.workspaceId));
  const [fam] = await db.select().from(families).where(eq(families.id, g.familyId));
  const [by] = g.createdByGuardianId ? await db.select().from(guardians).where(eq(guardians.id, g.createdByGuardianId)) : [];
  const rows = await db.select().from(spaceReservations).where(eq(spaceReservations.groupId, g.id)).orderBy(asc(spaceReservations.startsAt));
  const [inv] = await db.select().from(invoices).where(eq(invoices.spaceGroupId, g.id)).orderBy(desc(invoices.createdAt));
  const totals = inv ? (await invoiceTotals(db, [inv.id])).get(inv.id) ?? null : null;
  return { group: g, workspace: ws, family: fam, bookedBy: by ?? null, rows, invoice: inv ?? null, totals, paymentStatus: paymentStatusOf(g, inv ?? null, totals) };
}

export async function needsAttention(db: Executor) {
  return db
    .select({ id: spaceReservationGroups.id, reference: spaceReservationGroups.reference, familyName: families.name, workspace: workspaces.name, updatedAt: spaceReservationGroups.updatedAt })
    .from(spaceReservationGroups)
    .innerJoin(families, eq(families.id, spaceReservationGroups.familyId))
    .innerJoin(workspaces, eq(workspaces.id, spaceReservationGroups.workspaceId))
    .where(eq(spaceReservationGroups.status, "needs_attention"))
    .orderBy(desc(spaceReservationGroups.updatedAt));
}

/** Recent and upcoming reservations, newest first, for the list view. */
export async function listGroups(db: Executor, opts: { status?: string; q?: string; limit?: number } = {}) {
  const q = opts.q?.trim();
  return db
    .select({
      id: spaceReservationGroups.id,
      reference: spaceReservationGroups.reference,
      status: spaceReservationGroups.status,
      bookingType: spaceReservationGroups.bookingType,
      totalCents: spaceReservationGroups.totalCents,
      createdAt: spaceReservationGroups.createdAt,
      familyName: families.name,
      workspace: workspaces.name,
      first: sql<string>`(select min(${spaceReservations.startsAt}) from ${spaceReservations} where ${spaceReservations.groupId} = ${spaceReservationGroups.id})`,
    })
    .from(spaceReservationGroups)
    .innerJoin(families, eq(families.id, spaceReservationGroups.familyId))
    .innerJoin(workspaces, eq(workspaces.id, spaceReservationGroups.workspaceId))
    .where(
      and(
        opts.status ? eq(spaceReservationGroups.status, opts.status) : ne(spaceReservationGroups.status, "expired"),
        q ? or(sql`${families.name} ILIKE ${`%${q}%`}`, sql`${spaceReservationGroups.reference} ILIKE ${`%${q}%`}`) : undefined,
      ),
    )
    .orderBy(desc(spaceReservationGroups.createdAt))
    .limit(opts.limit ?? 100);
}

/* ── Blocks ── */

export async function createBlock(
  db: Executor,
  actor: Actor,
  input: { workspaceId: string | null; date: string; endDate?: string | null; start: string; end: string; kind: string; reason: string | null; override: boolean },
) {
  if (!BLOCK_KINDS.some((k) => k.value === input.kind)) throw new OpsError("invalid", "Choose a reason for the closure.");
  const lastDate = input.endDate && input.endDate >= input.date ? input.endDate : input.date;
  if (addDaysISO(input.date, 62) < lastDate) throw new OpsError("invalid", "Closures can cover up to two months at a time.");
  const startsAt = zonedDateTime(input.date, input.start);
  const endsAt = zonedDateTime(lastDate, input.end);
  if (endsAt <= startsAt) throw new OpsError("invalid", "The closure has to end after it starts.");
  if (input.workspaceId) {
    const [w] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, input.workspaceId));
    if (!w) throw new OpsError("invalid", "Choose a workspace.");
  }
  const clashes = await db
    .select({ id: spaceReservations.id })
    .from(spaceReservations)
    .where(
      and(
        input.workspaceId ? eq(spaceReservations.workspaceId, input.workspaceId) : undefined,
        lt(spaceReservations.startsAt, endsAt),
        gt(spaceReservations.endsAt, startsAt),
        ACTIVE(new Date()),
      ),
    );
  if (clashes.length && !input.override)
    throw new OpsError("conflict", `${clashes.length} reservation${clashes.length === 1 ? "" : "s"} already fall in that time. Tick “Close anyway” to keep them and add the closure, then contact those families.`);
  const [b] = await db.insert(workspaceBlocks).values({ workspaceId: input.workspaceId, startsAt, endsAt, kind: input.kind, reason: input.reason, createdBy: actor.name }).returning();
  await audit(db, actor, { action: "spaces.block_create", entityType: "workspace_block", entityId: b.id, summary: `Closed ${input.workspaceId ? "a workspace" : "all workspaces"} ${input.date} ${input.start} – ${lastDate} ${input.end} (${input.kind})` });
  return b;
}

export async function removeBlock(db: Executor, actor: Actor, blockId: string) {
  const [b] = await db.update(workspaceBlocks).set({ removedAt: new Date(), removedBy: actor.name }).where(and(eq(workspaceBlocks.id, blockId), isNull(workspaceBlocks.removedAt))).returning();
  if (!b) throw new OpsError("not_found", "That closure was already removed.");
  await audit(db, actor, { action: "spaces.block_remove", entityType: "workspace_block", entityId: b.id, summary: "Removed a workspace closure" });
}

export async function upcomingBlocks(db: Executor, now = new Date()) {
  return db
    .select({ block: workspaceBlocks, workspace: workspaces.name })
    .from(workspaceBlocks)
    .leftJoin(workspaces, eq(workspaces.id, workspaceBlocks.workspaceId))
    .where(and(isNull(workspaceBlocks.removedAt), gt(workspaceBlocks.endsAt, now)))
    .orderBy(asc(workspaceBlocks.startsAt))
    .limit(100);
}

/* ── Workspaces & rates ── */

const TYPES: BookingType[] = ["complimentary", "half_day", "full_day", "week", "hourly"];

export async function updateWorkspace(
  db: Executor,
  actor: Actor,
  id: string,
  input: {
    name: string;
    category: Category;
    summary: string;
    description: string | null;
    amenities: string[];
    photos: string[];
    capacity: number;
    active: boolean;
    displayOrder: number;
    bookingTypes: string[];
    complimentaryEligible: boolean;
    minNoticeMinutes: number;
    maxAdvanceDays: number;
    hours: Record<string, [string, string]> | null;
  },
) {
  if (!input.name.trim()) throw new OpsError("invalid", "Give the workspace a name.");
  if (!["private_office", "phone_booth", "private_desk"].includes(input.category)) throw new OpsError("invalid", "Choose a category.");
  if (input.photos.some((p) => !/^(https:\/\/|\/)/.test(p))) throw new OpsError("invalid", "Photos must be https:// links or paths on this site (starting with /).");
  if (input.capacity < 1 || input.maxAdvanceDays < 1 || input.minNoticeMinutes < 0) throw new OpsError("invalid", "Check capacity, notice and how far ahead it can be booked.");
  const types = input.bookingTypes.filter((t) => TYPES.includes(t as BookingType));
  if (types.includes("complimentary") && !input.complimentaryEligible) throw new OpsError("invalid", "Tick “Complimentary time” eligibility to offer complimentary bookings.");
  const [before] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!before) throw new OpsError("not_found", "Workspace not found.");
  const next = { ...input, name: input.name.trim(), bookingTypes: types, updatedAt: new Date() };
  await db.update(workspaces).set(next).where(eq(workspaces.id, id));
  await audit(db, actor, { action: "spaces.workspace_update", entityType: "workspace", entityId: id, summary: `Updated ${next.name}`, changes: diff(before, next) });
}

export async function listRates(db: Executor) {
  return db
    .select({ rate: workspaceRates, workspace: workspaces.name })
    .from(workspaceRates)
    .leftJoin(workspaces, eq(workspaces.id, workspaceRates.workspaceId))
    .orderBy(asc(workspaceRates.category), asc(workspaceRates.bookingType), desc(workspaceRates.effectiveFrom));
}

/**
 * Adds a price from a date. The previous price for the same workspace/category and booking type
 * ends the day before, so past and existing reservations keep the price they were booked at.
 */
export async function addRate(db: Executor, actor: Actor, input: { scope: string; bookingType: string; priceCents: number; effectiveFrom: string }) {
  if (!["half_day", "full_day", "week", "hourly"].includes(input.bookingType)) throw new OpsError("invalid", "Choose a booking type.");
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) throw new OpsError("invalid", "Enter a price above $0.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) throw new OpsError("invalid", "Choose the date the price starts.");
  const [kind, value] = input.scope.split(":");
  const workspaceId = kind === "workspace" ? value : null;
  const category = kind === "category" ? value : null;
  if (!workspaceId && !category) throw new OpsError("invalid", "Choose which workspaces the price applies to.");
  const scopeWhere = workspaceId ? eq(workspaceRates.workspaceId, workspaceId) : and(isNull(workspaceRates.workspaceId), eq(workspaceRates.category, category!));
  await db
    .update(workspaceRates)
    .set({ effectiveUntil: addDaysISO(input.effectiveFrom, -1) })
    .where(
      and(
        scopeWhere,
        eq(workspaceRates.bookingType, input.bookingType),
        eq(workspaceRates.active, true),
        lt(workspaceRates.effectiveFrom, input.effectiveFrom),
        or(isNull(workspaceRates.effectiveUntil), gte(workspaceRates.effectiveUntil, input.effectiveFrom)),
      ),
    );
  const [r] = await db.insert(workspaceRates).values({ workspaceId, category, bookingType: input.bookingType, priceCents: input.priceCents, effectiveFrom: input.effectiveFrom, createdBy: actor.name }).returning();
  await audit(db, actor, { action: "spaces.rate_add", entityType: "workspace_rate", entityId: r.id, summary: `New ${input.bookingType} price $${(input.priceCents / 100).toFixed(2)} from ${input.effectiveFrom} (${workspaceId ? "one workspace" : category})` });
  return r;
}

export async function disableRate(db: Executor, actor: Actor, rateId: string) {
  const [r] = await db.update(workspaceRates).set({ active: false }).where(eq(workspaceRates.id, rateId)).returning();
  if (!r) throw new OpsError("not_found", "Price not found.");
  await audit(db, actor, { action: "spaces.rate_disable", entityType: "workspace_rate", entityId: r.id, summary: `Turned off a ${r.bookingType} price` });
}

/* ── Complimentary exceptions ── */

export async function listEntitlements(db: Executor) {
  return db
    .select({ e: spaceEntitlements, familyName: families.name })
    .from(spaceEntitlements)
    .innerJoin(families, eq(families.id, spaceEntitlements.familyId))
    .where(isNull(spaceEntitlements.archivedAt))
    .orderBy(asc(families.name));
}

export async function addEntitlement(db: Executor, actor: Actor, input: { familyId: string; mode: "grant" | "revoke"; dailyMinutes: number | null; effectiveFrom: string | null; effectiveUntil: string | null; note: string | null }) {
  if (!["grant", "revoke"].includes(input.mode)) throw new OpsError("invalid", "Choose whether to give or remove complimentary time.");
  if (input.dailyMinutes != null && (input.dailyMinutes < 0 || input.dailyMinutes > 480)) throw new OpsError("invalid", "Daily minutes must be between 0 and 480.");
  const [f] = await db.select({ id: families.id, name: families.name }).from(families).where(eq(families.id, input.familyId));
  if (!f) throw new OpsError("invalid", "Choose a family.");
  const [e] = await db.insert(spaceEntitlements).values({ ...input, createdBy: actor.name }).returning();
  await audit(db, actor, { action: "spaces.entitlement_add", entityType: "family", entityId: f.id, summary: `${input.mode === "grant" ? "Gave" : "Removed"} complimentary workspace time for ${f.name}${input.dailyMinutes != null ? ` (${input.dailyMinutes} min/day)` : ""}` });
  return e;
}

export async function archiveEntitlement(db: Executor, actor: Actor, id: string) {
  const [e] = await db.update(spaceEntitlements).set({ archivedAt: new Date() }).where(eq(spaceEntitlements.id, id)).returning();
  if (!e) throw new OpsError("not_found", "Exception not found.");
  await audit(db, actor, { action: "spaces.entitlement_remove", entityType: "family", entityId: e.familyId, summary: "Removed a complimentary workspace exception" });
}

export async function setStaffNote(db: Executor, actor: Actor, groupId: string, note: string) {
  const [g] = await db.update(spaceReservationGroups).set({ staffNote: note || null, updatedAt: new Date() }).where(eq(spaceReservationGroups.id, groupId)).returning();
  if (!g) throw new OpsError("not_found", "Reservation not found.");
  await audit(db, actor, { action: "spaces.note", entityType: "space_reservation", entityId: g.id, summary: `Updated the staff note on ${g.reference}` });
}

/* ── Reports ── */

export async function spaceReport(db: Executor, from: string, to: string) {
  const start = zonedDateTime(from, "00:00");
  const end = zonedDateTime(addDaysISO(to, 1), "00:00");
  const groups = await db
    .select({ g: spaceReservationGroups, workspace: workspaces.name })
    .from(spaceReservationGroups)
    .innerJoin(workspaces, eq(workspaces.id, spaceReservationGroups.workspaceId))
    .where(
      and(
        inArray(spaceReservationGroups.status, ["confirmed", "cancelled", "needs_attention"]),
        sql`exists (select 1 from ${spaceReservations} r where r.group_id = ${spaceReservationGroups.id} and r.starts_at < ${end.toISOString()}::timestamptz and r.ends_at > ${start.toISOString()}::timestamptz)`,
      ),
    );
  const confirmed = groups.filter((x) => x.g.status === "confirmed");
  const ws = await db.select().from(workspaces).orderBy(asc(workspaces.displayOrder));
  const rows = await db
    .select({ workspaceId: spaceReservations.workspaceId, startsAt: spaceReservations.startsAt, endsAt: spaceReservations.endsAt })
    .from(spaceReservations)
    .where(and(eq(spaceReservations.status, "confirmed"), lt(spaceReservations.startsAt, end), gt(spaceReservations.endsAt, start)));
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const byWorkspace = ws.map((w) => {
    const mine = rows.filter((r) => r.workspaceId === w.id);
    const minutes = mine.reduce((s, r) => s + (Math.min(r.endsAt.getTime(), end.getTime()) - Math.max(r.startsAt.getTime(), start.getTime())) / 60000, 0);
    return {
      id: w.id,
      name: w.name,
      bookings: confirmed.filter((x) => x.g.workspaceId === w.id).length,
      hours: Math.round((minutes / 60) * 10) / 10,
      revenueCents: confirmed.filter((x) => x.g.workspaceId === w.id).reduce((s, x) => s + x.g.totalCents, 0),
    };
  });
  // Utilization is booked hours against house opening hours in the range.
  const cfg = await getSpaceConfig(db);
  let openHours = 0;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const h = cfg.hours[String(new Date(`${d}T12:00:00Z`).getUTCDay())];
    if (h) openHours += (toMinutes(h[1]) - toMinutes(h[0])) / 60;
  }
  return {
    days,
    total: groups.length,
    confirmed: confirmed.length,
    complimentary: confirmed.filter((x) => x.g.bookingType === "complimentary").length,
    paid: confirmed.filter((x) => x.g.totalCents > 0).length,
    cancelled: groups.filter((x) => x.g.status === "cancelled").length,
    revenueCents: confirmed.reduce((s, x) => s + x.g.totalCents, 0),
    cancellationRate: groups.length ? Math.round((groups.filter((x) => x.g.status === "cancelled").length / groups.length) * 100) : 0,
    byWorkspace: byWorkspace.map((b) => ({ ...b, utilization: openHours ? Math.round((b.hours / openHours) * 100) : 0 })).sort((a, b) => b.bookings - a.bookings),
  };
}

