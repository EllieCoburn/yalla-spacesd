/**
 * Program management. Each program carries its own rules — parent presence, booking unit, approval,
 * deadlines, pricing and required paperwork — nothing is inherited from Club Yalla's model.
 * Programs with bookings are archived, never deleted.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { audit, diff, OpsError, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { cohorts, formRequirements, formTemplates, programCohorts, programPrices, programs, sessions } from "@/lib/db/schema";

export const PROGRAM_KINDS = [
  { value: "membership", label: "Recurring membership (Club Yalla)" },
  { value: "drop_in", label: "Drop-in care" },
  { value: "nature", label: "Nature program" },
  { value: "camp", label: "Seasonal camp" },
  { value: "weekend", label: "Weekend care" },
  { value: "parents_night", label: "Parents’ night out" },
  { value: "happening", label: "Pop-up event / workshop" },
  { value: "private_event", label: "Private event / event childcare" },
];
export const PARENT_PRESENCE = [
  { value: "required", label: "A parent or caregiver must remain onsite" },
  { value: "optional", label: "Parents may stay or leave" },
  { value: "not_required", label: "Parents head out after arrival" },
];
export const BOOKING_UNITS = [
  { value: "per_child", label: "Per child (each child uses a spot)" },
  { value: "per_family", label: "Per family (one spot per family)" },
  { value: "per_adult", label: "Per adult" },
  { value: "private_event", label: "Private event (whole session)" },
];
export const BOOKING_MODES = [
  { value: "instant", label: "Instant — confirmed when paid" },
  { value: "request", label: "Request — staff approve first" },
  { value: "enroll", label: "Enrollment — application, not booked online" },
  { value: "inquire", label: "Inquiry — conversation first" },
];
export const SERIES_MODES = [
  { value: "individual", label: "Individual dates" },
  { value: "full_series", label: "Complete series only" },
  { value: "either", label: "Either" },
];
export const PRICE_UNITS = [
  { value: "session", label: "per session" },
  { value: "series", label: "per series" },
  { value: "hour", label: "per hour" },
  { value: "month", label: "per month" },
  { value: "event", label: "per event" },
];
export const STATUSES = ["draft", "published", "paused", "archived"] as const;

const oneOf = (v: string, list: { value: string }[], label: string) => {
  if (!list.some((o) => o.value === v)) throw new OpsError("invalid", `Choose a valid ${label}.`);
  return v;
};

export type ProgramInput = {
  name: string;
  slug: string;
  kind: string;
  tagline?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  locationId?: string | null;
  arrivalInstructions?: string | null;
  minAgeMonths?: number | null;
  maxAgeMonths?: number | null;
  parentPresence: string;
  bookingUnit: string;
  bookingMode: string;
  seriesMode: string;
  defaultCapacity?: number | null;
  showRemaining: boolean;
  lowAvailabilityThreshold: number;
  waitlistEnabled: boolean;
  waitlistAutoOffer: boolean;
  offerWindowHours: number;
  advanceBookingDays?: number | null;
  minNoticeHours: number;
  cancellationDeadlineHours?: number | null;
  priceCents?: number | null;
  priceUnit: string;
  depositCents?: number | null;
};

export function validateProgram(input: ProgramInput): ProgramInput {
  const name = input.name.trim();
  if (!name) throw new OpsError("invalid", "Give the program a name.");
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new OpsError("invalid", "The URL slug can use lowercase letters, numbers and hyphens.");
  oneOf(input.kind, PROGRAM_KINDS, "program type");
  oneOf(input.parentPresence, PARENT_PRESENCE, "parent presence");
  oneOf(input.bookingUnit, BOOKING_UNITS, "booking unit");
  oneOf(input.bookingMode, BOOKING_MODES, "booking mode");
  oneOf(input.seriesMode, SERIES_MODES, "series mode");
  oneOf(input.priceUnit, PRICE_UNITS, "price unit");
  const nonNeg = (v: number | null | undefined, label: string) => {
    if (v != null && (!Number.isFinite(v) || v < 0)) throw new OpsError("invalid", `${label} can’t be negative.`);
  };
  nonNeg(input.minAgeMonths, "Minimum age");
  nonNeg(input.maxAgeMonths, "Maximum age");
  if (input.minAgeMonths != null && input.maxAgeMonths != null && input.maxAgeMonths < input.minAgeMonths) throw new OpsError("invalid", "The maximum age must be at least the minimum age.");
  nonNeg(input.defaultCapacity, "Capacity");
  nonNeg(input.lowAvailabilityThreshold, "Low-availability threshold");
  nonNeg(input.advanceBookingDays, "Advance booking limit");
  nonNeg(input.minNoticeHours, "Minimum notice");
  nonNeg(input.cancellationDeadlineHours, "Cancellation deadline");
  nonNeg(input.priceCents, "Price");
  nonNeg(input.depositCents, "Deposit");
  if (input.offerWindowHours < 1) throw new OpsError("invalid", "The offer window must be at least 1 hour.");
  if (input.depositCents != null && input.priceCents != null && input.depositCents > input.priceCents) throw new OpsError("invalid", "The deposit can’t be more than the price.");
  if (input.imageUrl && !/^(https?:\/\/|\/)/.test(input.imageUrl.trim())) throw new OpsError("invalid", "The image must be a web address or a path starting with /.");
  return { ...input, name, slug };
}

async function slugTaken(db: Executor, slug: string, exceptId?: string) {
  const rows = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.slug, slug), exceptId ? ne(programs.id, exceptId) : undefined));
  return rows.length > 0;
}

export async function createProgram(db: Executor, actor: Actor, raw: ProgramInput) {
  const input = validateProgram(raw);
  if (await slugTaken(db, input.slug)) throw new OpsError("duplicate", "Another program already uses that URL slug.");
  const [p] = await db
    .insert(programs)
    .values({ ...input, status: "draft" })
    .returning();
  await audit(db, actor, { action: "program.create", entityType: "program", entityId: p.id, summary: `Created program ${p.name} (draft)` });
  return p;
}

export async function updateProgram(db: Executor, actor: Actor, id: string, raw: ProgramInput) {
  const input = validateProgram(raw);
  const [before] = await db.select().from(programs).where(eq(programs.id, id));
  if (!before) throw new OpsError("not_found", "Program not found.");
  if (await slugTaken(db, input.slug, id)) throw new OpsError("duplicate", "Another program already uses that URL slug.");
  await db
    .update(programs)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(programs.id, id));
  const changes = diff(before as Record<string, unknown>, input as Record<string, unknown>);
  await audit(db, actor, { action: "program.update", entityType: "program", entityId: id, summary: `Updated ${input.name} (${Object.keys(changes).length} field${Object.keys(changes).length === 1 ? "" : "s"})`, changes });
}

/** Activity that prevents hard deletion. */
export async function programActivity(db: Executor, id: string) {
  const [r] = await db.execute<{ items: number; sessions: number }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM booking_items bi JOIN sessions s ON s.id = bi.session_id WHERE s.program_id = ${id}) AS items,
      (SELECT COUNT(*)::int FROM sessions WHERE program_id = ${id}) AS sessions`);
  return { bookingItems: Number(r.items), sessions: Number(r.sessions) };
}

export async function setProgramStatus(db: Executor, actor: Actor, id: string, status: (typeof STATUSES)[number]) {
  if (!STATUSES.includes(status)) throw new OpsError("invalid", "Unknown status.");
  const [p] = await db.select().from(programs).where(eq(programs.id, id));
  if (!p) throw new OpsError("not_found", "Program not found.");
  if (p.status === status) return;
  if (status === "published") {
    if (p.bookingMode === "instant" || p.bookingMode === "request") {
      const prices = await db.select({ id: programPrices.id }).from(programPrices).where(and(eq(programPrices.programId, id), eq(programPrices.active, true)));
      if (p.priceCents == null && !prices.length) throw new OpsError("unpriced", "Set a price or a price table before publishing a bookable program.");
    }
  }
  await db
    .update(programs)
    .set({ status, archivedAt: status === "archived" ? new Date() : null, updatedAt: new Date() })
    .where(eq(programs.id, id));
  await audit(db, actor, { action: "program.status", entityType: "program", entityId: id, summary: `${p.name}: ${p.status} → ${status}`, changes: { status: { from: p.status, to: status } } });
}

/** Deletes a draft that has never had sessions or bookings; otherwise archive. */
export async function deleteDraftProgram(db: Executor, actor: Actor, id: string) {
  const [p] = await db.select().from(programs).where(eq(programs.id, id));
  if (!p) throw new OpsError("not_found", "Program not found.");
  const act = await programActivity(db, id);
  if (p.status !== "draft" || act.sessions || act.bookingItems) throw new OpsError("has_activity", "This program has sessions or bookings, so it can only be archived.");
  await db.delete(programCohorts).where(eq(programCohorts.programId, id));
  await db.delete(programPrices).where(eq(programPrices.programId, id));
  await db.update(formRequirements).set({ active: false }).where(eq(formRequirements.programId, id));
  await db.delete(programs).where(eq(programs.id, id));
  await audit(db, actor, { action: "program.delete", entityType: "program", entityId: id, summary: `Deleted unused draft ${p.name}` });
}

export async function setProgramCohorts(db: Executor, actor: Actor, programId: string, cohortIds: string[]) {
  const before = (await db.select().from(programCohorts).where(eq(programCohorts.programId, programId))).map((c) => c.cohortId).sort();
  const next = [...new Set(cohortIds)].sort();
  if (next.length) {
    const valid = await db.select({ id: cohorts.id }).from(cohorts).where(inArray(cohorts.id, next));
    if (valid.length !== next.length) throw new OpsError("invalid", "Unknown cohort.");
  }
  if (JSON.stringify(before) === JSON.stringify(next)) return;
  await db.delete(programCohorts).where(eq(programCohorts.programId, programId));
  if (next.length) await db.insert(programCohorts).values(next.map((cohortId) => ({ programId, cohortId })));
  await audit(db, actor, { action: "program.cohorts", entityType: "program", entityId: programId, summary: `Updated associated cohorts (${next.length})`, changes: { cohorts: { from: before, to: next } } });
}

export type PriceInput = { label: string; amountCents: number; unit: string; cohortId?: string | null; dayLength?: string | null; daysPerWeek?: number | null };

function validatePrice(p: PriceInput) {
  if (!p.label.trim()) throw new OpsError("invalid", "Give the price a label.");
  if (!Number.isFinite(p.amountCents) || p.amountCents < 0) throw new OpsError("invalid", "Enter a valid amount.");
  oneOf(p.unit, [{ value: "session" }, { value: "month" }, { value: "series" }, { value: "event" }], "price unit");
  if (p.dayLength && !["full", "half"].includes(p.dayLength)) throw new OpsError("invalid", "Day length must be full or half.");
  if (p.daysPerWeek != null && (p.daysPerWeek < 1 || p.daysPerWeek > 7)) throw new OpsError("invalid", "Days per week must be 1–7.");
}

export async function addPrice(db: Executor, actor: Actor, programId: string, p: PriceInput) {
  validatePrice(p);
  const [row] = await db
    .insert(programPrices)
    .values({ programId, label: p.label.trim(), amountCents: p.amountCents, unit: p.unit, cohortId: p.cohortId || null, dayLength: p.dayLength || null, daysPerWeek: p.daysPerWeek ?? null })
    .returning();
  await audit(db, actor, { action: "program.price_add", entityType: "program", entityId: programId, summary: `Added price “${row.label}” ($${(row.amountCents / 100).toFixed(2)}/${row.unit})` });
  return row;
}

/** Price edits apply to new bookings only; existing booking items keep the price they were charged. */
export async function updatePrice(db: Executor, actor: Actor, priceId: string, p: PriceInput & { active: boolean }) {
  validatePrice(p);
  const [before] = await db.select().from(programPrices).where(eq(programPrices.id, priceId));
  if (!before) throw new OpsError("not_found", "Price not found.");
  const next = { label: p.label.trim(), amountCents: p.amountCents, unit: p.unit, cohortId: p.cohortId || null, dayLength: p.dayLength || null, daysPerWeek: p.daysPerWeek ?? null, active: p.active };
  await db.update(programPrices).set(next).where(eq(programPrices.id, priceId));
  await audit(db, actor, { action: "program.price_update", entityType: "program", entityId: before.programId, summary: `Updated price “${next.label}”`, changes: diff(before as Record<string, unknown>, next) });
}

export async function deactivateRequirement(db: Executor, actor: Actor, requirementId: string) {
  const [r] = await db.select().from(formRequirements).where(eq(formRequirements.id, requirementId));
  if (!r) throw new OpsError("not_found", "Requirement not found.");
  await db.update(formRequirements).set({ active: false }).where(eq(formRequirements.id, requirementId));
  const [t] = await db.select().from(formTemplates).where(eq(formTemplates.id, r.templateId));
  await audit(db, actor, { action: "forms.requirement_remove", entityType: "form", entityId: r.templateId, summary: `Removed “${t?.title}” requirement${r.programId ? " from program" : ""}` });
}

export async function upcomingSessionCounts(db: Executor, today: string) {
  const rows = await db
    .select({ programId: sessions.programId, n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(sql`${sessions.localDate} >= ${today}`, eq(sessions.status, "scheduled")))
    .groupBy(sessions.programId);
  return new Map(rows.map((r) => [r.programId, r.n]));
}


