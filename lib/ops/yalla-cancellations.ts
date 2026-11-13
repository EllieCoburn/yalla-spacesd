/**
 * When Yalla cancels or significantly changes a paid reservation (Policies & Terms → If Yalla
 * cancels or changes your reservation), the family chooses in their Family Portal:
 *
 * - Yalla Wallet credit plus 5% (the full value, plus a thank-you), valid 24 months; or
 * - a full refund to the original payment method (Play Pass funds return to their balance).
 *
 * Staff cancelling on a family's behalf choose instead whether the family's own cancellation earns
 * credit (24+ hours ahead, or a courtesy credit for illness).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB, Executor } from "@/lib/db";
import { bookingItems, bookings, cancellationOffers, invoices, programs, sessions, spaceReservations, workspaces } from "@/lib/db/schema";
import { notifyFamily } from "@/lib/notify";
import { issueCredit, usd } from "@/lib/playpass/wallet";
import { fmtDate } from "@/lib/time";
import { cancelBooking } from "./bookings";
import { itemValue, returnableCents, returnPaid } from "./credits";
import { getPolicy } from "./settings";
import { cancelSpaceGroup } from "@/lib/spaces/engine";

export type StaffCancelMode = "family_policy" | "family_courtesy" | "family_none" | "yalla";

export const STAFF_CANCEL_MODES: { value: StaffCancelMode; label: string }[] = [
  { value: "yalla", label: "Yalla is cancelling: the family chooses credit + 5% or a full refund" },
  { value: "family_policy", label: "Family cancelled: Yalla Wallet credit if 24+ hours ahead" },
  { value: "family_courtesy", label: "Family cancelled late (illness or extenuating): courtesy credit" },
  { value: "family_none", label: "Family cancelled late or no-show: no credit" },
];

/** Record the family's choice for money Yalla owes them after cancelling. Returns the offer (or null when nothing was paid). */
async function createOffer(
  db: DB,
  actor: Actor,
  input: { familyId: string; bookingId?: string; spaceGroupId?: string; invoiceIds?: string[]; itemIds?: string[]; valueCents: number; description: string; reason: string },
) {
  const returnable = await returnableCents(db, { bookingId: input.bookingId, invoiceIds: input.invoiceIds });
  // Money already set aside for other open offers on the same booking isn't offered twice.
  const open = input.bookingId
    ? await db
        .select({ amount: cancellationOffers.amountCents })
        .from(cancellationOffers)
        .where(and(eq(cancellationOffers.bookingId, input.bookingId), eq(cancellationOffers.status, "pending")))
    : [];
  const amount = Math.min(input.valueCents, returnable - open.reduce((s, o) => s + o.amount, 0));
  if (amount <= 0) return null;
  const bonusPercent = await getPolicy(db, "booking.yallaCancelBonusPercent");
  const [offer] = await db
    .insert(cancellationOffers)
    .values({
      familyId: input.familyId,
      bookingId: input.bookingId ?? null,
      spaceGroupId: input.spaceGroupId ?? null,
      itemIds: input.itemIds ?? [],
      description: input.description,
      reason: input.reason,
      amountCents: amount,
      bonusPercent,
      createdBy: actor.name,
    })
    .returning();
  await audit(db, actor, { action: "billing.yalla_cancel_offer", entityType: "family", entityId: input.familyId, summary: `Yalla cancelled ${input.description}: family to choose credit + ${bonusPercent}% or a refund of ${usd(amount)}` });
  await notifyFamily(db, {
    key: "yalla_cancellation",
    familyId: input.familyId,
    vars: {
      booking_details: input.description,
      reason: input.reason,
      amount: usd(amount),
      credit_amount: usd(amount + bonusFor(amount, bonusPercent)),
      bonus_percent: String(bonusPercent),
    },
    related: input.bookingId ? { type: "booking", id: input.bookingId } : undefined,
    createdBy: actor.name,
  });
  return offer;
}

export const bonusFor = (amount: number, percent: number) => Math.round((amount * percent) / 100);

/** Staff cancel booked items, saying who cancelled and so how the money is handled. */
export async function staffCancelBooking(db: DB, actor: Actor, input: { bookingId: string; itemIds?: string[]; reason: string; notify: boolean; mode: StaffCancelMode; now?: Date }) {
  const now = input.now ?? new Date();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
  if (!b) throw new OpsError("not_found", "Booking not found.");
  const rows = await db
    .select({ i: bookingItems, s: sessions, p: programs })
    .from(bookingItems)
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(eq(bookingItems.bookingId, b.id), eq(bookingItems.status, "confirmed"), input.itemIds?.length ? inArray(bookingItems.id, input.itemIds) : undefined));
  await cancelBooking(db, actor, { bookingId: b.id, itemIds: input.itemIds, reason: input.reason, notify: input.notify && input.mode !== "yalla" });
  if (b.status !== "confirmed" || !rows.length) return { credited: 0, offered: 0 };
  if (input.mode === "family_none") return { credited: 0, offered: 0 };
  if (input.mode === "yalla") {
    const offer = await createOffer(db, actor, {
      familyId: b.familyId,
      bookingId: b.id,
      itemIds: rows.map((r) => r.i.id),
      valueCents: rows.reduce((s, r) => s + itemValue(r.i, r.p.kind, r.p.slug), 0),
      description: `${b.reference}: ${[...new Set(rows.map((r) => `${r.s.title ?? r.p.name}, ${fmtDate(r.s.localDate, "EEE MMM d")}`))].join("; ")}`,
      reason: input.reason,
    });
    return { credited: 0, offered: offer?.amountCents ?? 0 };
  }
  const cutoff = await getPolicy(db, "booking.creditCutoffHours");
  const eligible = rows.filter((r) => input.mode === "family_courtesy" || (r.s.startsAt.getTime() - now.getTime()) / 3600_000 >= cutoff);
  const value = eligible.reduce((s, r) => s + itemValue(r.i, r.p.kind, r.p.slug), 0);
  if (!value) return { credited: 0, offered: 0 };
  const r = await returnPaid(db, actor, {
    bookingId: b.id,
    amountCents: value,
    key: `staff-cancel:${eligible.map((e) => e.i.id).sort().join(",")}`,
    reason: input.mode === "family_courtesy" ? `Courtesy credit: ${input.reason}` : `Cancelled by the family: ${input.reason}`,
    to: "wallet",
  });
  return { credited: r.total, offered: 0 };
}

/** Staff cancel a paid workspace reservation because Yalla can't honor it. */
export async function staffCancelSpace(db: DB, actor: Actor, input: { groupId: string; reason: string; yalla: boolean }) {
  const g = await cancelSpaceGroup(db, actor, input.groupId, { reason: input.reason });
  if (!input.yalla || g.totalCents <= 0) return { offered: 0 };
  const invs = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.spaceGroupId, g.id));
  const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, g.workspaceId));
  const [first] = await db.select().from(spaceReservations).where(eq(spaceReservations.groupId, g.id)).limit(1);
  const offer = await createOffer(db, actor, {
    familyId: g.familyId,
    spaceGroupId: g.id,
    invoiceIds: invs.map((i) => i.id),
    valueCents: g.totalCents,
    description: `${g.reference}: ${ws?.name ?? "Workspace"}${first ? `, ${fmtDate(first.localDate, "EEE MMM d")}` : ""}`,
    reason: input.reason,
  });
  return { offered: offer?.amountCents ?? 0 };
}

/** Choices waiting for a family (and recent decisions), newest first. */
export async function familyOffers(db: Executor, familyId: string) {
  return db.select().from(cancellationOffers).where(eq(cancellationOffers.familyId, familyId)).orderBy(desc(cancellationOffers.createdAt)).limit(20);
}

/**
 * The family's decision (or staff recording it for them). Runs once: a second choice changes
 * nothing.
 */
export async function resolveOffer(db: DB, actor: Actor, input: { offerId: string; familyId?: string; choice: "credit" | "refund" }) {
  const claimed = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(cancellationOffers).where(eq(cancellationOffers.id, input.offerId)).for("update");
    if (!o || (input.familyId && o.familyId !== input.familyId)) throw new OpsError("not_found", "We couldn’t find that cancellation.");
    if (o.status !== "pending") return null;
    // Claim it so a double tap can't run twice; the amounts are filled in below.
    await tx
      .update(cancellationOffers)
      .set({ status: input.choice === "credit" ? "credited" : "refunded", resolvedAt: new Date(), resolvedBy: actor.name })
      .where(eq(cancellationOffers.id, o.id));
    return o;
  });
  if (!claimed) {
    const [o] = await db.select().from(cancellationOffers).where(eq(cancellationOffers.id, input.offerId));
    return o;
  }
  const o = claimed;
  const target = o.bookingId ? { bookingId: o.bookingId } : { invoiceIds: (await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.spaceGroupId, o.spaceGroupId!))).map((i) => i.id) };
  try {
    const r = await returnPaid(db, actor, { ...target, amountCents: o.amountCents, key: `yalla-cancel:${o.id}`, reason: `Yalla cancelled: ${o.reason}`, to: input.choice === "credit" ? "wallet" : "original" });
    let bonus = 0;
    if (input.choice === "credit") {
      bonus = bonusFor(r.total, o.bonusPercent);
      if (bonus > 0) await issueCredit(db, { familyId: o.familyId, amountCents: bonus, sourceRef: `yalla-cancel-bonus:${o.id}`, note: `Thank-you for your flexibility (${o.bonusPercent}%)`, createdBy: actor.name });
    }
    const [done] = await db
      .update(cancellationOffers)
      .set(input.choice === "credit" ? { creditedCents: r.total + bonus } : { refundedCents: r.toCard, creditedCents: r.toWallet || null })
      .where(eq(cancellationOffers.id, o.id))
      .returning();
    await audit(db, actor, {
      action: "billing.yalla_cancel_resolved",
      entityType: "family",
      entityId: o.familyId,
      summary: input.choice === "credit" ? `Chose Yalla Wallet credit: ${usd(r.total + bonus)} (including ${usd(bonus)} bonus)` : `Chose a refund: ${usd(r.toCard)} to the original payment method${r.toWallet ? `, ${usd(r.toWallet)} back to the Yalla Wallet` : ""}`,
    });
    return done;
  } catch (e) {
    // Put it back so the family (or staff) can try again; refunds are idempotent per key.
    await db.update(cancellationOffers).set({ status: "pending", resolvedAt: null, resolvedBy: null }).where(eq(cancellationOffers.id, o.id));
    throw e;
  }
}

