/**
 * Coupon codes families enter at checkout. Codes are the discounts set up in Billing → Discounts:
 * a percent or fixed amount, optionally limited to one program, a date range and a number of uses.
 * The discount is a line on the booking's invoice, so the card is charged the reduced amount.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { OpsError } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { bookings, discounts, programs, sessions } from "@/lib/db/schema";
import { todayLA } from "@/lib/time";
import type { LineInput } from "./billing";

export type Coupon = typeof discounts.$inferSelect;

/** What the checkout needs to show the saving before payment. */
export type CouponPreview = { code: string; kind: "percent" | "fixed"; value: number; programIds: string[] | null; label: string };

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

/** Finds a usable code for these sessions, or explains why it can't be used. */
export async function findCoupon(db: Executor, rawCode: string, sessionIds: string[], opts: { familyId?: string | null; now?: Date } = {}): Promise<Coupon> {
  const now = opts.now ?? new Date();
  const code = normalizeCode(rawCode);
  if (!code) throw new OpsError("coupon", "Enter a coupon code.");
  const [d] = await db.select().from(discounts).where(eq(discounts.code, code));
  const today = todayLA(now);
  if (!d || !d.active || (d.startsOn && today < d.startsOn) || (d.endsOn && today > d.endsOn)) throw new OpsError("coupon", "That coupon code isn’t valid.");
  if (d.maxUses != null) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.discountId, d.id), inArray(bookings.status, ["confirmed", "pending_payment", "held"])));
    if (n >= d.maxUses) throw new OpsError("coupon", "That coupon code has been fully used.");
  }
  // Some codes are one per family (a thank-you for coming back). A booking still being paid counts.
  if (d.oncePerFamily && opts.familyId) {
    const [used] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.discountId, d.id), eq(bookings.familyId, opts.familyId), inArray(bookings.status, ["confirmed", "pending_payment", "held"])))
      .limit(1);
    if (used) throw new OpsError("coupon", "Your family has already used this code.");
  }
  if (d.programId && sessionIds.length) {
    const rows = await db.select({ programId: sessions.programId }).from(sessions).where(inArray(sessions.id, sessionIds));
    if (!rows.some((r) => r.programId === d.programId)) {
      const [p] = await db.select({ name: programs.name }).from(programs).where(eq(programs.id, d.programId));
      throw new OpsError("coupon", `That code is for ${p?.name ?? "another program"} only.`);
    }
  }
  return d;
}

export async function couponPreview(db: Executor, d: Coupon): Promise<CouponPreview> {
  const [p] = d.programId ? await db.select({ name: programs.name }).from(programs).where(eq(programs.id, d.programId)) : [];
  const amount = d.kind === "percent" ? `${d.value}% off` : `$${(d.value / 100).toFixed(d.value % 100 ? 2 : 0)} off`;
  return { code: d.code!, kind: d.kind as "percent" | "fixed", value: d.value, programIds: d.programId ? [d.programId] : null, label: `${amount}${p ? ` ${p.name}` : ""}` };
}

/**
 * The coupon's invoice line: the discount applies to the charges (and any sibling discount) of the
 * sessions it covers. A fixed amount never takes the total below zero.
 */
export function couponLine(d: Coupon, lines: LineInput[], eligibleItemIds: Set<string>): LineInput | null {
  const base = lines.filter((l) => l.bookingItemId && eligibleItemIds.has(l.bookingItemId)).reduce((s, l) => s + l.unitCents * (l.quantity ?? 1), 0);
  if (base <= 0) return null;
  const off = d.kind === "percent" ? Math.round((base * d.value) / 100) : Math.min(d.value, base);
  if (off <= 0) return null;
  return { kind: "discount", description: `Coupon ${d.code} (${d.kind === "percent" ? `${d.value}% off` : "discount"})`, unitCents: -off };
}
