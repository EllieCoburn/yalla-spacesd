/** Promo codes: looking one up for checkout, and the invoice lines it produces. Rules: lib/booking/promo.ts. */
import { and, eq, inArray, sql } from "drizzle-orm";
import { OpsError } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { bookings, discounts } from "@/lib/db/schema";
import { FAMILY_RATE } from "@/lib/booking/family-rate";
import { normalizeCode, promoMatches, promoSavings, type PromoRule } from "@/lib/booking/promo";
import { todayLA } from "@/lib/time";
import type { LineInput } from "./billing";

type DiscountRow = typeof discounts.$inferSelect;

/** Bookings that count toward a code's "max uses": anything not cancelled or expired. */
const LIVE = ["held", "pending_payment", "requested", "confirmed", "needs_attention"];

export function toRule(d: DiscountRow): PromoRule {
  return { code: d.code ?? "", name: d.name, kind: d.kind === "fixed" ? "fixed" : "percent", value: d.value, programId: d.programId, programKind: d.programKind };
}

/** A code a family can use right now, or an OpsError("promo") saying why not. */
export async function findPromo(db: Executor, raw: string, now = new Date()): Promise<DiscountRow> {
  const code = normalizeCode(raw);
  const invalid = new OpsError("promo", "That code isn’t valid.");
  if (!code) throw invalid;
  const [d] = await db.select().from(discounts).where(eq(discounts.code, code));
  if (!d || !d.active) throw invalid;
  const today = todayLA(now);
  if (d.startsOn && today < d.startsOn) throw new OpsError("promo", "That code isn’t active yet.");
  if (d.endsOn && today > d.endsOn) throw new OpsError("promo", "That code has expired.");
  if (d.maxUses != null) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.discountId, d.id), inArray(bookings.status, LIVE)));
    if (n >= d.maxUses) throw new OpsError("promo", "That code has been fully used.");
  }
  return d;
}

type Row = {
  item: { id: string; priceCents: number | null };
  program: { id: string; kind: string; name: string };
};

/** Discount lines for a promo code, after sibling discounts (passed in) are taken into account. */
export function promoLines(d: DiscountRow, rows: Row[], earlier: LineInput[]): LineInput[] {
  const rule = toRule(d);
  const matching = rows.filter((r) => r.item.priceCents && r.program.kind !== FAMILY_RATE.kind && promoMatches(rule, r.program));
  const net = matching.map((r) => (r.item.priceCents ?? 0) + earlier.filter((l) => l.bookingItemId === r.item.id && l.kind === "discount").reduce((s, l) => s + l.unitCents, 0));
  const off = promoSavings(rule, net);
  return matching
    .map((r, i) => ({ kind: "discount" as const, description: `Promo ${rule.code}${rule.kind === "percent" ? ` (${rule.value}% off)` : ""} · ${r.program.name}`, unitCents: -off[i], bookingItemId: r.item.id }))
    .filter((l) => l.unitCents < 0);
}
