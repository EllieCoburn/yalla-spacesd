/**
 * Club Yalla memberships.
 *
 * A membership reserves its child's place in every matching cohort session (see capacity.ts), so
 * those spots can't be sold as drop-in care. Membership status, attendance and billing are kept
 * apart: an absence is an exception record — it doesn't cancel the membership, change the invoice,
 * or release the spot unless the configured policy allows it.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { audit, diff, OpsError, type Actor } from "@/lib/audit";
import type { DB, Executor } from "@/lib/db";
import { children, membershipChanges, membershipExceptions, memberships, scheduledCharges, sessions } from "@/lib/db/schema";
import { addDaysISO, fmtDate, todayLA, weekdayOf } from "@/lib/time";
import { availabilityFor, lockSessions } from "./capacity";
import { usd } from "./billing";
import { getPolicy } from "./settings";

export const MEMBERSHIP_STATUS_LABEL: Record<string, string> = { upcoming: "Upcoming", active: "Active", paused: "Paused", ended: "Ended" };
export const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type MembershipInput = {
  familyId: string;
  childId: string;
  programId: string;
  cohortId: string;
  weekdays: number[];
  dayLength: "full" | "half";
  earlyBird: boolean;
  startsOn: string;
  endsOn?: string | null;
  priceCents: number;
  billingFrequency: "monthly" | "weekly" | "term";
  notes?: string | null;
};

/** Sessions the membership would occupy, with any that lack room. */
export async function membershipCapacityCheck(db: Executor, input: Pick<MembershipInput, "programId" | "cohortId" | "weekdays" | "startsOn" | "endsOn">, excludeMembershipId?: string) {
  const horizon = input.endsOn ?? addDaysISO(input.startsOn, 120);
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.programId, input.programId), eq(sessions.cohortId, input.cohortId), gte(sessions.localDate, input.startsOn), lte(sessions.localDate, horizon), eq(sessions.status, "scheduled")))
    .orderBy(asc(sessions.localDate));
  const matching = rows.filter((s) => input.weekdays.includes(weekdayOf(s.localDate)));
  const avail = await availabilityFor(
    db,
    matching.map((s) => s.id),
  );
  let already = new Set<string>();
  if (excludeMembershipId) {
    const [m] = await db.select().from(memberships).where(eq(memberships.id, excludeMembershipId));
    if (m) already = new Set(matching.filter((s) => m.weekdays.includes(weekdayOf(s.localDate)) && s.localDate >= m.startsOn && (!m.endsOn || s.localDate <= m.endsOn)).map((s) => s.id));
  }
  const full = matching.filter((s) => !already.has(s.id) && avail.get(s.id)!.remaining < 1).map((s) => s.localDate);
  return { sessions: matching.length, full, horizon };
}

function statusFor(startsOn: string, endsOn: string | null | undefined, today = todayLA()) {
  if (endsOn && endsOn < today) return "ended";
  return startsOn > today ? "upcoming" : "active";
}

export async function createMembership(db: DB, actor: Actor, input: MembershipInput) {
  if (!input.weekdays.length) throw new OpsError("invalid", "Choose the recurring weekdays.");
  if (input.endsOn && input.endsOn < input.startsOn) throw new OpsError("invalid", "The end date must be after the start date.");
  if (input.priceCents < 0) throw new OpsError("invalid", "Enter the membership price.");
  const [child] = await db.select().from(children).where(eq(children.id, input.childId));
  if (!child || child.familyId !== input.familyId) throw new OpsError("invalid", "That child isn’t in this family.");
  const overlapping = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.childId, input.childId), inArray(memberships.status, ["active", "upcoming", "paused"])));
  if (overlapping.some((m) => (!m.endsOn || m.endsOn >= input.startsOn) && (!input.endsOn || m.startsOn <= input.endsOn)))
    throw new OpsError("duplicate", "This child already has a membership for those dates. Plan a schedule change instead.");

  return db.transaction(async (tx) => {
    const sessionRows = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.programId, input.programId), eq(sessions.cohortId, input.cohortId), gte(sessions.localDate, input.startsOn)));
    await lockSessions(
      tx,
      sessionRows.map((s) => s.id),
    );
    const check = await membershipCapacityCheck(tx, input);
    if (check.full.length) throw new OpsError("capacity", `The cohort is full on ${check.full.slice(0, 3).map((d) => fmtDate(d, "EEE d MMM")).join(", ")}${check.full.length > 3 ? ` and ${check.full.length - 3} more dates` : ""}.`, check);
    const [m] = await tx
      .insert(memberships)
      .values({ ...input, endsOn: input.endsOn ?? null, notes: input.notes ?? null, status: statusFor(input.startsOn, input.endsOn) })
      .returning();
    await tx.update(children).set({ cohortId: input.cohortId }).where(eq(children.id, input.childId));
    await scheduleCharges(tx, m);
    await audit(tx, actor, {
      action: "membership.create",
      entityType: "membership",
      entityId: m.id,
      summary: `Started Club Yalla for ${child.firstName}: ${input.weekdays.map((d) => WEEKDAY[d]).join(", ")} (${input.dayLength} day) from ${fmtDate(input.startsOn)} at ${usd(input.priceCents)}/${input.billingFrequency === "monthly" ? "month" : input.billingFrequency}`,
    });
    return m;
  });
}

/** Future scheduled charges (not invoices). Proration follows the configured policy. */
async function scheduleCharges(db: Executor, m: typeof memberships.$inferSelect, periods = 3) {
  if (m.billingFrequency !== "monthly") return; // weekly/term billing awaits Yalla's policy decision
  const proration = await getPolicy(db, "membership.proration");
  let d = m.startsOn.slice(0, 8) + "01";
  for (let i = 0; i < periods; i++) {
    if (m.endsOn && d > m.endsOn) break;
    // Partial first months are charged in full unless a proration policy is chosen; when one is,
    // the first charge is flagged for staff review rather than computed by an assumed formula.
    const partial = i === 0 && m.startsOn.slice(8) !== "01";
    await db.insert(scheduledCharges).values({
      familyId: m.familyId,
      membershipId: m.id,
      description: `Club Yalla — ${fmtDate(d < m.startsOn ? m.startsOn : d, "MMMM yyyy")}${partial && proration !== "none" ? " (partial month — review proration)" : ""}`,
      amountCents: m.priceCents,
      scheduledFor: d < m.startsOn ? m.startsOn : d,
    });
    const [y, mo] = d.split("-").map(Number);
    d = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, "0")}-01`;
  }
}

export async function updateMembership(db: DB, actor: Actor, id: string, patch: Partial<Pick<MembershipInput, "priceCents" | "billingFrequency" | "notes" | "endsOn" | "earlyBird">> & { status?: string }) {
  const [m] = await db.select().from(memberships).where(eq(memberships.id, id));
  if (!m) throw new OpsError("not_found", "Membership not found.");
  if (patch.status === "paused") {
    const pausePolicy = await getPolicy(db, "membership.pause");
    if (pausePolicy === "not_offered") throw new OpsError("policy", "Pauses aren’t enabled. Set a pause policy in Settings → Policies first.");
  }
  const next = { ...patch, updatedAt: new Date() };
  await db.update(memberships).set(next).where(eq(memberships.id, id));
  await audit(db, actor, { action: "membership.update", entityType: "membership", entityId: id, summary: "Updated membership", changes: diff(m as Record<string, unknown>, patch as Record<string, unknown>) });
}

/** Planned change to days, hours, cohort or price, effective on a date (applied by applyDueChanges). */
export async function planChange(db: DB, actor: Actor, membershipId: string, effectiveOn: string, changes: { weekdays?: number[]; dayLength?: "full" | "half"; cohortId?: string; priceCents?: number }) {
  const [m] = await db.select().from(memberships).where(eq(memberships.id, membershipId));
  if (!m) throw new OpsError("not_found", "Membership not found.");
  if (changes.weekdays || changes.cohortId) {
    const check = await membershipCapacityCheck(db, { programId: m.programId, cohortId: changes.cohortId ?? m.cohortId, weekdays: changes.weekdays ?? m.weekdays, startsOn: effectiveOn, endsOn: m.endsOn }, m.id);
    if (check.full.length) throw new OpsError("capacity", `No room on ${check.full.slice(0, 3).map((d) => fmtDate(d, "EEE d MMM")).join(", ")}.`, check);
  }
  const [c] = await db.insert(membershipChanges).values({ membershipId, effectiveOn, changes, createdBy: actor.name }).returning();
  await audit(db, actor, { action: "membership.plan_change", entityType: "membership", entityId: membershipId, summary: `Planned change effective ${fmtDate(effectiveOn)}`, changes });
  return c;
}

/**
 * Applies planned changes that are due by splitting the membership: the current one ends the day
 * before, and a new membership carries the new schedule — preserving history.
 */
export async function applyDueChanges(db: DB, actor: Actor, today = todayLA()) {
  const due = await db.select().from(membershipChanges).where(and(eq(membershipChanges.status, "planned"), lte(membershipChanges.effectiveOn, today)));
  for (const c of due) {
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(memberships).where(eq(memberships.id, c.membershipId)).for("update");
      const ch = c.changes as { weekdays?: number[]; dayLength?: "full" | "half"; cohortId?: string; priceCents?: number };
      await tx.update(memberships).set({ endsOn: addDaysISO(c.effectiveOn, -1), status: "ended", updatedAt: new Date() }).where(eq(memberships.id, m.id));
      const [next] = await tx
        .insert(memberships)
        .values({
          familyId: m.familyId,
          childId: m.childId,
          programId: m.programId,
          cohortId: ch.cohortId ?? m.cohortId,
          weekdays: ch.weekdays ?? m.weekdays,
          dayLength: ch.dayLength ?? m.dayLength,
          earlyBird: m.earlyBird,
          startsOn: c.effectiveOn,
          endsOn: m.endsOn,
          status: "active",
          priceCents: ch.priceCents ?? m.priceCents,
          billingFrequency: m.billingFrequency,
          notes: m.notes,
        })
        .returning();
      await tx.update(membershipChanges).set({ status: "applied" }).where(eq(membershipChanges.id, c.id));
      await audit(tx, actor, { action: "membership.change_applied", entityType: "membership", entityId: next.id, summary: `Applied planned change from ${fmtDate(c.effectiveOn)} (continues membership ${m.id.slice(0, 8)})` });
    });
  }
  return due.length;
}

export async function addException(db: DB, actor: Actor, input: { membershipId: string; date: string; kind: "absence" | "closure" | "pause" | "makeup"; note?: string }) {
  const [m] = await db.select().from(memberships).where(eq(memberships.id, input.membershipId));
  if (!m) throw new OpsError("not_found", "Membership not found.");
  const releasePolicy = await getPolicy(db, "membership.absenceReleasesSpot");
  const releasesSpot = input.kind === "absence" ? releasePolicy === true : input.kind === "pause" ? (await getPolicy(db, "membership.pause")) === "release_spot" : false;
  await db
    .insert(membershipExceptions)
    .values({ membershipId: m.id, date: input.date, kind: input.kind, releasesSpot, note: input.note ?? null, createdBy: actor.name })
    .onConflictDoUpdate({ target: [membershipExceptions.membershipId, membershipExceptions.date], set: { kind: input.kind, releasesSpot, note: input.note ?? null } });
  await audit(db, actor, {
    action: "membership.exception",
    entityType: "membership",
    entityId: m.id,
    summary: `Recorded ${input.kind} on ${fmtDate(input.date)}${releasesSpot ? " (spot released per policy)" : " (spot held; billing unchanged)"}`,
  });
  return { releasesSpot };
}

export async function membershipsForCohortDay(db: Executor, cohortId: string, programId: string, localDate: string) {
  const dow = weekdayOf(localDate);
  return db
    .select({ m: memberships, c: children })
    .from(memberships)
    .innerJoin(children, eq(children.id, memberships.childId))
    .where(
      and(
        eq(memberships.cohortId, cohortId),
        eq(memberships.programId, programId),
        inArray(memberships.status, ["active", "upcoming", "paused"]),
        sql`${dow} = ANY(${memberships.weekdays})`,
        lte(memberships.startsOn, localDate),
        sql`(${memberships.endsOn} IS NULL OR ${memberships.endsOn} >= ${localDate})`,
      ),
    );
}

