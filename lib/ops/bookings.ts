/**
 * Bookings: holds, checkout, confirmation, cancellation, moves and child changes.
 *
 * Every capacity-changing operation runs in a transaction that first locks the affected sessions
 * (and their shared pools), then re-reads live occupancy. Admin bookings follow the same rules;
 * an override must be explicit, carry a reason, require `capacity.override`, and can never exceed
 * a session's hard capacity.
 *
 * Booking status, attendance, payment and paperwork are tracked separately.
 */
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import { randomToken } from "@/lib/auth/crypto";
import type { DB, Executor, Tx } from "@/lib/db";
import {
  bookingEvents,
  bookingItems,
  bookings,
  capacityOverrides,
  children,
  families,
  guardians,
  invoices,
  locations,
  payments,
  programPrices,
  programs,
  sessions,
  waitlistEntries,
} from "@/lib/db/schema";
import { notifyFamily } from "@/lib/notify";
import { activeProvider } from "@/lib/payments/provider";
import { ageInMonths, fmtDate, fmtTime } from "@/lib/time";
import { createInvoice, invoiceTotals, usd, type LineInput } from "./billing";
import { availabilityFor, lockSessions, publicState } from "./capacity";
import { blockingPaperwork } from "./forms";
import { getPolicy } from "./settings";
import { ageFits, sessionAges } from "@/lib/booking/ages";
import { FAMILY_RATE, familyRateKey, familyRateTotal } from "@/lib/booking/family-rate";
import { addonsFor, validAddons } from "@/lib/booking/addons";
import { flexGroupFor } from "@/lib/booking/flex";
import { earlyBirdByDate } from "./flex";
import { captureForBooking, eligibleSessionIds, releaseExpiredReservations, releaseForBooking, reserveForBooking, walletSummary } from "@/lib/playpass/wallet";
import { bookingStatusPath } from "@/lib/links";
import { site } from "@/content/site";

export type ItemRequest = { sessionId: string; childId?: string | null; adults?: number; addons?: string[] };

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  held: "Held",
  pending_payment: "Awaiting payment",
  requested: "Awaiting approval",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  expired: "Expired",
  needs_attention: "Needs attention",
};

const newReference = () => `YL-${randomToken(5).toUpperCase().replace(/[^A-Z0-9]/g, "7").slice(0, 6)}`;

async function event(db: Executor, bookingId: string, actor: Actor, type: string, detail?: Record<string, unknown>) {
  await db.insert(bookingEvents).values({ bookingId, actorName: actor.name, type, detail: detail ?? null });
}

/* ── Pricing ── */

type SessionRow = typeof sessions.$inferSelect;
type ProgramRow = typeof programs.$inferSelect;

export async function priceFor(db: Executor, session: SessionRow, program: ProgramRow, child: { cohortId: string | null } | null, addons: string[] = []): Promise<{ cents: number | null; label: string }> {
  // A Yalla Flex half day is priced from its age group's half-day rate.
  const half = addonsFor(program.kind, program.slug).some((a) => a.dayLength === "half" && addons.includes(a.key));
  const group = program.kind === "drop_in" ? flexGroupFor(session.minAgeMonths) : null;
  if (group) return half ? { cents: group.halfCents, label: `${group.label} half day` } : { cents: session.priceCents ?? group.fullCents, label: `${group.label} full day` };
  if (session.priceCents != null && !half) return { cents: session.priceCents, label: "Session price" };
  const hours = (session.endsAt.getTime() - session.startsAt.getTime()) / 3600_000;
  const dayLength = half || hours <= 5 ? "half" : "full";
  const cohortId = child?.cohortId ?? session.cohortId;
  const table = await db
    .select()
    .from(programPrices)
    .where(and(eq(programPrices.programId, program.id), eq(programPrices.unit, "session"), eq(programPrices.active, true)));
  const match =
    table.find((p) => p.cohortId === cohortId && p.dayLength === dayLength) ??
    table.find((p) => p.cohortId === cohortId && !p.dayLength) ??
    table.find((p) => !p.cohortId && p.dayLength === dayLength) ??
    table.find((p) => !p.cohortId && !p.dayLength);
  if (match) return { cents: match.amountCents, label: match.label };
  if (program.priceCents != null) return { cents: program.priceCents, label: "Program price" };
  return { cents: null, label: "Price not set" };
}

/* ── Validation ── */

export type Problem = { sessionId?: string; childId?: string | null; code: string; message: string };

type Prepared = {
  sessionsById: Map<string, SessionRow>;
  programsById: Map<string, ProgramRow>;
  childrenById: Map<string, typeof children.$inferSelect>;
  spotsBySession: Map<string, number>;
  problems: Problem[];
};

async function prepare(db: Executor, familyId: string, items: ItemRequest[], opts: { source: string; excludeBookingId?: string; now: Date }): Promise<Prepared> {
  const problems: Problem[] = [];
  const sessionIds = [...new Set(items.map((i) => i.sessionId))];
  const sessRows = await db.select().from(sessions).where(inArray(sessions.id, sessionIds));
  const sessionsById = new Map(sessRows.map((s) => [s.id, s]));
  const progRows = sessRows.length ? await db.select().from(programs).where(inArray(programs.id, [...new Set(sessRows.map((s) => s.programId))])) : [];
  const programsById = new Map(progRows.map((p) => [p.id, p]));
  const childIds = [...new Set(items.map((i) => i.childId).filter(Boolean) as string[])];
  const kidRows = childIds.length ? await db.select().from(children).where(inArray(children.id, childIds)) : [];
  const childrenById = new Map(kidRows.map((c) => [c.id, c]));
  const spotsBySession = new Map<string, number>();

  for (const it of items) {
    const s = sessionsById.get(it.sessionId);
    if (!s) {
      problems.push({ sessionId: it.sessionId, code: "not_found", message: "That session no longer exists." });
      continue;
    }
    const p = programsById.get(s.programId)!;
    const label = `${p.name} on ${fmtDate(s.localDate)}`;
    if (s.status !== "scheduled") problems.push({ sessionId: s.id, code: "not_offered", message: `${label} is ${s.status === "cancelled" ? "cancelled" : "closed"}.` });
    if (s.endsAt <= opts.now) problems.push({ sessionId: s.id, code: "past", message: `${label} has already happened.` });
    if (opts.source === "public") {
      const st = publicState(s, p, 1, opts.now);
      if (st.state === "closed" || st.state === "not_offered")
        problems.push({ sessionId: s.id, code: "closed", message: `${label}: ${st.state === "closed" ? st.reason : "not offered"}.` });
      if (p.bookingMode === "enroll" || p.bookingMode === "inquire")
        problems.push({ sessionId: s.id, code: "not_bookable", message: `${p.name} isn’t booked online.` });
    }
    // Spots by booking unit.
    let spots = 1;
    if (p.bookingUnit === "per_child") {
      if (!it.childId) problems.push({ sessionId: s.id, code: "child_required", message: `Choose a child for ${label}.` });
    } else if (p.bookingUnit === "per_adult") spots = Math.max(1, it.adults ?? 1);
    else if (p.bookingUnit === "per_family") spots = items.filter((x) => x.sessionId === s.id).indexOf(it) === 0 ? 1 : 0;
    else if (p.bookingUnit === "private_event") spots = items.filter((x) => x.sessionId === s.id).indexOf(it) === 0 ? s.capacity : 0;
    spotsBySession.set(s.id, (spotsBySession.get(s.id) ?? 0) + spots);

    if (it.childId) {
      const c = childrenById.get(it.childId);
      if (!c || c.familyId !== familyId) {
        problems.push({ sessionId: s.id, childId: it.childId, code: "child_invalid", message: "That child isn’t part of this family." });
        continue;
      }
      const age = ageInMonths(c.birthDate, s.localDate);
      const name = c.preferredName || c.firstName;
      if (!ageFits(age, sessionAges(s, p)))
        problems.push({ sessionId: s.id, childId: c.id, code: "age", message: `${name} will be ${age} months old on ${fmtDate(s.localDate)}, outside the age range for ${s.title ?? p.name}.` });
      if (s.cohortId && c.cohortId && c.cohortId !== s.cohortId && p.kind !== "drop_in")
        problems.push({ sessionId: s.id, childId: c.id, code: "cohort", message: `${name} is assigned to a different cohort than this session.` });
      // Extras with an age limit (e.g. Yalla Flex Early Bird is for children 12 months and older).
      for (const a of addonsFor(p.kind, p.slug).filter((x) => x.minAgeMonths != null && it.addons?.includes(x.key)))
        if (age < a.minAgeMonths!) problems.push({ sessionId: s.id, childId: c.id, code: "addon_age", message: `${a.label} is for children ${a.minAgeMonths} months and older.` });
    }
  }

  // Extras with limited seats per day (Yalla Flex Early Bird): only as many as staff have opened.
  const limited = new Map<string, { label: string; wanted: number }>();
  for (const it of items) {
    const s = sessionsById.get(it.sessionId);
    const p = s ? programsById.get(s.programId) : undefined;
    if (!s || !p) continue;
    for (const a of addonsFor(p.kind, p.slug).filter((x) => x.limitedSeats && it.addons?.includes(x.key))) {
      const cur = limited.get(s.localDate) ?? { label: a.label, wanted: 0 };
      limited.set(s.localDate, { label: a.label, wanted: cur.wanted + 1 });
    }
  }
  if (limited.size) {
    const seats = await earlyBirdByDate(db, [...limited.keys()], { excludeBookingId: opts.excludeBookingId });
    for (const [d, w] of limited) {
      const left = Math.max(0, (seats.get(d)?.seats ?? 0) - (seats.get(d)?.booked ?? 0));
      if (w.wanted > left)
        problems.push({
          code: "addon_full",
          message: left ? `Only ${left === 1 ? "one" : left} ${w.label} seat${left === 1 ? " is" : "s are"} open on ${fmtDate(d)}.` : `${w.label} isn’t available on ${fmtDate(d)}.`,
        });
    }
  }
  return { sessionsById, programsById, childrenById, spotsBySession, problems };
}

/** A child can't be in two overlapping sessions (bookings or Club Yalla membership days). */
async function conflicts(db: Executor, items: ItemRequest[], sessionsById: Map<string, SessionRow>, excludeBookingId: string | undefined, now: Date): Promise<Problem[]> {
  const out: Problem[] = [];
  for (const it of items) {
    if (!it.childId) continue;
    const s = sessionsById.get(it.sessionId);
    if (!s) continue;
    const clash = await db
      .select({ title: programs.name, start: sessions.startsAt, bookingId: bookings.id })
      .from(bookingItems)
      .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
      .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
      .innerJoin(programs, eq(programs.id, sessions.programId))
      .where(
        and(
          eq(bookingItems.childId, it.childId),
          ne(bookingItems.sessionId, s.id),
          sql`${sessions.startsAt} < ${s.endsAt.toISOString()}::timestamptz AND ${sessions.endsAt} > ${s.startsAt.toISOString()}::timestamptz`,
          excludeBookingId ? ne(bookings.id, excludeBookingId) : undefined,
          or(
            eq(bookingItems.status, "confirmed"),
            and(eq(bookingItems.status, "held"), or(eq(bookings.status, "requested"), and(inArray(bookings.status, ["held", "pending_payment"]), sql`${bookings.holdExpiresAt} > ${now.toISOString()}::timestamptz`))),
          ),
        ),
      )
      .limit(1);
    if (clash[0]) out.push({ sessionId: s.id, childId: it.childId, code: "conflict", message: `Already booked for ${clash[0].title} at an overlapping time.` });
    const sameSlot = items.filter((x) => x.childId === it.childId && x.sessionId === it.sessionId);
    if (sameSlot.length > 1 && sameSlot[0] === it) out.push({ sessionId: s.id, childId: it.childId, code: "duplicate", message: "The same child was added twice to one session." });
    const member = await db.execute<{ id: string }>(sql`
      SELECT m.id FROM memberships m, sessions s
      WHERE s.id = ${s.id}
        AND m.child_id = ${it.childId}
        AND m.status IN ('active', 'upcoming', 'paused')
        AND EXTRACT(DOW FROM s.local_date)::int = ANY(m.weekdays)
        AND m.starts_on <= s.local_date
        AND (m.ends_on IS NULL OR m.ends_on >= s.local_date)
        AND (s.starts_at AT TIME ZONE 'America/Los_Angeles')::time < (CASE m.day_length WHEN 'half' THEN TIME '12:00' ELSE TIME '16:30' END)
        AND (s.ends_at AT TIME ZONE 'America/Los_Angeles')::time > TIME '08:30'
      LIMIT 1`);
    if (member[0]) out.push({ sessionId: s.id, childId: it.childId, code: "member_day", message: "This child already has a Club Yalla spot at this time." });
  }
  return out;
}

/* ── Holds ── */

export type HoldInput = {
  familyId: string;
  items: ItemRequest[];
  source: "public" | "admin" | "waitlist";
  /** Admin only: explicit override with reason. Never exceeds hard capacity. */
  override?: { reason: string } | null;
  /** Admin only: proceed despite paperwork that blocks booking. */
  acknowledgePaperwork?: boolean;
  holdMinutes?: number;
  now?: Date;
};

export async function createHold(db: DB, actor: Actor, input: HoldInput) {
  const now = input.now ?? new Date();
  if (!input.items.length) throw new OpsError("empty", "Choose at least one session.");
  const [fam] = await db.select().from(families).where(eq(families.id, input.familyId));
  if (!fam || fam.status !== "active") throw new OpsError("invalid", "Family not found.");
  const prep = await prepare(db, input.familyId, input.items, { source: input.source, now });
  const hard = prep.problems.filter((p) => p.code !== "cohort");
  if (hard.length) throw new OpsError("invalid_booking", hard[0].message, { problems: prep.problems });

  if (input.override) {
    if (input.source !== "admin" || actor.type !== "staff" || !actor.permissions?.includes("capacity.override"))
      throw new OpsError("forbidden", "You don’t have permission to override capacity.");
    if (!input.override.reason.trim()) throw new OpsError("invalid", "An override needs a reason.");
  }

  const childIds = [...prep.childrenById.keys()];
  const blocking = await blockingPaperwork(db, {
    familyId: input.familyId,
    childIds,
    programIds: [...prep.programsById.keys()],
    sessionIds: [...prep.sessionsById.keys()],
  });
  if (blocking.length && !((input.source === "admin" || input.source === "waitlist") && input.acknowledgePaperwork))
    throw new OpsError("paperwork", `Required before booking: ${[...new Set(blocking.map((b) => b.title))].join(", ")}.`, { blocking });

  const holdMinutes = input.holdMinutes ?? (await getPolicy(db, "booking.holdMinutes"));

  return db.transaction(async (tx) => {
    await lockSessions(tx, [...prep.sessionsById.keys()]);
    const cf = await conflicts(tx, input.items, prep.sessionsById, undefined, now);
    if (cf.length) throw new OpsError("conflict", cf[0].message, { problems: cf });

    const avail = await availabilityFor(tx, [...prep.sessionsById.keys()], now);
    const shortfalls: { sessionId: string; needed: number; remaining: number }[] = [];
    for (const [sid, needed] of prep.spotsBySession) {
      const a = avail.get(sid)!;
      if (needed > a.remaining) shortfalls.push({ sessionId: sid, needed, remaining: a.remaining });
    }
    const overrides: { sessionId: string; extra: number }[] = [];
    if (shortfalls.length) {
      if (!input.override) {
        const s = shortfalls[0];
        const sess = prep.sessionsById.get(s.sessionId)!;
        const prog = prep.programsById.get(sess.programId)!;
        throw new OpsError(
          "capacity",
          s.remaining === 0
            ? `${prog.name} on ${fmtDate(sess.localDate)} is fully booked.`
            : `Only ${s.remaining} ${s.remaining === 1 ? "spot remains" : "spots remain"} for ${prog.name} on ${fmtDate(sess.localDate)}, and this booking needs ${s.needed}.`,
          { shortfalls },
        );
      }
      for (const s of shortfalls) {
        const sess = prep.sessionsById.get(s.sessionId)!;
        const a = avail.get(s.sessionId)!;
        const extra = s.needed - s.remaining;
        const ceiling = sess.hardCapacity ?? a.effectiveCapacity;
        if (a.effectiveCapacity + extra > ceiling || (a.poolRemaining != null && a.poolRemaining < s.needed))
          throw new OpsError("hard_capacity", `This would exceed the hard capacity for ${fmtDate(sess.localDate)}. Overrides can’t go past it.`, { shortfalls });
        overrides.push({ sessionId: s.sessionId, extra });
      }
    }

    const [b] = await tx
      .insert(bookings)
      .values({
        reference: newReference(),
        familyId: input.familyId,
        status: [...prep.programsById.values()].some((p) => p.bookingMode === "request") && input.source === "public" ? "requested" : "held",
        source: input.source,
        holdExpiresAt: new Date(now.getTime() + holdMinutes * 60_000),
        createdByStaffId: actor.type === "staff" ? actor.id : null,
      })
      .returning();

    const seenFamilySession = new Set<string>();
    const created: (typeof bookingItems.$inferSelect)[] = [];
    for (const it of input.items) {
      const s = prep.sessionsById.get(it.sessionId)!;
      const p = prep.programsById.get(s.programId)!;
      const child = it.childId ? prep.childrenById.get(it.childId)! : null;
      let spots = 1;
      if (p.bookingUnit === "per_adult") spots = Math.max(1, it.adults ?? 1);
      if (p.bookingUnit === "per_family" || p.bookingUnit === "private_event") {
        spots = seenFamilySession.has(s.id) ? 0 : p.bookingUnit === "private_event" ? s.capacity : 1;
        seenFamilySession.add(s.id);
      }
      const price = await priceFor(tx, s, p, child, it.childId ? validAddons(p.kind, it.addons, p.slug) : []);
      const [row] = await tx
        .insert(bookingItems)
        .values({
          bookingId: b.id,
          sessionId: s.id,
          childId: it.childId ?? null,
          adults: it.adults ?? 0,
          spots,
          status: "held",
          priceCents: spots === 0 && p.bookingUnit !== "per_child" ? 0 : price.cents,
          addons: it.childId ? validAddons(p.kind, it.addons, p.slug) : [],
        })
        .returning();
      created.push(row);
    }
    for (const o of overrides) {
      await tx.insert(capacityOverrides).values({ sessionId: o.sessionId, bookingId: b.id, staffId: (actor as { id: string }).id, extraSpots: o.extra, reason: input.override!.reason });
      await audit(tx, actor, { action: "capacity.override", entityType: "session", entityId: o.sessionId, summary: `Override +${o.extra} for booking ${b.reference}: ${input.override!.reason}` });
    }
    await event(tx, b.id, actor, "created", { items: created.length, source: input.source, overrides: overrides.length || undefined });
    await audit(tx, actor, { action: "booking.create", entityType: "booking", entityId: b.id, summary: `Created booking ${b.reference} (${created.length} item${created.length === 1 ? "" : "s"})` });
    return { booking: b, items: created, warnings: prep.problems.filter((p) => p.code === "cohort"), paperworkAcknowledged: blocking.length > 0 };
  });
}

/* ── Lines & invoices ── */

export async function bookingLines(db: Executor, bookingId: string) {
  const rows = await db
    .select({ item: bookingItems, session: sessions, program: programs, child: children })
    .from(bookingItems)
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .leftJoin(children, eq(children.id, bookingItems.childId))
    .where(eq(bookingItems.bookingId, bookingId))
    .orderBy(asc(sessions.startsAt));
  return rows;
}

async function siblingDiscountLines(db: Executor, rows: Awaited<ReturnType<typeof bookingLines>>, familyId: string): Promise<LineInput[]> {
  const percent = await getPolicy(db, "billing.siblingDiscountPercent");
  if (!percent) return [];
  // Play Pass members pay the published per-child price from their wallet unless Yalla chooses to stack the discount.
  if (rows.length && !(await getPolicy(db, "playpass.siblingDiscountWithWallet")) && (await walletSummary(db, familyId)).passCents > 0) {
    const eligible = await eligibleSessionIds(
      db,
      rows.map((r) => r.session.id),
    );
    rows = rows.filter((r) => !eligible.has(r.session.id));
  }
  const out: LineInput[] = [];
  // Siblings at the same program on the same day, even in different age groups (separate sessions).
  // The first child pays the full price (the highest, if prices differ); each additional child gets the discount.
  const byDay = new Map<string, typeof rows>();
  for (const r of rows)
    if (r.item.childId && r.program.bookingUnit === "per_child" && r.program.kind !== FAMILY_RATE.kind) {
      const k = `${r.program.id}|${r.session.localDate}`;
      byDay.set(k, [...(byDay.get(k) ?? []), r]);
    }
  for (const group of byDay.values()) {
    const ordered = [...group].sort((a, b) => (b.item.priceCents ?? 0) - (a.item.priceCents ?? 0));
    for (const r of ordered.slice(1)) {
      if (r.item.priceCents) out.push({ kind: "discount", description: `Sibling discount (${percent}%) · ${r.child?.firstName}`, unitCents: -Math.round((r.item.priceCents * percent) / 100), bookingItemId: r.item.id });
    }
  }
  return out;
}

/** After Hours: siblings on the same evening are capped at the family rate. */
function familyRateLines(rows: Awaited<ReturnType<typeof bookingLines>>): LineInput[] {
  const byEvening = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.item.childId || r.program.kind !== FAMILY_RATE.kind || r.item.priceCents == null) continue;
    const k = familyRateKey(r.program.id, r.session.localDate);
    byEvening.set(k, [...(byEvening.get(k) ?? []), r]);
  }
  const out: LineInput[] = [];
  for (const group of byEvening.values()) {
    const prices = group.map((r) => r.item.priceCents ?? 0);
    const saving = prices.reduce((a, b) => a + b, 0) - familyRateTotal(prices);
    if (saving > 0)
      out.push({ kind: "discount", description: `Family rate · ${group[0].program.name} · ${fmtDate(group[0].session.localDate, "EEE d MMM")} · ${group.length} children`, unitCents: -saving });
  }
  return out;
}

export function describeLine(r: { program: ProgramRow; session: SessionRow; child: { firstName: string; preferredName: string | null } | null; item?: { addons: string[] } | null }) {
  const short = addonsFor(r.program.kind, r.program.slug).find((a) => a.endsAfterStartMinutes && r.item?.addons.includes(a.key));
  const end = short ? new Date(r.session.startsAt.getTime() + short.endsAfterStartMinutes! * 60_000) : r.session.endsAt;
  return `${r.program.name}${short ? ` (${short.label.toLowerCase()})` : ""} · ${fmtDate(r.session.localDate, "EEE d MMM")} ${fmtTime(r.session.startsAt)}–${fmtTime(end)}${r.child ? ` · ${r.child.preferredName || r.child.firstName}` : ""}`;
}

/**
 * How a booking reads at checkout: a name families recognize ("Weekend Play Session · Sat, Nov 21")
 * and the details (each session and child), with the reference last.
 */
export async function checkoutLabel(db: Executor, bookingId: string, opts: { walletCents?: number } = {}) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  const rows = (await bookingLines(db, bookingId)).filter((r) => r.item.status !== "cancelled" && r.item.status !== "moved");
  const sessionsBooked = [...new Map(rows.map((r) => [r.session.id, r])).values()];
  const title = (r: (typeof rows)[number]) => r.session.title ?? r.program.name;
  const children = [...new Set(rows.map((r) => (r.child ? r.child.preferredName || r.child.firstName : null)).filter(Boolean))] as string[];
  const programs = [...new Set(sessionsBooked.map((r) => r.program.name))];
  const name =
    sessionsBooked.length === 1
      ? `${title(sessionsBooked[0])} · ${fmtDate(sessionsBooked[0].session.localDate, "EEE, MMM d")}`
      : programs.length === 1
        ? `${programs[0]} · ${sessionsBooked.length} sessions`
        : `Yalla booking · ${sessionsBooked.length} sessions`;
  const lines = sessionsBooked.map((s) => {
    const kids = rows.filter((r) => r.session.id === s.session.id && r.child).map((r) => r.child!.preferredName || r.child!.firstName);
    return `${title(s)}, ${fmtDate(s.session.localDate, "EEE MMM d")} ${fmtTime(s.session.startsAt)}–${fmtTime(s.session.endsAt)}${kids.length ? ` (${kids.join(", ")})` : ""}`;
  });
  const details = [
    lines.join(" · "),
    children.length && sessionsBooked.length > 1 ? `For ${children.join(" and ")}` : null,
    opts.walletCents ? `$${(opts.walletCents / 100).toFixed(2)} applied from your Yalla Wallet` : null,
    `Reference ${b.reference}`,
  ]
    .filter(Boolean)
    .join(". ");
  return { name, details };
}

async function invoiceForBooking(db: Executor, actor: Actor, bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  const rows = (await bookingLines(db, bookingId)).filter((r) => r.item.status !== "cancelled" && r.item.status !== "moved");
  const unpriced = rows.filter((r) => r.item.priceCents == null);
  if (unpriced.length) throw new OpsError("unpriced", `No price is set for ${unpriced[0].program.name}. Set pricing on the program before taking payment.`);
  const lines: LineInput[] = rows.map((r) => ({ kind: "charge", description: describeLine(r), unitCents: r.item.priceCents ?? 0, bookingItemId: r.item.id }));
  // Per-family extras (e.g. coworking during Immersive Play) are charged once per session.
  const familyExtras = new Set<string>();
  for (const r of rows)
    for (const a of addonsFor(r.program.kind, r.program.slug).filter((x) => !x.dayLength && r.item.addons.includes(x.key))) {
      if (a.perFamily) {
        if (familyExtras.has(`${r.session.id}:${a.key}`)) continue;
        familyExtras.add(`${r.session.id}:${a.key}`);
        lines.push({ kind: "charge", description: `${a.label} (${a.time}) · ${describeLine({ ...r, child: null })}`, unitCents: a.priceCents, bookingItemId: r.item.id });
      } else lines.push({ kind: "charge", description: `${a.label} (${a.time}) · ${describeLine(r)}`, unitCents: a.priceCents, bookingItemId: r.item.id });
    }
  lines.push(...(await siblingDiscountLines(db, rows, b.familyId)), ...familyRateLines(rows));
  return createInvoice(db, actor, { familyId: b.familyId, bookingId, description: `Booking ${b.reference}`, lines });
}

/* ── Checkout (public & payment links) ── */

export async function startCheckout(db: DB, actor: Actor, bookingId: string, urls: { base: string }) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw new OpsError("not_found", "Booking not found.");
  if (!["held", "pending_payment"].includes(b.status)) throw new OpsError("invalid", `This booking is ${BOOKING_STATUS_LABEL[b.status]?.toLowerCase()}.`);
  if (!b.holdExpiresAt || b.holdExpiresAt <= new Date()) throw new OpsError("expired", "Your hold has expired. Please choose your sessions again.");

  // Families must complete booking-blocking paperwork before paying (e.g. a waitlist offer made
  // before the waiver was signed). Staff-created bookings were acknowledged at creation.
  if (b.source !== "admin") {
    const rows = await bookingLines(db, b.id);
    const missing = await blockingPaperwork(db, {
      familyId: b.familyId,
      childIds: rows.map((r) => r.item.childId).filter(Boolean) as string[],
      programIds: [...new Set(rows.map((r) => r.program.id))],
      sessionIds: rows.map((r) => r.session.id),
      bookingId: b.id,
    });
    if (missing.length) throw new OpsError("paperwork", `Please complete before paying: ${[...new Set(missing.map((m) => m.title))].join(", ")}.`, { blocking: missing });
  }
  let [inv] = await db.select().from(invoices).where(and(eq(invoices.bookingId, b.id), ne(invoices.status, "void")));
  if (!inv) inv = await invoiceForBooking(db, actor, b.id);
  const t = (await invoiceTotals(db, [inv.id])).get(inv.id)!;
  // Play Pass funds are set aside first; the card pays only what's left.
  const fromWallet = b.source !== "admin" && t.balance > 0 ? await reserveForBooking(db, b.id, inv.id, t.balance) : 0;
  const due = t.balance - fromWallet;
  if (due <= 0) {
    await confirmBooking(db, actor, b.id, { reason: fromWallet ? "Paid from Play Pass" : "No payment due" });
    return { url: `${urls.base}${bookingStatusPath(b.reference)}`, free: true };
  }
  const [primary] = await db.select().from(guardians).where(and(eq(guardians.familyId, b.familyId), eq(guardians.isPrimary, true)));
  const provider = activeProvider();
  const paymentId = crypto.randomUUID();
  let idem = `checkout:${b.id}:${inv.id}:${due}:${b.holdExpiresAt.getTime()}`;
  const existing = await db.select().from(payments).where(eq(payments.idempotencyKey, idem));
  // A declined or abandoned attempt gets a fresh key so the family can try again.
  if (existing[0] && existing[0].status !== "pending") idem = `${idem}:retry-${randomToken(6)}`;
  if (existing[0]?.checkoutRef && existing[0].status === "pending") {
    return { url: provider.name === "test" ? `${urls.base}/pay/test/${existing[0].checkoutRef}` : existing[0].providerRef ?? `${urls.base}${bookingStatusPath(b.reference)}`, free: false };
  }
  const label = await checkoutLabel(db, b.id, { walletCents: fromWallet });
  const checkout = await provider.createCheckout({
    paymentId,
    amountCents: due,
    description: label.name,
    details: label.details,
    customerEmail: primary?.email,
    successUrl: `${urls.base}${bookingStatusPath(b.reference)}`,
    cancelUrl: `${urls.base}${bookingStatusPath(b.reference, { cancelled: "1" })}`,
    expiresAt: b.holdExpiresAt,
    idempotencyKey: idem,
  });
  await db.insert(payments).values({
    id: paymentId,
    invoiceId: inv.id,
    familyId: b.familyId,
    amountCents: due,
    method: "card",
    status: "pending",
    provider: provider.name,
    checkoutRef: checkout.checkoutRef,
    providerRef: provider.name === "stripe" ? checkout.url : null,
    idempotencyKey: idem,
  });
  await db.update(bookings).set({ status: "pending_payment", updatedAt: new Date() }).where(eq(bookings.id, b.id));
  await event(db, b.id, actor, "checkout_started", { provider: provider.name, amount: due, fromPlayPass: fromWallet || undefined });
  return { url: provider.name === "test" ? `${urls.base}${checkout.url}` : checkout.url, free: false };
}

/* ── Confirmation ── */

/** How a booking was paid, for messages: Play Pass funds and card, when both apply. */
async function paymentSummary(db: Executor, bookingId: string) {
  const invs = await db.select().from(invoices).where(and(eq(invoices.bookingId, bookingId), ne(invoices.status, "void")));
  if (!invs.length) return "";
  const t = [...(await invoiceTotals(db, invs.map((i) => i.id))).values()];
  const wallet = t.reduce((s, x) => s + x.walletApplied, 0);
  if (!wallet) return "";
  const card = t.reduce((s, x) => s + x.paid, 0);
  return `\n\nTotal: ${usd(t.reduce((s, x) => s + x.total, 0))}\nPaid from your Play Pass: ${usd(wallet)}${card ? `\nPaid by card: ${usd(card)}` : ""}`;
}

type LineRow = Awaited<ReturnType<typeof bookingLines>>[number];

/**
 * Family emails, laid out for a glance: each session set large with its date and time, then who's
 * coming and any extras (">>" lines are styled in the email; the plain-text version reads the same).
 */
function sessionBlocks(rows: LineRow[], opts: { cancelled?: boolean } = {}) {
  const bySession = new Map<string, LineRow[]>();
  for (const r of rows) bySession.set(r.session.id, [...(bySession.get(r.session.id) ?? []), r]);
  const blocks: string[] = [];
  for (const group of bySession.values()) {
    const s = group[0].session;
    const short = addonsFor(group[0].program.kind, group[0].program.slug).find((a) => a.endsAfterStartMinutes && group.some((r) => r.item.addons.includes(a.key)));
    const end = short ? new Date(s.startsAt.getTime() + short.endsAfterStartMinutes! * 60_000) : s.endsAt;
    blocks.push(`>> ${s.title ?? group[0].program.name}${short ? ` (${short.label.toLowerCase()})` : ""}\n${fmtDate(s.localDate, "EEEE, MMMM d, yyyy")} · ${fmtTime(s.startsAt)}–${fmtTime(end)}`);
    const card: string[] = group.map((r) => `${group.length > 1 || opts.cancelled ? "Child" : "Who’s coming"}: ${r.child ? `${r.child.preferredName || r.child.firstName} ${r.child.lastName}` : "Your family"}`);
    const extras = [
      ...new Set(
        group.flatMap((r) =>
          r.item.addons
            .map((k) => addonsFor(r.program.kind, r.program.slug).find((a) => a.key === k && !a.endsAfterStartMinutes))
            .filter((a): a is NonNullable<typeof a> => !!a)
            .map((a) => `${a.label}${a.time ? ` (${a.time})` : ""}`),
        ),
      ),
    ];
    if (extras.length) card.push(`Extras: ${extras.join(", ")}`);
    blocks.push(card.join("\n"));
  }
  return blocks;
}

/** What was paid, as a card: total, then how it was paid (or what's still due). */
async function paymentCard(db: Executor, bookingId: string) {
  const invs = await db.select().from(invoices).where(and(eq(invoices.bookingId, bookingId), ne(invoices.status, "void")));
  if (!invs.length) return "";
  const t = [...(await invoiceTotals(db, invs.map((i) => i.id))).values()];
  const sum = (k: "total" | "paid" | "walletApplied" | "creditApplied" | "balance") => t.reduce((s, x) => s + x[k], 0);
  if (!sum("total")) return "";
  const lines = [`Total: ${usd(sum("total"))}`];
  if (sum("walletApplied")) lines.push(`From your Play Pass: ${usd(sum("walletApplied"))}`);
  if (sum("creditApplied") - sum("walletApplied") > 0) lines.push(`From your Yalla Wallet credit: ${usd(sum("creditApplied") - sum("walletApplied"))}`);
  if (sum("paid")) lines.push(`Paid by card: ${usd(sum("paid"))}`);
  if (sum("balance") > 0) lines.push(`Still due: ${usd(sum("balance"))}`);
  return lines.join("\n");
}

async function siteBase() {
  const { trustedBaseUrl } = await import("@/lib/base-url");
  return trustedBaseUrl();
}

async function confirmationVars(db: Executor, bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  const rows = (await bookingLines(db, bookingId)).filter((r) => r.item.status === "confirmed" || r.item.status === "held");
  const first = rows[0];
  const loc = first?.session.locationId ? (await db.select().from(locations).where(eq(locations.id, first.session.locationId)))[0] : undefined;
  const arrival = first?.program.arrivalInstructions ?? loc?.arrivalInstructions ?? "";
  const pay = await paymentCard(db, bookingId);
  // "Where" opens the address in the family's maps app.
  const address = loc?.address?.trim() || site.address.value || "";
  const placeName = loc?.name ?? "Yalla";
  const where = address ? `[${placeName} · ${address}](https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Yalla Childcare & Coworking, ${address}`)})` : placeName;
  const summary = [...sessionBlocks(rows), ...(pay ? [pay] : []), `Where: ${where}\nReference: ${b.reference}`, ...(arrival.trim() ? [`~~ ${arrival.trim().replace(/\s*\n+\s*/g, " ")}`] : [])].join("\n\n");
  return {
    reference: b.reference,
    program: [...new Set(rows.map((r) => r.program.name))].join(", "),
    date: first ? fmtDate(first.session.localDate) : "",
    booking_details: rows.map((r) => `• ${describeLine(r)}`).join("\n") + (await paymentSummary(db, bookingId)),
    booking_summary: summary,
    location: loc?.name ?? "Yalla",
    arrival_instructions: arrival,
    portal_link: `${await siteBase()}/portal/home?tab=bookings`,
  };
}

/**
 * Variables for a family's cancellation email, about exactly what was cancelled. `refund` says what
 * happened to the money: returned to the Yalla Wallet, too late for credit, or nothing was paid.
 */
export async function cancellationVars(db: Executor, bookingId: string, itemIds: string[], refund: { walletCents?: number; note?: string }) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  const rows = (await bookingLines(db, bookingId)).filter((r) => itemIds.includes(r.item.id));
  const base = await siteBase();
  const credit = refund.walletCents
    ? `!! ${usd(refund.walletCents)} | has been returned to your Yalla Wallet. Use it toward any Yalla booking within 24 months.`
    : `~~ ${refund.note ?? "If a refund or credit applies, we’ll confirm it separately."}`;
  return {
    reference: b.reference,
    program: [...new Set(rows.map((r) => r.program.name))].join(", "),
    date: rows[0] ? fmtDate(rows[0].session.localDate) : "",
    booking_details: rows.map((r) => `• ${describeLine(r)}`).join("\n"),
    booking_summary: [...sessionBlocks(rows, { cancelled: true }), `Reference: ${b.reference}\nStatus: Cancelled`].join("\n\n"),
    refund_note: refund.walletCents ? `${usd(refund.walletCents)} has been returned to your Yalla Wallet. Credit from a cancellation can be used toward any Yalla booking for 24 months.` : (refund.note ?? "If a refund or credit applies, we’ll confirm it separately."),
    refund_summary: credit,
    book_link: `${base}/book`,
    policy_link: `${base}/policies#cancellation-refund`,
  };
}

/** "2 years old" from 2 years up, "14 months old" below that (on the day of care). */
function ageOnDay(birthDate: string, onDate: string) {
  const m = ageInMonths(birthDate, onDate);
  if (m < 0) return "not yet born";
  if (m < 24) return `${m} ${m === 1 ? "month" : "months"} old`;
  const y = Math.floor(m / 12);
  return `${y} years old`;
}

/**
 * The team's email for each confirmed booking: who booked what, for whom (with birthday and age),
 * and how many spots are left in that age group on that day.
 */
export async function staffBookingNotice(db: Executor, bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  const rows = (await bookingLines(db, bookingId)).filter((r) => r.item.status === "confirmed");
  if (!b || !rows.length) return null;
  const [g] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.familyId, b.familyId), eq(guardians.isPrimary, true)))
    .limit(1);
  const who = g ? `${g.firstName} ${g.lastName}` : "A family";
  const avail = await availabilityFor(
    db,
    [...new Set(rows.map((r) => r.session.id))],
  );
  const bySession = new Map<string, typeof rows>();
  for (const r of rows) bySession.set(r.session.id, [...(bySession.get(r.session.id) ?? []), r]);
  // Laid out for a glance: the session large, a details card, then spots left as a big number
  // (">>", "!!" lines are styled in the email; the plain-text version reads the same without them).
  const blocks: string[] = [];
  for (const group of bySession.values()) {
    const s = group[0].session;
    const what = s.title ?? group[0].program.name;
    const left = Math.max(0, avail.get(s.id)?.remaining ?? 0);
    const short = fmtDate(s.localDate, "MMMM d");
    blocks.push(`>> ${what}\n${fmtDate(s.localDate, "EEEE, MMMM d, yyyy")} · ${fmtTime(s.startsAt)}–${fmtTime(s.endsAt)}`);
    blocks.push(
      [
        `Parent: ${who}`,
        ...group.map((r) =>
          r.child ? `Child: ${r.child.firstName} ${r.child.lastName} · born ${fmtDate(r.child.birthDate, "MMM d, yyyy")} · ${ageOnDay(r.child.birthDate, s.localDate)}` : "Child: not named",
        ),
      ].join("\n"),
    );
    blocks.push(left === 0 ? `!! Full | That age group is now full for ${short}.` : `!! ${left} | ${left === 1 ? "spot" : "spots"} left in that age group for ${short} before it’s full`);
  }
  const via = b.source === "admin" ? "By the team in Admin" : b.source === "waitlist" ? "From a waitlist offer" : "On the website";
  blocks.push(`Booked: ${via}\nReference: ${b.reference}`);
  const first = rows[0];
  const sessionsCount = bySession.size;
  const summary = `${who} · ${first.session.title ?? first.program.name} · ${fmtDate(first.session.localDate, "MMM d")}${sessionsCount > 1 ? ` + ${sessionsCount - 1} more` : ""}`;
  return { summary, details: blocks.join("\n\n"), reference: b.reference };
}

/**
 * Confirms held items. If the hold has lapsed (e.g. a delayed payment callback), capacity is
 * re-checked under lock; when the spots are gone the booking is flagged "needs attention" rather
 * than overbooking.
 */
export async function confirmBooking(db: DB, actor: Actor, bookingId: string, opts: { reason: string; now?: Date; notify?: boolean }) {
  const now = opts.now ?? new Date();
  const result = await db.transaction(async (tx) => {
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for("update");
    if (!b) throw new OpsError("not_found", "Booking not found.");
    if (b.status === "confirmed") return { status: "confirmed" as const, changed: false };
    if (b.status === "cancelled") return { status: "cancelled" as const, changed: false };
    const items = await tx.select().from(bookingItems).where(and(eq(bookingItems.bookingId, b.id), eq(bookingItems.status, "held")));
    await lockSessions(
      tx,
      items.map((i) => i.sessionId),
    );
    const holdValid = b.status === "requested" || (b.holdExpiresAt && b.holdExpiresAt > now);
    if (!holdValid) {
      // Re-check: are there still enough spots without this booking?
      const avail = await availabilityFor(
        tx,
        items.map((i) => i.sessionId),
        now,
      );
      const need = new Map<string, number>();
      for (const i of items) need.set(i.sessionId, (need.get(i.sessionId) ?? 0) + i.spots);
      const short = [...need].find(([sid, n]) => n > avail.get(sid)!.remaining);
      if (short) {
        await releaseForBooking(tx, b.id);
        await tx.update(bookings).set({ status: "needs_attention", updatedAt: now }).where(eq(bookings.id, b.id));
        await event(tx, b.id, actor, "needs_attention", { reason: "Hold expired before confirmation and the spots were taken", trigger: opts.reason });
        await audit(tx, actor, { action: "booking.needs_attention", entityType: "booking", entityId: b.id, summary: `${b.reference}: confirmed late and capacity is no longer available — staff follow-up needed` });
        return { status: "needs_attention" as const, changed: true };
      }
    }
    // Spend any Play Pass funds set aside for this booking (the rest was paid by card, or nothing was due).
    await captureForBooking(tx, actor, b.id);
    await tx.update(bookingItems).set({ status: "confirmed" }).where(and(eq(bookingItems.bookingId, b.id), eq(bookingItems.status, "held")));
    await tx.update(bookings).set({ status: "confirmed", holdExpiresAt: null, updatedAt: now }).where(eq(bookings.id, b.id));
    await event(tx, b.id, actor, "confirmed", { reason: opts.reason, lateConfirmation: !holdValid || undefined });
    await audit(tx, actor, { action: "booking.confirm", entityType: "booking", entityId: b.id, summary: `Confirmed ${b.reference} (${opts.reason})` });
    // Close the waitlist loop if this was an accepted offer.
    await tx.update(waitlistEntries).set({ status: "accepted", updatedAt: now }).where(eq(waitlistEntries.offerBookingId, b.id));
    return { status: "confirmed" as const, changed: true, familyId: b.familyId };
  });
  if (result.status === "confirmed" && result.changed) {
    // The team hears about every booking right away, however it was made.
    try {
      const notice = await staffBookingNotice(db, bookingId);
      if (notice) {
        const { teamRecipients, topicForProgram } = await import("./team-notices");
        const { notifyStaff } = await import("@/lib/notify");
        const { trustedBaseUrl } = await import("@/lib/base-url");
        const progs = await db
          .selectDistinct({ kind: programs.kind, slug: programs.slug })
          .from(bookingItems)
          .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
          .innerJoin(programs, eq(programs.id, sessions.programId))
          .where(eq(bookingItems.bookingId, bookingId));
        for (const to of await teamRecipients(db, progs.map(topicForProgram)))
          await notifyStaff(db, { key: "staff_new_booking", to, vars: { ...notice, link: `${trustedBaseUrl()}/admin/bookings/${bookingId}` }, relatedType: "booking", relatedId: bookingId });
      }
    } catch (e) {
      console.error("[staff booking email failed]", (e as Error).message?.slice(0, 160));
    }
    // Each Flex cohort's team hears about drop-ins to their cohort.
    const { notifyCohortsOfDropIns } = await import("./team-notices");
    await notifyCohortsOfDropIns(db, bookingId);
  }
  if (result.status === "confirmed" && result.changed && opts.notify !== false) {
    const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    const vars = await confirmationVars(db, bookingId);
    const { sendTeamBookingEmail, welcomeNewClient } = await import("@/lib/family-auth");
    const { trustedBaseUrl } = await import("@/lib/base-url");
    if (b.source === "admin") {
      // Booked by the team (by email, or in person): one email, worded for whether the family is
      // already in the Family Portal. The portal doesn't open by itself for a family new to it.
      await sendTeamBookingEmail(db, actor, { familyId: b.familyId, bookingId, vars }, trustedBaseUrl());
    } else {
      await notifyFamily(db, { key: "booking_confirmation", familyId: b.familyId, vars, related: { type: "booking", id: bookingId } });
      // A booking made and paid on the website is a family's way into the Family Portal.
      try {
        await welcomeNewClient(db, b.familyId, trustedBaseUrl(), "booking");
      } catch (e) {
        console.error("[portal welcome failed]", (e as Error).message?.slice(0, 160));
      }
    }
  }
  return result;
}

/** Admin: confirm a booking now and bill later (invoice left open), or with no invoice when free. */
export async function confirmAdminBooking(db: DB, actor: Actor, bookingId: string, opts: { createInvoice: boolean; notify: boolean }) {
  const res = await confirmBooking(db, actor, bookingId, { reason: "Confirmed by staff", notify: opts.notify });
  if (res.status === "confirmed" && opts.createInvoice) {
    const existing = await db.select().from(invoices).where(and(eq(invoices.bookingId, bookingId), ne(invoices.status, "void")));
    if (!existing.length) await invoiceForBooking(db, actor, bookingId);
  }
  return res;
}

export async function decideRequest(db: DB, actor: Actor, bookingId: string, approve: boolean, note?: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.status !== "requested") throw new OpsError("invalid", "This booking isn’t awaiting approval.");
  if (approve) {
    const holdMinutes = await getPolicy(db, "booking.holdMinutes");
    // Approval converts the request into a payment hold so the family can pay.
    await db.update(bookings).set({ status: "held", holdExpiresAt: new Date(Date.now() + Math.max(holdMinutes, 24 * 60) * 60_000), updatedAt: new Date() }).where(eq(bookings.id, b.id));
    await event(db, b.id, actor, "approved", { note });
    await audit(db, actor, { action: "booking.approve", entityType: "booking", entityId: b.id, summary: `Approved request ${b.reference}` });
  } else {
    await cancelBooking(db, actor, { bookingId, reason: note || "Request declined", notify: true });
  }
}

/* ── Cancellation ── */

export type CancelPreview = {
  items: { id: string; label: string; priceCents: number | null }[];
  paidCents: number;
  balanceCents: number;
  policy: string;
  note: string;
};

export async function previewCancel(db: Executor, bookingId: string, itemIds?: string[]): Promise<CancelPreview> {
  const rows = (await bookingLines(db, bookingId)).filter((r) => r.item.status === "confirmed" || r.item.status === "held");
  const target = itemIds?.length ? rows.filter((r) => itemIds.includes(r.item.id)) : rows;
  const invs = await db.select().from(invoices).where(and(eq(invoices.bookingId, bookingId), ne(invoices.status, "void")));
  const totals = await invoiceTotals(
    db,
    invs.map((i) => i.id),
  );
  const paid = [...totals.values()].reduce((s, t) => s + t.paid + t.creditApplied - t.refunded, 0);
  const balance = [...totals.values()].reduce((s, t) => s + t.balance, 0);
  const policy = await getPolicy(db, "booking.refundOnCancel");
  return {
    items: target.map((r) => ({ id: r.item.id, label: describeLine(r), priceCents: r.item.priceCents })),
    paidCents: paid,
    balanceCents: balance,
    policy,
    note:
      paid > 0
        ? `The family has paid ${usd(paid)}. Cancelling does not issue a refund — use Billing to refund or credit if appropriate.`
        : balance > 0
          ? `There is an unpaid balance of ${usd(balance)}. Adjust or void the invoice separately if it should no longer be owed.`
          : "No payments are associated with these items.",
  };
}

export async function cancelBooking(db: DB, actor: Actor, input: { bookingId: string; itemIds?: string[]; reason: string; notify: boolean; now?: Date }) {
  if (!input.reason.trim()) throw new OpsError("invalid", "Give a reason for the cancellation.");
  const now = input.now ?? new Date();
  const released = await db.transaction(async (tx) => {
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).for("update");
    if (!b) throw new OpsError("not_found", "Booking not found.");
    const active = await tx
      .select()
      .from(bookingItems)
      .where(and(eq(bookingItems.bookingId, b.id), inArray(bookingItems.status, ["held", "confirmed"])));
    const target = input.itemIds?.length ? active.filter((i) => input.itemIds!.includes(i.id)) : active;
    if (!target.length) throw new OpsError("invalid", "Nothing left to cancel on this booking.");
    await lockSessions(
      tx,
      target.map((i) => i.sessionId),
    );
    await tx
      .update(bookingItems)
      .set({ status: "cancelled", cancelledAt: now })
      .where(
        inArray(
          bookingItems.id,
          target.map((i) => i.id),
        ),
      );
    const allCancelled = target.length === active.length;
    if (allCancelled) await releaseForBooking(tx, b.id);
    await tx
      .update(bookings)
      .set({ status: allCancelled ? "cancelled" : b.status, cancelledAt: allCancelled ? now : b.cancelledAt, cancelReason: allCancelled ? input.reason : b.cancelReason, updatedAt: now })
      .where(eq(bookings.id, b.id));
    await event(tx, b.id, actor, allCancelled ? "cancelled" : "items_cancelled", { reason: input.reason, items: target.length });
    await audit(tx, actor, {
      action: "booking.cancel",
      entityType: "booking",
      entityId: b.id,
      summary: `${allCancelled ? "Cancelled" : `Cancelled ${target.length} item(s) on`} ${b.reference}: ${input.reason}`,
    });
    return { booking: b, sessionIds: [...new Set(target.map((i) => i.sessionId))], itemIds: target.map((i) => i.id) };
  });
  if (input.notify) {
    await notifyFamily(db, {
      key: "booking_cancellation",
      familyId: released.booking.familyId,
      vars: await cancellationVars(db, input.bookingId, released.itemIds, {}),
      related: { type: "booking", id: input.bookingId },
    });
  }
  return released;
}

/* ── Moves ── */

export async function previewMove(db: Executor, itemId: string, targetSessionId: string) {
  const [row] = await db
    .select({ item: bookingItems, booking: bookings })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .where(eq(bookingItems.id, itemId));
  if (!row || row.item.status !== "confirmed") throw new OpsError("invalid", "Only confirmed items can be moved.");
  const [target] = await db.select().from(sessions).where(eq(sessions.id, targetSessionId));
  if (!target) throw new OpsError("not_found", "Target session not found.");
  const [program] = await db.select().from(programs).where(eq(programs.id, target.programId));
  const child = row.item.childId ? (await db.select().from(children).where(eq(children.id, row.item.childId)))[0] : null;
  const prep = await prepare(db, row.booking.familyId, [{ sessionId: targetSessionId, childId: row.item.childId }], { source: "admin", now: new Date() });
  const cf = await conflicts(db, [{ sessionId: targetSessionId, childId: row.item.childId }], prep.sessionsById, row.booking.id, new Date());
  const avail = (await availabilityFor(db, [targetSessionId])).get(targetSessionId)!;
  const price = await priceFor(db, target, program, child, row.item.addons);
  const current = row.item.priceCents ?? 0;
  const diff = (price.cents ?? current) - current;
  return {
    target,
    program,
    remaining: avail.remaining,
    problems: [...prep.problems, ...cf, ...(avail.remaining < row.item.spots ? [{ code: "capacity", message: "The new session doesn’t have enough spots." }] : [])],
    currentPriceCents: current,
    newPriceCents: price.cents,
    differenceCents: diff,
    financialNote:
      diff > 0
        ? `The new session costs ${usd(diff)} more. A new invoice for ${usd(diff)} will be created.`
        : diff < 0
          ? `The new session costs ${usd(-diff)} less. Nothing is refunded automatically — refund or credit separately if appropriate.`
          : "No price difference.",
  };
}

export async function moveItem(db: DB, actor: Actor, input: { itemId: string; targetSessionId: string; notify: boolean }) {
  const preview = await previewMove(db, input.itemId, input.targetSessionId);
  if (preview.problems.length) throw new OpsError("invalid", preview.problems[0].message, { problems: preview.problems });
  const res = await db.transaction(async (tx) => {
    const [item] = await tx.select().from(bookingItems).where(eq(bookingItems.id, input.itemId)).for("update");
    await lockSessions(tx, [item.sessionId, input.targetSessionId]);
    const avail = (await availabilityFor(tx, [input.targetSessionId])).get(input.targetSessionId)!;
    if (avail.remaining < item.spots) throw new OpsError("capacity", "The new session just filled up.");
    await tx.update(bookingItems).set({ status: "moved", cancelledAt: new Date() }).where(eq(bookingItems.id, item.id));
    const [moved] = await tx
      .insert(bookingItems)
      .values({ bookingId: item.bookingId, sessionId: input.targetSessionId, childId: item.childId, adults: item.adults, spots: item.spots, status: "confirmed", priceCents: preview.newPriceCents ?? item.priceCents })
      .returning();
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, item.bookingId));
    await event(tx, b.id, actor, "moved", { from: item.sessionId, to: input.targetSessionId, difference: preview.differenceCents });
    await audit(tx, actor, { action: "booking.move", entityType: "booking", entityId: b.id, summary: `Moved an item on ${b.reference} to ${preview.program.name} ${fmtDate(preview.target.localDate)}` });
    if (preview.differenceCents > 0)
      await createInvoice(tx, actor, {
        familyId: b.familyId,
        bookingId: b.id,
        description: `Change to booking ${b.reference}`,
        lines: [{ kind: "charge", description: `Price difference: moved to ${preview.program.name} ${fmtDate(preview.target.localDate)}`, unitCents: preview.differenceCents, bookingItemId: moved.id }],
      });
    return { booking: b, moved };
  });
  if (input.notify)
    await notifyFamily(db, {
      key: "booking_change",
      familyId: res.booking.familyId,
      vars: { ...(await confirmationVars(db, res.booking.id)), change_summary: `Moved to ${preview.program.name} on ${fmtDate(preview.target.localDate)}.` },
      related: { type: "booking", id: res.booking.id },
    });
  return res;
}

/** Adds a child to an existing confirmed booking (same capacity rules) and bills the extra item. */
export async function addChildToBooking(db: DB, actor: Actor, input: { bookingId: string; sessionId: string; childId: string; override?: { reason: string } | null }) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
  if (!b || b.status !== "confirmed") throw new OpsError("invalid", "Children can be added to confirmed bookings.");
  const hold = await createHold(db, actor, { familyId: b.familyId, items: [{ sessionId: input.sessionId, childId: input.childId }], source: "admin", override: input.override, acknowledgePaperwork: true });
  // Fold the new item into the original booking and drop the temporary hold record.
  await db.transaction(async (tx) => {
    await tx.update(bookingItems).set({ bookingId: b.id, status: "confirmed" }).where(eq(bookingItems.bookingId, hold.booking.id));
    await tx.update(capacityOverrides).set({ bookingId: b.id }).where(eq(capacityOverrides.bookingId, hold.booking.id));
    await tx.update(bookingEvents).set({ bookingId: b.id }).where(eq(bookingEvents.bookingId, hold.booking.id));
    await tx.update(bookings).set({ status: "cancelled", cancelReason: `Merged into ${b.reference}` }).where(eq(bookings.id, hold.booking.id));
    await event(tx, b.id, actor, "child_added", { childId: input.childId, sessionId: input.sessionId });
    const rows = (await bookingLines(tx, b.id)).filter((r) => r.item.id === hold.items[0].id);
    if (rows[0]?.item.priceCents)
      await createInvoice(tx, actor, {
        familyId: b.familyId,
        bookingId: b.id,
        description: `Addition to booking ${b.reference}`,
        lines: [{ kind: "charge", description: describeLine(rows[0]), unitCents: rows[0].item.priceCents, bookingItemId: rows[0].item.id }],
      });
  });
}

export async function addBookingNote(db: Executor, actor: Actor, bookingId: string, body: string) {
  if (!body.trim()) throw new OpsError("invalid", "Write a note first.");
  await event(db, bookingId, actor, "note", { body: body.slice(0, 2000) });
}

export async function resendConfirmation(db: DB, actor: Actor, bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.status !== "confirmed") throw new OpsError("invalid", "Only confirmed bookings have a confirmation to resend.");
  await notifyFamily(db, { key: "booking_confirmation", familyId: b.familyId, vars: await confirmationVars(db, bookingId), related: { type: "booking", id: bookingId }, createdBy: actor.name });
  await event(db, bookingId, actor, "confirmation_resent");
}

/** Marks lapsed holds as expired (housekeeping; availability already ignores them). */
export async function expireHolds(db: DB, now = new Date()) {
  const expired = await db
    .update(bookings)
    .set({ status: "expired", updatedAt: now })
    .where(and(inArray(bookings.status, ["held", "pending_payment"]), sql`${bookings.holdExpiresAt} < ${now.toISOString()}::timestamptz`))
    .returning({ id: bookings.id });
  for (const e of expired) await releaseForBooking(db, e.id);
  await releaseExpiredReservations(db, now);
  return expired.length;
}


/** Template variables describing a booking (for confirmation and cancellation messages). */
export const bookingConfirmationVars = (db: Executor, bookingId: string) => confirmationVars(db, bookingId);
