/**
 * Live capacity.
 *
 * A session's used spots =
 *     confirmed booking items
 *   + held items whose checkout hold hasn't expired (and items awaiting approval)
 *   + Club Yalla members whose recurring schedule covers the session
 *   + spots reserved by staff.
 * Effective capacity = capacity + recorded overrides, never above hard capacity.
 * Sessions linked to a shared capacity pool are also limited by everything else in that pool
 * that overlaps in time (e.g. Club Yalla and Yalla Flex sharing a cohort room).
 *
 * Writers lock the affected session and pool rows (SELECT … FOR UPDATE) inside a transaction
 * before reading occupancy, so two families can't take the last spot at the same moment.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Executor, Tx } from "@/lib/db";
import { capacityPools, programs, sessions } from "@/lib/db/schema";

export type Occupancy = { booked: number; held: number; members: number; reserved: number; used: number };

export type SessionAvailability = {
  sessionId: string;
  capacity: number;
  effectiveCapacity: number;
  hardCapacity: number | null;
  occupancy: Occupancy;
  poolId: string | null;
  poolRemaining: number | null;
  remaining: number;
};

const n = (v: unknown) => Number(v ?? 0);

export async function occupancyFor(db: Executor, sessionIds: string[], now = new Date()): Promise<Map<string, Occupancy>> {
  const out = new Map<string, Occupancy>();
  if (!sessionIds.length) return out;
  const ids = sql`ARRAY[${sql.join(
    sessionIds.map((s) => sql`${s}`),
    sql`, `,
  )}]::text[]`;

  const items = await db.execute<{ session_id: string; booked: number; held: number }>(sql`
    SELECT bi.session_id,
      COALESCE(SUM(bi.spots) FILTER (WHERE bi.status = 'confirmed'), 0) AS booked,
      COALESCE(SUM(bi.spots) FILTER (
        WHERE bi.status = 'held' AND (
          b.status = 'requested'
          OR (b.status IN ('held', 'pending_payment') AND b.hold_expires_at > ${now.toISOString()}::timestamptz)
        )
      ), 0) AS held
    FROM booking_items bi
    JOIN bookings b ON b.id = bi.booking_id
    WHERE bi.session_id = ANY(${ids})
    GROUP BY bi.session_id`);

  const members = await db.execute<{ session_id: string; members: number }>(sql`
    SELECT s.id AS session_id, COUNT(m.id) AS members
    FROM sessions s
    JOIN memberships m
      ON m.program_id = s.program_id
     AND m.cohort_id = s.cohort_id
     AND EXTRACT(DOW FROM s.local_date)::int = ANY(m.weekdays)
     AND m.starts_on <= s.local_date
     AND (m.ends_on IS NULL OR m.ends_on >= s.local_date)
     AND m.status IN ('active', 'upcoming', 'paused')
     AND (s.starts_at AT TIME ZONE 'America/Los_Angeles')::time < (CASE m.day_length WHEN 'half' THEN TIME '12:00' ELSE TIME '16:30' END)
     AND (s.ends_at AT TIME ZONE 'America/Los_Angeles')::time > TIME '08:30'
    WHERE s.id = ANY(${ids})
      AND NOT EXISTS (
        SELECT 1 FROM membership_exceptions e
        WHERE e.membership_id = m.id AND e.date = s.local_date AND e.releases_spot
      )
    GROUP BY s.id`);

  const reserved = await db.select({ id: sessions.id, reserved: sessions.reservedSpots }).from(sessions).where(inArray(sessions.id, sessionIds));

  for (const r of reserved) out.set(r.id, { booked: 0, held: 0, members: 0, reserved: r.reserved, used: 0 });
  for (const r of items) {
    const o = out.get(r.session_id);
    if (o) {
      o.booked = n(r.booked);
      o.held = n(r.held);
    }
  }
  for (const r of members) {
    const o = out.get(r.session_id);
    if (o) o.members = n(r.members);
  }
  for (const o of out.values()) o.used = o.booked + o.held + o.members + o.reserved;
  return out;
}

export async function availabilityFor(db: Executor, sessionIds: string[], now = new Date()): Promise<Map<string, SessionAvailability>> {
  const result = new Map<string, SessionAvailability>();
  if (!sessionIds.length) return result;
  const rows = await db.select().from(sessions).where(inArray(sessions.id, sessionIds));

  const overrides = await db.execute<{ session_id: string; extra: number }>(sql`
    SELECT session_id, COALESCE(SUM(extra_spots), 0) AS extra FROM capacity_overrides
    WHERE session_id IN (${sql.join(
      sessionIds.map((s) => sql`${s}`),
      sql`, `,
    )}) GROUP BY session_id`);
  const extra = new Map(overrides.map((o) => [o.session_id, n(o.extra)]));

  // Pool neighbours: other sessions in the same pool that overlap in time.
  const pooled = rows.filter((r) => r.capacityPoolId);
  const neighbours = new Map<string, string[]>();
  let poolCaps = new Map<string, number>();
  if (pooled.length) {
    const poolIds = [...new Set(pooled.map((r) => r.capacityPoolId!))];
    poolCaps = new Map((await db.select().from(capacityPools).where(inArray(capacityPools.id, poolIds))).map((p) => [p.id, p.capacity]));
    for (const s of pooled) {
      const overlapping = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.capacityPoolId, s.capacityPoolId!),
            sql`${sessions.status} <> 'cancelled'`,
            sql`${sessions.startsAt} < ${s.endsAt.toISOString()}::timestamptz`,
            sql`${sessions.endsAt} > ${s.startsAt.toISOString()}::timestamptz`,
          ),
        );
      neighbours.set(
        s.id,
        overlapping.map((o) => o.id),
      );
    }
  }
  const allIds = [...new Set([...sessionIds, ...[...neighbours.values()].flat()])];
  const occ = await occupancyFor(db, allIds, now);

  for (const s of rows) {
    const o = occ.get(s.id)!;
    const effective = Math.min(s.capacity + (extra.get(s.id) ?? 0), s.hardCapacity ?? Number.POSITIVE_INFINITY);
    let remaining = effective - o.used;
    let poolRemaining: number | null = null;
    if (s.capacityPoolId) {
      const used = (neighbours.get(s.id) ?? []).reduce((sum, id) => sum + (occ.get(id)?.used ?? 0), 0);
      poolRemaining = (poolCaps.get(s.capacityPoolId) ?? 0) - used;
      remaining = Math.min(remaining, poolRemaining);
    }
    result.set(s.id, {
      sessionId: s.id,
      capacity: s.capacity,
      effectiveCapacity: effective,
      hardCapacity: s.hardCapacity,
      occupancy: o,
      poolId: s.capacityPoolId,
      poolRemaining,
      remaining: Math.max(remaining, 0),
    });
  }
  return result;
}

/** Locks sessions and their pools in a stable order. Call at the start of any capacity-changing transaction. */
export async function lockSessions(tx: Tx, sessionIds: string[]) {
  const ids = [...new Set(sessionIds)].sort();
  if (!ids.length) return [];
  const locked = await tx.select().from(sessions).where(inArray(sessions.id, ids)).orderBy(sessions.id).for("update");
  const poolIds = [...new Set(locked.map((s) => s.capacityPoolId).filter(Boolean) as string[])].sort();
  if (poolIds.length) await tx.select({ id: capacityPools.id }).from(capacityPools).where(inArray(capacityPools.id, poolIds)).orderBy(capacityPools.id).for("update");
  return locked;
}

/* ── Public availability state ── */

export type PublicState =
  | { state: "available"; remaining: number | null }
  | { state: "limited"; remaining: number; showCount: boolean }
  | { state: "full"; waitlist: boolean }
  | { state: "closed"; reason: string }
  | { state: "not_offered" };

export function publicState(
  session: { status: string; startsAt: Date; bookingOpensAt: Date | null; bookingClosesAt: Date | null },
  program: Pick<typeof programs.$inferSelect, "status" | "showRemaining" | "lowAvailabilityThreshold" | "waitlistEnabled" | "minNoticeHours" | "advanceBookingDays">,
  remaining: number,
  now = new Date(),
): PublicState {
  if (session.status === "cancelled" || program.status === "archived" || program.status === "draft") return { state: "not_offered" };
  if (session.status === "closed") return { state: "closed", reason: "Closed" };
  if (program.status === "paused") return { state: "closed", reason: "Booking paused" };
  if (session.bookingOpensAt && now < session.bookingOpensAt) return { state: "closed", reason: "Booking not yet open" };
  if (session.bookingClosesAt && now > session.bookingClosesAt) return { state: "closed", reason: "Booking closed" };
  if (session.startsAt.getTime() - now.getTime() < program.minNoticeHours * 3600_000) return { state: "closed", reason: "Booking closed" };
  if (program.advanceBookingDays != null && session.startsAt.getTime() - now.getTime() > program.advanceBookingDays * 86400_000)
    return { state: "closed", reason: "Not yet open for booking" };
  if (remaining <= 0) return { state: "full", waitlist: program.waitlistEnabled };
  if (remaining <= program.lowAvailabilityThreshold) return { state: "limited", remaining, showCount: program.showRemaining };
  return { state: "available", remaining: program.showRemaining ? remaining : null };
}
