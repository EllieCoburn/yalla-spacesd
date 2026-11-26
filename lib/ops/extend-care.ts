/**
 * Staff-only: extending a child's day after the family asks in person ("can we stay until 4:30?").
 * Families can't do this themselves; Yalla decides whether there's room.
 *
 * The extra (camp late stay or Early Bird, a Yalla Flex half day made a full day, and so on) joins the
 * booking and is added to the booking's EXISTING invoice, so the invoice and its PDF read as one:
 * the session, "Late stay (3:00 – 4:30pm) · … · Ava  1 × $30.00", any coupon on it, and the balance
 * now due. Staff can apply the booking's coupon (or another code) to the extension, email a payment
 * link, or leave it on the family's account. A code can also be applied to a whole booking afterwards.
 */
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB } from "@/lib/db";
import { bookingEvents, bookingExtras, bookingItems, bookings, children, discounts, invoiceLines, invoices, programs, sessions } from "@/lib/db/schema";
import { addonsFor } from "@/lib/booking/addons";
import { fmtDate } from "@/lib/time";
import { createInvoice, invoiceTotals, refreshInvoiceStatus, sendInvoicePaymentLink, usd, type LineInput } from "./billing";
import { couponLine, couponPrograms, normalizeCode, type Coupon } from "./coupons";
import { priceFor } from "./bookings";
import { getPolicy } from "./settings";
import { payInvoiceFromWallet } from "@/lib/playpass/wallet";

export type ExtensionOption = { value: string; itemId: string; key: string; child: string; session: string; label: string; time: string; priceCents: number };

const FULL_DAY = "full_day";

async function bookingRows(db: DB, bookingId: string) {
  return db
    .select({ item: bookingItems, session: sessions, program: programs, child: children })
    .from(bookingItems)
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .leftJoin(children, eq(children.id, bookingItems.childId))
    .where(and(eq(bookingItems.bookingId, bookingId), eq(bookingItems.status, "confirmed")));
}

/** What staff can add to each child on a booking: the program's extras they don't have yet, and a full day for a half day. */
export async function extensionOptions(db: DB, bookingId: string): Promise<ExtensionOption[]> {
  const rows = await bookingRows(db, bookingId);
  const out: ExtensionOption[] = [];
  for (const r of rows) {
    const child = r.child ? r.child.preferredName || r.child.firstName : "Booking";
    const session = `${r.session.title ?? r.program.name} · ${fmtDate(r.session.localDate, "EEE d MMM")}`;
    for (const a of addonsFor(r.program.kind, r.program.slug)) {
      if (a.dayLength === "half") {
        if (!r.item.addons.includes(a.key)) continue;
        const full = await priceFor(db, r.session, r.program, r.child, r.item.addons.filter((k) => k !== a.key));
        const diff = (full.cents ?? 0) - (r.item.priceCents ?? 0);
        if (diff > 0) out.push({ value: `${r.item.id}:${FULL_DAY}`, itemId: r.item.id, key: FULL_DAY, child, session, label: "Full day instead of a half day", time: "until the session ends", priceCents: diff });
        continue;
      }
      if (a.perFamily || a.priceCents <= 0 || r.item.addons.includes(a.key)) continue;
      out.push({ value: `${r.item.id}:${a.key}`, itemId: r.item.id, key: a.key, child, session, label: a.label, time: a.time, priceCents: a.priceCents });
    }
  }
  return out;
}

/** Active coupon codes staff can choose from. */
export async function staffCoupons(db: DB) {
  return db
    .select()
    .from(discounts)
    .where(and(isNotNull(discounts.code), eq(discounts.active, true)))
    .orderBy(discounts.code);
}

/** A code chosen by staff: it must exist and be active, but staff may use it beyond its once-per-family or first-booking limits. */
async function staffCoupon(db: DB, code: string): Promise<Coupon> {
  const [d] = await db.select().from(discounts).where(eq(discounts.code, normalizeCode(code)));
  if (!d || !d.active) throw new OpsError("coupon", "That coupon code isn’t active.");
  return d;
}

const couponLabel = (d: Coupon) => `Coupon ${d.code} (${d.kind === "percent" ? `${d.value}% off` : "discount"})`;

/** The booking's own invoice (its first one that isn't void), creating one if it has none. */
async function bookingInvoice(db: DB, actor: Actor, b: typeof bookings.$inferSelect) {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.bookingId, b.id), ne(invoices.status, "void")))
    .orderBy(invoices.issuedAt)
    .limit(1);
  return inv ?? createInvoice(db, actor, { familyId: b.familyId, bookingId: b.id, description: `Booking ${b.reference}`, lines: [] });
}

async function addLines(db: DB, actor: Actor, invoiceId: string, lines: LineInput[]) {
  const taxPercent = await getPolicy(db, "billing.taxPercent");
  const all = [...lines];
  if (taxPercent > 0) {
    const taxable = lines.reduce((s, l) => s + (l.quantity ?? 1) * l.unitCents, 0);
    if (taxable > 0) all.push({ kind: "tax", description: `Tax (${taxPercent}%)`, unitCents: Math.round((taxable * taxPercent) / 100) });
  }
  if (all.length)
    await db.insert(invoiceLines).values(
      all.map((l) => ({ invoiceId, kind: l.kind, description: l.description, quantity: l.quantity ?? 1, unitCents: l.unitCents, amountCents: (l.quantity ?? 1) * l.unitCents, bookingItemId: l.bookingItemId ?? null, createdBy: actor.name })),
    );
}

export async function extendCare(
  db: DB,
  actor: Actor,
  input: { bookingId: string; picks: string[]; coupon?: "booking" | "none" | string; send: "wallet" | "link" | "account"; baseUrl: string; idempotencyKey?: string },
) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
  if (!b) throw new OpsError("not_found", "Booking not found.");
  if (b.status !== "confirmed") throw new OpsError("invalid", "Only a confirmed booking can be extended.");
  const options = await extensionOptions(db, b.id);
  const chosen = [...new Set(input.picks)].map((v) => options.find((o) => o.value === v)).filter((o): o is ExtensionOption => !!o);
  if (!chosen.length) throw new OpsError("invalid", "Choose what to add for each child.");
  const rows = await bookingRows(db, b.id);
  const rowFor = (itemId: string) => rows.find((r) => r.item.id === itemId)!;

  // The coupon, if any: the booking's own code, another active code staff chose, or none.
  let d: Coupon | null = null;
  if (input.coupon === "booking") {
    if (b.discountId) [d] = await db.select().from(discounts).where(eq(discounts.id, b.discountId));
  } else if (input.coupon && input.coupon !== "none") d = await staffCoupon(db, input.coupon);

  const lines: LineInput[] = chosen.map((o) => ({
    kind: "charge",
    description: `${o.key === FULL_DAY ? "Extended to a full day" : `${o.label} (${o.time})`} · ${o.session} · ${o.child}`,
    unitCents: o.priceCents,
    bookingItemId: o.itemId,
  }));
  if (d) {
    const covered = couponPrograms(d);
    const eligible = new Set(chosen.filter((o) => !covered || covered.includes(rowFor(o.itemId).program.id)).map((o) => o.itemId));
    const line = couponLine(d, lines, eligible);
    if (!line && input.coupon !== "booking") throw new OpsError("coupon", `${d.code} doesn’t cover these programs.`);
    if (line) lines.push({ ...line, description: `${couponLabel(d)} · extended care` });
  }

  const inv = await bookingInvoice(db, actor, b);
  await addLines(db, actor, inv.id, lines);
  for (const o of chosen) {
    const r = rowFor(o.itemId);
    if (o.key === FULL_DAY) {
      const half = addonsFor(r.program.kind, r.program.slug).find((a) => a.dayLength === "half")!.key;
      await db.update(bookingItems).set({ addons: r.item.addons.filter((k) => k !== half), priceCents: (r.item.priceCents ?? 0) + o.priceCents }).where(eq(bookingItems.id, r.item.id));
    } else {
      const [fresh] = await db.select().from(bookingItems).where(eq(bookingItems.id, r.item.id));
      if (!fresh.addons.includes(o.key)) await db.update(bookingItems).set({ addons: [...fresh.addons, o.key] }).where(eq(bookingItems.id, r.item.id));
      await db.insert(bookingExtras).values({ bookingItemId: r.item.id, addonKey: o.key, priceCents: o.priceCents, invoiceId: inv.id, status: "added", addedAt: new Date() });
    }
  }
  await refreshInvoiceStatus(db, inv.id);
  // Paid from the Yalla Wallet: up to what this extension costs (after any coupon), never the card.
  let walletCents = 0;
  if (input.send === "wallet") {
    const extension = lines.reduce((s, l) => s + (l.quantity ?? 1) * l.unitCents, 0);
    walletCents = await payInvoiceFromWallet(db, actor, { invoiceId: inv.id, idempotencyKey: `extend:${b.id}:${input.idempotencyKey ?? chosen.map((o) => o.value).sort().join(",")}`, maxCents: extension });
  }
  const t = (await invoiceTotals(db, [inv.id])).get(inv.id)!;
  const summary = chosen.map((o) => `${o.child}: ${o.key === FULL_DAY ? "full day" : o.label.toLowerCase()}`).join(", ");
  await db.insert(bookingEvents).values({ bookingId: b.id, actorName: actor.name, type: "extended", detail: { added: chosen.map((o) => ({ itemId: o.itemId, key: o.key, priceCents: o.priceCents })), coupon: d?.code ?? null } });
  await audit(db, actor, { action: "booking.extended", entityType: "booking", entityId: b.id, summary: `Extended care on ${b.reference} (${summary})${d ? ` with ${d.code}` : ""}; added to invoice ${inv.number}` });

  let linkSent = false;
  if (input.send === "link" && t.balance > 0) {
    await sendInvoicePaymentLink(db, actor, inv.id, input.baseUrl);
    linkSent = true;
  }
  return { invoice: inv, added: chosen.length, balanceCents: t.balance, linkSent, walletCents, coupon: d?.code ?? null };
}

/**
 * A code the family should have had (they forgot to enter it, or Yalla offered it afterwards), applied to
 * the whole booking on its invoice. A booking keeps one coupon. If they've already paid, the invoice shows
 * the overpayment for a refund or credit from Billing.
 */
export async function applyCouponToBooking(db: DB, actor: Actor, input: { bookingId: string; code: string }) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
  if (!b) throw new OpsError("not_found", "Booking not found.");
  if (b.status !== "confirmed") throw new OpsError("invalid", "Only a confirmed booking can be discounted.");
  const d = await staffCoupon(db, input.code);
  const inv = await bookingInvoice(db, actor, b);
  const existing = await db.select().from(invoiceLines).where(and(eq(invoiceLines.invoiceId, inv.id), eq(invoiceLines.kind, "discount")));
  const had = existing.find((l) => l.description.startsWith("Coupon "));
  if (b.discountId || had) throw new OpsError("invalid", `This booking already has a coupon${had ? ` (${had.description.split(" ")[1]})` : ""}. A booking keeps one coupon.`);
  const rows = await bookingRows(db, b.id);
  const covered = couponPrograms(d);
  const eligible = new Set(rows.filter((r) => !covered || covered.includes(r.program.id)).map((r) => r.item.id));
  const charges = await db.select().from(invoiceLines).where(and(eq(invoiceLines.invoiceId, inv.id), inArray(invoiceLines.kind, ["charge", "discount"])));
  const line = couponLine(
    d,
    charges.map((l) => ({ kind: l.kind as LineInput["kind"], description: l.description, quantity: 1, unitCents: l.amountCents, bookingItemId: l.bookingItemId })),
    eligible,
  );
  if (!line) throw new OpsError("coupon", `${d.code} doesn’t cover anything on this booking.`);
  await addLines(db, actor, inv.id, [line]);
  await db.update(bookings).set({ discountId: d.id }).where(eq(bookings.id, b.id));
  await refreshInvoiceStatus(db, inv.id);
  const t = (await invoiceTotals(db, [inv.id])).get(inv.id)!;
  await audit(db, actor, { action: "booking.coupon_applied", entityType: "booking", entityId: b.id, summary: `Applied ${d.code} to ${b.reference}: ${usd(-line.unitCents)} off (invoice ${inv.number})` });
  return { code: d.code!, offCents: -line.unitCents, balanceCents: t.balance, invoice: inv };
}

/** The booking's coupon, for the form's default. */
export async function bookingCoupon(db: DB, bookingId: string) {
  const [r] = await db.select({ d: discounts }).from(bookings).innerJoin(discounts, eq(discounts.id, bookings.discountId)).where(eq(bookings.id, bookingId)).orderBy(desc(bookings.createdAt));
  return r?.d ?? null;
}
