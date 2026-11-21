/**
 * Carts and abandoned checkouts, for Admin → Carts & checkouts.
 *
 * Open carts: the public site keeps each visitor's cart on their device (lib/booking/cart.ts) and also
 * sends a copy here under a random cart id, so staff can see what's sitting in carts. Nothing personal
 * is stored unless the visitor is signed in to the Family Portal, when the cart is linked to their family.
 *
 * Abandoned checkouts: public bookings whose hold ran out before payment. The family entered their
 * details at checkout, so staff can see who they are and what they chose, and follow up.
 */
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { bookingItems, bookings, carts, children, families, guardians, programs, sessions, type SavedCartItem } from "@/lib/db/schema";
import { availabilityFor } from "@/lib/ops/capacity";

/** Matches the browser's cart lifetime (lib/booking/cart.ts). */
export const CART_TTL_MS = 7 * 24 * 3600_000;
const MAX_ITEMS = 60;

const CART_ID = /^[A-Za-z0-9_-]{16,64}$/;

/** Keeps only well-formed items, without trusting anything the browser sent for display. */
export function cleanCartItems(raw: unknown): SavedCartItem[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, SavedCartItem>();
  for (const r of raw.slice(0, MAX_ITEMS)) {
    if (!r || typeof r !== "object") continue;
    const i = r as Record<string, unknown>;
    if (typeof i.id !== "string" || !i.id || i.id.length > 64) continue;
    const spots = Math.min(20, Math.max(1, Math.floor(Number(i.spots) || 1)));
    const extras = Array.isArray(i.extras) ? i.extras.filter((e): e is string => typeof e === "string" && e.length > 0 && e.length <= 40).slice(0, 10) : [];
    out.set(i.id, { id: i.id, spots, extras, ...(i.flexible === true ? { flexible: true } : {}) });
  }
  return [...out.values()];
}

/**
 * Saves (or clears) a visitor's cart. Items for sessions that don't exist or have already started are
 * dropped. A signed-in family is linked to the cart; a cart stays linked if they later sign out.
 */
export async function saveCart(db: Executor, input: { cartId: string; items: unknown; familyId?: string | null; now?: Date }): Promise<{ ok: boolean; count: number }> {
  if (!CART_ID.test(input.cartId)) return { ok: false, count: 0 };
  const now = input.now ?? new Date();
  let items = cleanCartItems(input.items);
  if (items.length) {
    const live = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(inArray(sessions.id, items.map((i) => i.id)), gt(sessions.startsAt, now)));
    const ok = new Set(live.map((l) => l.id));
    items = items.filter((i) => ok.has(i.id));
  }
  if (!items.length) {
    await db.delete(carts).where(eq(carts.id, input.cartId));
    return { ok: true, count: 0 };
  }
  await db
    .insert(carts)
    .values({ id: input.cartId, familyId: input.familyId ?? null, items, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: carts.id,
      set: { items, updatedAt: now, familyId: sql`coalesce(excluded.family_id, ${carts.familyId})` },
    });
  return { ok: true, count: items.length };
}

/** Housekeeping: carts nobody has touched for a week are gone from the browser too. */
export async function pruneCarts(db: Executor, now = new Date()) {
  await db.delete(carts).where(lt(carts.updatedAt, new Date(now.getTime() - CART_TTL_MS)));
}

type SessionInfo = { id: string; name: string; programName: string; localDate: string; startsAt: Date; status: string };

async function sessionInfo(db: Executor, ids: string[]): Promise<Map<string, SessionInfo>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ s: sessions, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(inArray(sessions.id, ids));
  return new Map(rows.map(({ s, p }) => [s.id, { id: s.id, name: s.title ?? p.name, programName: p.name, localDate: s.localDate, startsAt: s.startsAt, status: s.status }]));
}

export type OpenCart = {
  id: string;
  family: { id: string; name: string } | null;
  items: (SavedCartItem & { session: SessionInfo })[];
  spots: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CartDemand = {
  session: SessionInfo;
  carts: number;
  spots: number;
  /** Spaces still open (null when availability couldn't be worked out). */
  remaining: number | null;
};

/** Every cart active in the last 7 days that still holds an upcoming session, newest first. */
export async function openCarts(db: Executor, now = new Date()): Promise<{ carts: OpenCart[]; demand: CartDemand[]; signedIn: number; spots: number }> {
  const rows = await db
    .select({ c: carts, f: families })
    .from(carts)
    .leftJoin(families, eq(families.id, carts.familyId))
    .where(gte(carts.updatedAt, new Date(now.getTime() - CART_TTL_MS)))
    .orderBy(desc(carts.updatedAt));
  const info = await sessionInfo(db, [...new Set(rows.flatMap((r) => r.c.items.map((i) => i.id)))]);

  const list: OpenCart[] = [];
  for (const { c, f } of rows) {
    const items = c.items
      .map((i) => ({ ...i, session: info.get(i.id) }))
      .filter((i): i is SavedCartItem & { session: SessionInfo } => !!i.session && i.session.startsAt > now && i.session.status !== "cancelled")
      .sort((a, b) => +a.session.startsAt - +b.session.startsAt);
    if (!items.length) continue;
    list.push({ id: c.id, family: f ? { id: f.id, name: f.name } : null, items, spots: items.reduce((s, i) => s + i.spots, 0), createdAt: c.createdAt, updatedAt: c.updatedAt });
  }

  const bySession = new Map<string, { session: SessionInfo; carts: number; spots: number }>();
  for (const c of list)
    for (const i of c.items) {
      const d = bySession.get(i.id) ?? { session: i.session, carts: 0, spots: 0 };
      d.carts++;
      d.spots += i.spots;
      bySession.set(i.id, d);
    }
  const avail = await availabilityFor(db, [...bySession.keys()], now).catch(() => new Map());
  const demand = [...bySession.values()]
    .map((d) => ({ ...d, remaining: avail.get(d.session.id)?.remaining ?? null }))
    .sort((a, b) => b.carts - a.carts || b.spots - a.spots || +a.session.startsAt - +b.session.startsAt);

  return { carts: list, demand, signedIn: list.filter((c) => c.family).length, spots: list.reduce((s, c) => s + c.spots, 0) };
}

export type CheckoutRow = {
  booking: { id: string; reference: string; status: string; createdAt: Date; holdExpiresAt: Date | null };
  family: { id: string; name: string; isSample: boolean };
  contact: { name: string; email: string; phone: string | null } | null;
  lines: { session: SessionInfo; childName: string | null; spots: number }[];
  /** The family went on to book at least one of the same sessions afterwards. */
  bookedLater: boolean;
  /** How many unpaid tries at these days this row stands for (a family who came back and tried again counts once). */
  attempts: number;
};

async function checkoutRows(db: Executor, list: (typeof bookings.$inferSelect)[]): Promise<CheckoutRow[]> {
  if (!list.length) return [];
  const ids = list.map((b) => b.id);
  const famIds = [...new Set(list.map((b) => b.familyId))];
  const [fams, guards, items] = await Promise.all([
    db.select().from(families).where(inArray(families.id, famIds)),
    db.select().from(guardians).where(inArray(guardians.familyId, famIds)).orderBy(desc(guardians.isPrimary), asc(guardians.createdAt)),
    db
      .select({ item: bookingItems, s: sessions, p: programs, child: children })
      .from(bookingItems)
      .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
      .innerJoin(programs, eq(programs.id, sessions.programId))
      .leftJoin(children, eq(children.id, bookingItems.childId))
      .where(inArray(bookingItems.bookingId, ids))
      .orderBy(asc(sessions.startsAt)),
  ]);
  // Later bookings by the same families that went ahead (paid, requested, or still being paid for).
  const later = await db
    .select({ familyId: bookings.familyId, createdAt: bookings.createdAt, sessionId: bookingItems.sessionId })
    .from(bookings)
    .innerJoin(bookingItems, eq(bookingItems.bookingId, bookings.id))
    .where(and(inArray(bookings.familyId, famIds), inArray(bookings.status, ["confirmed", "requested", "pending_payment", "held", "needs_attention"])));

  const famById = new Map(fams.map((f) => [f.id, f]));
  const contactByFam = new Map<string, (typeof guards)[number]>();
  for (const g of guards) if (!contactByFam.has(g.familyId)) contactByFam.set(g.familyId, g);

  return list.map((b) => {
    const f = famById.get(b.familyId)!;
    const g = contactByFam.get(b.familyId);
    const mine = items.filter((r) => r.item.bookingId === b.id);
    const sessionIds = new Set(mine.map((r) => r.s.id));
    return {
      booking: { id: b.id, reference: b.reference, status: b.status, createdAt: b.createdAt, holdExpiresAt: b.holdExpiresAt },
      family: { id: f.id, name: f.name, isSample: f.isSample },
      contact: g ? { name: `${g.firstName} ${g.lastName}`, email: g.email, phone: g.phone } : null,
      lines: mine.map((r) => ({
        session: { id: r.s.id, name: r.s.title ?? r.p.name, programName: r.p.name, localDate: r.s.localDate, startsAt: r.s.startsAt, status: r.s.status },
        childName: r.child ? r.child.preferredName || r.child.firstName : null,
        spots: r.item.spots,
      })),
      bookedLater: later.some((l) => l.familyId === b.familyId && l.createdAt > b.createdAt && sessionIds.has(l.sessionId)),
      attempts: 1,
    };
  });
}

/**
 * Checkouts started on the website that weren't paid: the hold expired. `days` looks back from now.
 * Also returns checkouts in progress right now (still held, hold not yet over).
 */
export async function abandonedCheckouts(db: Executor, opts: { days: number; now?: Date }): Promise<{ abandoned: CheckoutRow[]; inProgress: CheckoutRow[] }> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - opts.days * 24 * 3600_000);
  const [expired, live] = await Promise.all([
    db
      .select()
      .from(bookings)
      // Expired, or a hold that has run out but hasn't been tidied up by the daily job yet.
      .where(
        and(
          eq(bookings.source, "public"),
          gte(bookings.createdAt, since),
          or(eq(bookings.status, "expired"), and(inArray(bookings.status, ["held", "pending_payment"]), lte(bookings.holdExpiresAt, now))),
        ),
      )
      .orderBy(desc(bookings.createdAt))
      .limit(300),
    db
      .select()
      .from(bookings)
      .where(and(eq(bookings.source, "public"), inArray(bookings.status, ["held", "pending_payment"]), gt(bookings.holdExpiresAt, now)))
      .orderBy(desc(bookings.createdAt)),
  ]);
  const [rows, inProgress] = await Promise.all([checkoutRows(db, expired), checkoutRows(db, live)]);
  // A family who tried more than once for the same days is one abandoned checkout (the latest try).
  const abandoned: CheckoutRow[] = [];
  const overlaps = (a: CheckoutRow, b: CheckoutRow) => a.family.id === b.family.id && a.lines.some((x) => b.lines.some((y) => y.session.id === x.session.id));
  for (const r of rows) {
    const kept = abandoned.find((k) => overlaps(k, r));
    if (kept) {
      kept.attempts += 1;
      kept.bookedLater ||= r.bookedLater;
    } else abandoned.push(r);
  }
  return { abandoned, inProgress };
}

/** Numbers for the Today dashboard. */
export async function cartSummary(db: Executor, now = new Date()) {
  const [open, checkouts] = await Promise.all([openCarts(db, now), abandonedCheckouts(db, { days: 7, now })]);
  return {
    openCarts: open.carts.length,
    spots: open.spots,
    top: open.demand.slice(0, 3),
    inProgress: checkouts.inProgress.length,
    abandoned: checkouts.abandoned.filter((a) => !a.bookedLater).length,
  };
}
