/**
 * The Play Pass wallet: a family's prepaid dollar balance, kept as an append-only ledger.
 *
 * - Money is integer cents. The balance is the sum of ledger entries; nothing is edited.
 * - Every credit belongs to an allocation (a month's funding, or an adjustment). Spending draws
 *   from the oldest allocation first and records which one, so each allocation's use is known.
 * - During checkout, funds are *reserved* against the booking. They're captured (spent) only when
 *   the booking is confirmed, and released if the hold ends unpaid. Reservations count against
 *   the available balance, so the same dollars can't be spent twice.
 * - All changes to one family's wallet run inside a transaction holding a lock on that family.
 * - Two pools share the wallet: Play Pass balance (spent only on eligible Happenings, never
 *   expires) and Yalla credits from cancellations (kind "credit": spent on any booking, each valid
 *   24 months from issue). Credits never pay membership dues.
 */
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB, Executor } from "@/lib/db";
import { bookingItems, bookings, families, invoiceLines, invoices, payments, programs, sessions, walletAllocations, walletEntries, walletReservations } from "@/lib/db/schema";
import { refreshInvoiceStatus } from "@/lib/ops/billing";
import { addDaysISO, todayLA } from "@/lib/time";

/** Cancellation credits are valid for 24 months from the date they're issued. */
export const creditExpiry = (issued = todayLA()) => {
  const [y, m, d] = issued.split("-").map(Number);
  const target = `${y + 2}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // Feb 29 → Feb 28 when the later year isn't a leap year.
  return new Date(`${target}T12:00:00Z`).toISOString().slice(0, 10) === target ? target : addDaysISO(`${y + 2}-03-01`, -1);
};

export const usd = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export type WalletSummary = {
  balanceCents: number;
  reservedCents: number;
  availableCents: number;
  /** Play Pass balance and Yalla credits, each net of what's held for checkouts. */
  passCents: number;
  creditCents: number;
  /** The soonest a credit expires (for "use by" reminders). */
  nextCreditExpiry: string | null;
};

const LEFT = sql<number>`coalesce((select sum(e.amount_cents) from wallet_entries e where e.allocation_id = "wallet_allocations"."id"), 0)::int`;
const live = (today: string) => sql`(${walletAllocations.expiresOn} is null or ${walletAllocations.expiresOn} >= ${today})`;

/** Serialize wallet changes for one family. */
export async function lockFamily(tx: Executor, familyId: string) {
  await tx.select({ id: families.id }).from(families).where(eq(families.id, familyId)).for("update");
}

export async function walletSummary(db: Executor, familyId: string, today = todayLA()): Promise<WalletSummary> {
  const open = await openAllocations(db, familyId, "any", today);
  const pass = open.filter((o) => o.a.kind !== "credit").reduce((s, o) => s + o.left, 0);
  const credit = open.filter((o) => o.a.kind === "credit").reduce((s, o) => s + o.left, 0);
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${walletReservations.amountCents}), 0)::int`, c: sql<number>`coalesce(sum(${walletReservations.creditCents}), 0)::int` })
    .from(walletReservations)
    .where(and(eq(walletReservations.familyId, familyId), eq(walletReservations.status, "held")));
  const balance = pass + credit;
  const passCents = Math.max(0, pass - (r.n - r.c));
  const creditCents = Math.max(0, credit - r.c);
  const next = open.filter((o) => o.a.kind === "credit" && o.a.expiresOn).map((o) => o.a.expiresOn!).sort()[0] ?? null;
  return { balanceCents: balance, reservedCents: r.n, availableCents: passCents + creditCents, passCents, creditCents, nextCreditExpiry: next };
}

/**
 * What's left of each live allocation. Play Pass funds oldest first; credits soonest-expiring
 * first. Expired credits are left out (the expiry job records them).
 */
async function openAllocations(db: Executor, familyId: string, pool: "pass" | "credit" | "any" = "any", today = todayLA()) {
  const rows = await db
    .select({ a: walletAllocations, left: LEFT })
    .from(walletAllocations)
    .where(and(eq(walletAllocations.familyId, familyId), live(today)))
    .orderBy(asc(walletAllocations.expiresOn), asc(walletAllocations.periodStart), asc(walletAllocations.createdAt));
  const open = rows.filter((r) => r.left > 0);
  const pass = open.filter((r) => r.a.kind !== "credit");
  const credit = open.filter((r) => r.a.kind === "credit");
  return pool === "pass" ? pass : pool === "credit" ? credit : [...pass, ...credit];
}

/**
 * Add funds. Idempotent on `sourceRef` (e.g. the paid provider invoice): a second call with the
 * same source returns null and changes nothing.
 */
export async function allocate(
  tx: Executor,
  input: {
    familyId: string;
    subscriptionId?: string | null;
    planId?: string | null;
    kind: "initial" | "renewal" | "adjustment" | "credit";
    periodStart?: string;
    amountCents: number;
    sourceRef?: string | null;
    expiresOn?: string | null;
    createdBy: string;
    note: string;
  },
) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new OpsError("invalid", "An allocation must be a positive whole number of cents.");
  await lockFamily(tx, input.familyId);
  const [a] = await tx
    .insert(walletAllocations)
    .values({
      familyId: input.familyId,
      subscriptionId: input.subscriptionId ?? null,
      planId: input.planId ?? null,
      kind: input.kind,
      periodStart: input.periodStart ?? todayLA(),
      amountCents: input.amountCents,
      sourceRef: input.sourceRef ?? null,
      expiresOn: input.expiresOn ?? null,
    })
    .onConflictDoNothing({ target: walletAllocations.sourceRef })
    .returning();
  if (!a) return null;
  await tx.insert(walletEntries).values({
    familyId: input.familyId,
    allocationId: a.id,
    kind: input.kind === "adjustment" ? "adjustment" : input.kind === "credit" ? "credit" : "allocation",
    amountCents: input.amountCents,
    note: input.note,
    createdBy: input.createdBy,
    idempotencyKey: `alloc:${a.id}`,
  });
  return a;
}

/**
 * Spend: Play Pass funds first (up to `passMax`), then credits. Caller holds the family lock and
 * has checked funds.
 */
async function debit(
  tx: Executor,
  input: { familyId: string; amountCents: number; passMax?: number; kind: "booking_debit" | "adjustment" | "expiration"; key: string; bookingId?: string; invoiceId?: string; paymentId?: string; reservationId?: string; note: string; createdBy: string },
) {
  let left = input.amountCents;
  let passLeft = input.passMax ?? Number.POSITIVE_INFINITY;
  let i = 0;
  for (const { a, left: room } of await openAllocations(tx, input.familyId)) {
    if (left <= 0) break;
    const isPass = a.kind !== "credit";
    const take = Math.min(room, left, isPass ? passLeft : Number.POSITIVE_INFINITY);
    if (take <= 0) continue;
    if (isPass) passLeft -= take;
    await tx.insert(walletEntries).values({
      familyId: input.familyId,
      allocationId: a.id,
      kind: input.kind,
      amountCents: -take,
      bookingId: input.bookingId ?? null,
      invoiceId: input.invoiceId ?? null,
      paymentId: input.paymentId ?? null,
      reservationId: input.reservationId ?? null,
      note: input.note,
      createdBy: input.createdBy,
      idempotencyKey: `${input.key}:${i++}`,
    });
    left -= take;
  }
  if (left > 0) throw new OpsError("insufficient", "There isn’t enough in the Yalla Wallet for that.");
}

/* ── Eligibility ── */

/** Sessions on which Play Pass funds may be spent: the session's own setting, else its program's. */
export async function eligibleSessionIds(db: Executor, sessionIds: string[]) {
  if (!sessionIds.length) return new Set<string>();
  const rows = await db
    .select({ id: sessions.id, own: sessions.playPassEligible, eligible: programs.playPassEligible, redeem: programs.walletRedemptionAllowed })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(inArray(sessions.id, sessionIds));
  return new Set(rows.filter((r) => r.redeem && (r.own ?? r.eligible)).map((r) => r.id));
}

/** The part of a booking's invoice that Play Pass funds may cover (eligible items, net of their discounts). */
export async function eligibleInvoiceCents(db: Executor, bookingId: string, invoiceId: string) {
  const items = await db.select({ id: bookingItems.id, sessionId: bookingItems.sessionId }).from(bookingItems).where(eq(bookingItems.bookingId, bookingId));
  const ok = await eligibleSessionIds(
    db,
    items.map((i) => i.sessionId),
  );
  const okItems = new Set(items.filter((i) => ok.has(i.sessionId)).map((i) => i.id));
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  let eligible = 0;
  let allCharges = 0;
  let untied = 0;
  for (const l of lines) {
    const charge = l.kind === "charge" || l.kind === "fee";
    if (charge) allCharges += l.amountCents;
    if (l.bookingItemId) {
      if (okItems.has(l.bookingItemId)) eligible += l.amountCents;
    } else if (!charge) untied += l.amountCents;
  }
  const eligibleCharges = lines.filter((l) => (l.kind === "charge" || l.kind === "fee") && l.bookingItemId && okItems.has(l.bookingItemId)).reduce((s, l) => s + l.amountCents, 0);
  // Discounts on the whole booking (e.g. the After Hours family rate) are shared in proportion.
  if (untied && allCharges > 0) eligible += Math.round((untied * eligibleCharges) / allCharges);
  return Math.max(0, eligible);
}

/* ── Reservations: during checkout ── */

export async function heldReservation(db: Executor, bookingId: string) {
  const [r] = await db
    .select()
    .from(walletReservations)
    .where(and(eq(walletReservations.bookingId, bookingId), eq(walletReservations.status, "held")));
  return r ?? null;
}

/**
 * Set aside Play Pass funds for a held booking: as much of the eligible amount as the family has
 * available (never more than the invoice still owes). Returns the reserved amount (0 if none).
 */
export async function reserveForBooking(db: DB, bookingId: string, invoiceId: string, outstandingCents: number) {
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
    if (!b || !b.holdExpiresAt) return 0;
    await lockFamily(tx, b.familyId);
    const existing = await heldReservation(tx, bookingId);
    if (existing) return existing.amountCents;
    const w = await walletSummary(tx, b.familyId);
    if (w.availableCents <= 0) return 0;
    // Play Pass funds cover eligible items; credits cover anything that's left.
    const eligible = w.passCents ? await eligibleInvoiceCents(tx, bookingId, invoiceId) : 0;
    const pass = Math.min(w.passCents, eligible, outstandingCents);
    const credit = Math.min(w.creditCents, outstandingCents - pass);
    const amount = pass + credit;
    if (amount <= 0) return 0;
    await tx.insert(walletReservations).values({ familyId: b.familyId, bookingId, invoiceId, amountCents: amount, creditCents: credit, status: "held", expiresAt: b.holdExpiresAt });
    return amount;
  });
}

/**
 * Spend the reserved funds: a "wallet" payment on the invoice plus the matching ledger debits.
 * Called when the booking is confirmed (it's idempotent). If the reservation had already been
 * released (the hold lapsed before a card payment landed), it tries to take the same amount again
 * from what's available now; anything it can't cover stays on the invoice for staff to follow up.
 */
export async function captureForBooking(tx: Executor, actor: Actor, bookingId: string) {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) return 0;
  await lockFamily(tx, b.familyId);
  let r = await heldReservation(tx, bookingId);
  if (!r) {
    const [released] = await tx
      .select()
      .from(walletReservations)
      .where(and(eq(walletReservations.bookingId, bookingId), eq(walletReservations.status, "released")))
      .orderBy(sql`${walletReservations.createdAt} desc`)
      .limit(1);
    const captured = await tx.select({ id: walletReservations.id }).from(walletReservations).where(and(eq(walletReservations.bookingId, bookingId), eq(walletReservations.status, "captured")));
    if (!released || captured.length) return 0;
    const w = await walletSummary(tx, b.familyId);
    const pass = Math.min(released.amountCents - released.creditCents, w.passCents);
    const credit = Math.min(released.amountCents - pass, w.creditCents);
    const amount = pass + credit;
    if (amount <= 0) return 0;
    [r] = await tx.insert(walletReservations).values({ familyId: b.familyId, bookingId, invoiceId: released.invoiceId, amountCents: amount, creditCents: credit, status: "held", expiresAt: new Date() }).returning();
  }
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, r.invoiceId));
  const [pay] = await tx
    .insert(payments)
    .values({
      invoiceId: r.invoiceId,
      familyId: b.familyId,
      amountCents: r.amountCents,
      method: "wallet",
      status: "succeeded",
      provider: "wallet",
      idempotencyKey: `wallet:${r.id}`,
      recordedBy: actor.name,
      succeededAt: new Date(),
    })
    .onConflictDoNothing({ target: payments.idempotencyKey })
    .returning();
  if (pay) {
    await debit(tx, {
      familyId: b.familyId,
      amountCents: r.amountCents,
      passMax: r.amountCents - r.creditCents,
      kind: "booking_debit",
      key: `debit:${r.id}`,
      bookingId,
      invoiceId: r.invoiceId,
      paymentId: pay.id,
      reservationId: r.id,
      note: `Booking ${b.reference}${inv ? ` (${inv.number})` : ""}`,
      createdBy: actor.name,
    });
    await audit(tx, actor, { action: "playpass.wallet_spent", entityType: "booking", entityId: bookingId, summary: `${usd(r.amountCents)} from the Yalla Wallet applied to ${b.reference}` });
  }
  await tx.update(walletReservations).set({ status: "captured", settledAt: new Date() }).where(eq(walletReservations.id, r.id));
  await refreshInvoiceStatus(tx, r.invoiceId);
  return r.amountCents;
}

export async function releaseForBooking(db: Executor, bookingId: string) {
  await db
    .update(walletReservations)
    .set({ status: "released", settledAt: new Date() })
    .where(and(eq(walletReservations.bookingId, bookingId), eq(walletReservations.status, "held")));
}

/** Release reservations whose checkout hold has ended (run with the hold expiry job). */
export async function releaseExpiredReservations(db: Executor, now = new Date()) {
  const rows = await db
    .update(walletReservations)
    .set({ status: "released", settledAt: now })
    .where(and(eq(walletReservations.status, "held"), lt(walletReservations.expiresAt, now)))
    .returning({ id: walletReservations.id });
  return rows.length;
}

/* ── Restores, reversals and adjustments ── */

/**
 * Return spent funds to the wallet (a cancelled booking, or a refund of a wallet payment). The
 * money goes back to the allocations it came from. Idempotent on `key`.
 */
export async function restoreWalletPayment(tx: Executor, input: { paymentId: string; amountCents: number; key: string; note: string; createdBy: string }) {
  const [p] = await tx.select().from(payments).where(eq(payments.id, input.paymentId));
  if (!p || p.method !== "wallet") throw new OpsError("invalid", "That isn’t a Play Pass payment.");
  await lockFamily(tx, p.familyId);
  const debits = await tx.select().from(walletEntries).where(and(eq(walletEntries.paymentId, p.id), eq(walletEntries.kind, "booking_debit")));
  const restored = await tx
    .select({ allocationId: walletEntries.allocationId, n: sql<number>`sum(${walletEntries.amountCents})::int` })
    .from(walletEntries)
    .where(and(eq(walletEntries.paymentId, p.id), eq(walletEntries.kind, "booking_refund")))
    .groupBy(walletEntries.allocationId);
  const backAlready = new Map(restored.map((r) => [r.allocationId, r.n]));
  const totalBack = [...backAlready.values()].reduce((a, b) => a + b, 0);
  const spent = -debits.reduce((s, d) => s + d.amountCents, 0);
  if (input.amountCents <= 0 || input.amountCents > spent - totalBack) throw new OpsError("invalid", `Up to ${usd(spent - totalBack)} of this Play Pass payment can be returned.`);
  // Newest allocation first, so the freshest funds come back.
  let left = input.amountCents;
  let i = 0;
  for (const d of [...debits].reverse()) {
    if (left <= 0) break;
    const room = -d.amountCents - (backAlready.get(d.allocationId) ?? 0);
    if (room <= 0) continue;
    const give = Math.min(room, left);
    const [row] = await tx
      .insert(walletEntries)
      .values({
        familyId: p.familyId,
        allocationId: d.allocationId,
        kind: "booking_refund",
        amountCents: give,
        bookingId: d.bookingId,
        invoiceId: p.invoiceId,
        paymentId: p.id,
        note: input.note,
        createdBy: input.createdBy,
        idempotencyKey: `${input.key}:${i++}`,
      })
      .onConflictDoNothing({ target: walletEntries.idempotencyKey })
      .returning();
    if (!row) return; // already restored under this key
    backAlready.set(d.allocationId, (backAlready.get(d.allocationId) ?? 0) + give);
    left -= give;
  }
}

/** A documented correction by an administrator. Positive adds funds; negative removes available funds. */
export async function adjustWallet(db: DB, actor: Actor, input: { familyId: string; amountCents: number; note: string; idempotencyKey: string }) {
  if (!input.note.trim()) throw new OpsError("invalid", "Say why the balance is being adjusted.");
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) throw new OpsError("invalid", "Enter an amount other than zero.");
  return db.transaction(async (tx) => {
    await lockFamily(tx, input.familyId);
    const [done] = await tx.select().from(walletEntries).where(sql`${walletEntries.idempotencyKey} like ${`adjust:${input.idempotencyKey}%`}`);
    if (done) return;
    if (input.amountCents > 0) {
      const added = await allocate(tx, { familyId: input.familyId, kind: "adjustment", amountCents: input.amountCents, sourceRef: `adjust:${input.idempotencyKey}`, createdBy: actor.name, note: input.note });
      if (!added) return; // the same adjustment was already recorded
    } else {
      const { availableCents } = await walletSummary(tx, input.familyId);
      if (-input.amountCents > availableCents) throw new OpsError("invalid", `Only ${usd(availableCents)} is available to remove.`);
      await debit(tx, { familyId: input.familyId, amountCents: -input.amountCents, kind: "adjustment", key: `adjust:${input.idempotencyKey}`, note: input.note, createdBy: actor.name });
    }
    await audit(tx, actor, { action: "playpass.wallet_adjusted", entityType: "family", entityId: input.familyId, summary: `Play Pass balance adjusted by ${usd(input.amountCents)}: ${input.note}` });
  });
}

/**
 * A cancellation credit: added to the wallet, valid 24 months. Idempotent on `sourceRef`.
 */
export async function issueCredit(tx: Executor, input: { familyId: string; amountCents: number; sourceRef: string; note: string; createdBy: string; issuedOn?: string }) {
  return allocate(tx, { familyId: input.familyId, kind: "credit", amountCents: input.amountCents, sourceRef: input.sourceRef, expiresOn: creditExpiry(input.issuedOn), createdBy: input.createdBy, note: input.note });
}

/** Record expired credits in the ledger (daily job). Balances already leave them out. */
export async function expireCredits(db: DB, today = todayLA()) {
  const due = await db
    .select({ a: walletAllocations, left: LEFT })
    .from(walletAllocations)
    .where(and(eq(walletAllocations.kind, "credit"), lt(walletAllocations.expiresOn, today)));
  let n = 0;
  for (const { a, left } of due) {
    if (left <= 0) continue;
    await db.transaction(async (tx) => {
      await lockFamily(tx, a.familyId);
      const inserted = await tx
        .insert(walletEntries)
        .values({ familyId: a.familyId, allocationId: a.id, kind: "expiration", amountCents: -left, note: `Credit expired ${a.expiresOn}`, createdBy: "system", idempotencyKey: `expire:${a.id}` })
        .onConflictDoNothing({ target: walletEntries.idempotencyKey })
        .returning();
      if (inserted.length) n++;
    });
  }
  return n;
}

/** Recent ledger activity for a family, newest first. */
export async function walletActivity(db: Executor, familyId: string, limit = 50) {
  return db.select().from(walletEntries).where(eq(walletEntries.familyId, familyId)).orderBy(sql`${walletEntries.createdAt} desc`).limit(limit);
}

/** Each allocation with what's been used and what's left (for rollover review). */
export async function allocationsWithUse(db: Executor, familyId: string) {
  const rows = await db
    .select({ a: walletAllocations, left: sql<number>`coalesce((select sum(e.amount_cents) from wallet_entries e where e.allocation_id = "wallet_allocations"."id"), 0)::int` })
    .from(walletAllocations)
    .where(eq(walletAllocations.familyId, familyId))
    .orderBy(sql`${walletAllocations.periodStart} desc`);
  return rows.map((r) => ({ ...r.a, leftCents: r.left, usedCents: r.a.amountCents - r.left }));
}
