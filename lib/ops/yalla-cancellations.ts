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
import { bookingItems, bookings, cancellationOffers, invoices, programs, sessions, spaceReservationGroups, spaceReservations, workspaces } from "@/lib/db/schema";
import { notifyFamily } from "@/lib/notify";
import { issueCredit, usd } from "@/lib/playpass/wallet";
import { recordWalletCredit } from "@/lib/playpass/credit-notice";
import { fmtDate } from "@/lib/time";
import { cancelBooking } from "./bookings";
import { itemValue, returnableCents, returnPaid } from "./credits";
import { getPolicy } from "./settings";
import { cancelSpaceGroup } from "@/lib/spaces/engine";

/** "Camp Yalla on Wednesday, November 25 and Yalla Flex on Friday, November 27", for families. */
function sessionList(rows: { s: typeof sessions.$inferSelect; p: typeof programs.$inferSelect }[]) {
  const parts = [...new Set(rows.map((r) => `${r.s.title ?? r.p.name} on ${fmtDate(r.s.localDate, "EEEE, MMMM d")}`))];
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
}

/** An offer's description without the booking reference ("YL-ABC123: Camp Yalla, Wed Nov 25" → "Camp Yalla, Wed Nov 25"). */
const offerWhat = (description: string) => `your booking for ${description.replace(/^[A-Z]{2}-[A-Z0-9]+:\s*/, "")}`;

export type StaffCancelMode ="family_policy" | "family_courtesy" | "family_none" | "yalla";

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
/** "The family chooses between $X in credit (with the 5% thank-you) or a full refund of $Y." */
async function yallaChoice(db: Executor, amountCents: number) {
  const bonus = Number(await getPolicy(db, "booking.yallaCancelBonusPercent")) || 0;
  return `Because Yalla cancelled, the family chooses in their Family Portal between ${usd(Math.round(amountCents * (1 + bonus / 100)))} in Yalla Wallet credit (including the ${bonus}% thank-you) or a full refund of ${usd(amountCents)}.`;
}

export async function staffCancelBooking(db: DB, actor: Actor, input: { bookingId: string; itemIds?: string[]; reason: string; notify: boolean; mode: StaffCancelMode; now?: Date }) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
  const before = b
    ? await db
        .select({ id: bookingItems.id })
        .from(bookingItems)
        .where(and(eq(bookingItems.bookingId, b.id), eq(bookingItems.status, "confirmed"), input.itemIds?.length ? inArray(bookingItems.id, input.itemIds) : undefined))
    : [];
  const r = await staffCancelBookingInner(db, actor, input);
  // Only confirmed care is news to the team (an abandoned checkout hold isn't a cancellation).
  if (b?.status === "confirmed" && before.length) {
    const { notifyTeamOfCancellation } = await import("./staff-notices");
    const money =
      input.mode === "yalla"
        ? r.offered
          ? await yallaChoice(db, r.offered)
          : "Because Yalla cancelled, the family would choose credit or a refund, but nothing had been paid."
        : r.credited
          ? `We returned ${usd(r.credited)} to their Yalla Wallet.`
          : input.mode === "family_none"
            ? "No credit was given (chosen when cancelling)."
            : "No credit was given (cancelled inside the credit cutoff, or nothing had been paid).";
    await notifyTeamOfCancellation(db, { bookingId: b.id, itemIds: before.map((x) => x.id), actor, money, walletCents: input.mode === "yalla" ? 0 : r.credited });
    if (input.notify && input.mode !== "yalla") {
      const { cancellationVars } = await import("./bookings");
      await notifyFamily(db, {
        key: "booking_cancellation",
        familyId: b.familyId,
        vars: await cancellationVars(db, b.id, before.map((x) => x.id), {
          walletCents: r.credited,
          note: "This cancellation isn’t eligible for credit under our cancellation policy. If something unexpected came up, just reply to this email and let us know.",
        }),
        related: { type: "booking", id: b.id },
      });
    }
  }
  return r;
}

async function staffCancelBookingInner(db: DB, actor: Actor, input: { bookingId: string; itemIds?: string[]; reason: string; notify: boolean; mode: StaffCancelMode; now?: Date }) {
  const now = input.now ?? new Date();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
  if (!b) throw new OpsError("not_found", "Booking not found.");
  const rows = await db
    .select({ i: bookingItems, s: sessions, p: programs })
    .from(bookingItems)
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(eq(bookingItems.bookingId, b.id), eq(bookingItems.status, "confirmed"), input.itemIds?.length ? inArray(bookingItems.id, input.itemIds) : undefined));
  // Confirmed care: the family's email is sent below, once we know what happened to the money.
  await cancelBooking(db, actor, { bookingId: b.id, itemIds: input.itemIds, reason: input.reason, notify: input.notify && input.mode !== "yalla" && b.status !== "confirmed" });
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
    // What the family reads in their "added to your Yalla Wallet" email (the staff note above stays internal).
    familyReason:
      input.mode === "family_courtesy"
        ? `Your booking for ${sessionList(eligible)} was cancelled, and Team Yalla returned what you paid for it to your Yalla Wallet as a courtesy credit.`
        : `Your booking for ${sessionList(eligible)} was cancelled at least ${cutoff} hours before it began, so what you paid for it was returned to your Yalla Wallet.`,
  });
  return { credited: r.total, offered: 0 };
}

/** Staff cancel a paid workspace reservation because Yalla can't honor it. */
export async function staffCancelSpace(db: DB, actor: Actor, input: { groupId: string; reason: string; yalla: boolean }) {
  const [was] = await db.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, input.groupId));
  const g = await cancelSpaceGroup(db, actor, input.groupId, { reason: input.reason });
  const { notifyTeamOfSpaceCancellation } = await import("./staff-notices");
  const tell = (money: string) => (was?.status === "confirmed" ? notifyTeamOfSpaceCancellation(db, { groupId: g.id, actor, money }) : Promise.resolve());
  if (!input.yalla || g.totalCents <= 0) {
    await tell(g.totalCents > 0 ? `They had paid ${usd(g.totalCents)}. Nothing was refunded or credited automatically; you can do that from the reservation.` : "Complimentary time, so there was nothing to return.");
    return { offered: 0 };
  }
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
  await tell(await yallaChoice(db, offer?.amountCents ?? 0));
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
    const r = await returnPaid(db, actor, {
      ...target,
      amountCents: o.amountCents,
      key: `yalla-cancel:${o.id}`,
      reason: `Yalla cancelled: ${o.reason}`,
      to: input.choice === "credit" ? "wallet" : "original",
      // Credit: one email below with the credit and the thank-you together. Refund: only Play Pass or wallet funds come back to the wallet.
      walletEmail: input.choice !== "credit",
      familyReason: `Yalla cancelled ${offerWhat(o.description)}. What you paid from your Yalla Wallet was returned to it, and the rest was refunded to your original payment method.\n\nWhy it was cancelled: ${o.reason}`,
    });
    let bonus = 0;
    if (input.choice === "credit") {
      bonus = bonusFor(r.total, o.bonusPercent);
      if (bonus > 0) await issueCredit(db, { familyId: o.familyId, amountCents: bonus, sourceRef: `yalla-cancel-bonus:${o.id}`, note: `Thank-you for your flexibility (${o.bonusPercent}%)`, createdBy: actor.name });
      await recordWalletCredit(db, {
        familyId: o.familyId,
        transactionKey: `yalla-cancel:${o.id}`,
        amountCents: r.total + bonus,
        reason: `Yalla cancelled ${offerWhat(o.description)}. You chose Yalla Wallet credit, so we returned the ${usd(r.total)} you paid${bonus > 0 ? ` and added ${usd(bonus)} (${o.bonusPercent}%) as a thank-you for your flexibility` : ""}.\n\nWhy it was cancelled: ${o.reason}`,
      });
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

