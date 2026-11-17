/**
 * Adding extras to a day that's already booked, from the Family Portal: a second grown-up coworking
 * on a Flex day, camp Early Bird or late stay, coworking at Immersive Play, and so on.
 *
 * On any day a family has confirmed care (today, until it ends, or later), the extras that program
 * offers are listed. Choosing some creates an invoice and a card checkout; once that payment
 * succeeds the extras join the booking (`applyPaidExtras`, from the payment webhook).
 *
 * Not offered here: day length (half/full), and extras with limited seats (Flex Early Bird), which
 * need a seat check and are chosen when booking.
 */
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB, Executor } from "@/lib/db";
import { bookingExtras, bookingItems, bookings, children, guardians, invoices, payments, programs, sessions } from "@/lib/db/schema";
import { addonsFor, type Addon } from "@/lib/booking/addons";
import { activeProvider } from "@/lib/payments/provider";
import { invoiceStatusPath } from "@/lib/links";
import { ageInMonths, fmtDate, fmtTime } from "@/lib/time";
import { createInvoice, invoiceTotals, usd } from "./billing";

export type ExtraOffer = { key: string; label: string; time: string; priceCents: number; perFamily: boolean; prompt?: string };
export type DayExtras = {
  sessionId: string;
  title: string;
  time: string;
  /** Who's coming, with the extras each already has. */
  children: { itemId: string; name: string; added: string[]; offers: ExtraOffer[] }[];
  /** Once-per-family extras (e.g. a second grown-up coworking). */
  family: { offer: ExtraOffer; itemId: string; added: boolean }[];
};

const offerable = (a: Addon) => !a.dayLength && !a.limitedSeats && a.priceCents > 0;
const toOffer = (a: Addon): ExtraOffer => ({ key: a.key, label: a.label, time: a.time, priceCents: a.priceCents, perFamily: !!a.perFamily, prompt: a.prompt });

/** The family's confirmed care on `date` that hasn't ended, with the extras they can still add. */
export async function extrasForDay(db: Executor, familyId: string, date: string, now = new Date()): Promise<DayExtras[]> {
  const rows = await db
    .select({ item: bookingItems, session: sessions, program: programs, child: children })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .leftJoin(children, eq(children.id, bookingItems.childId))
    .where(and(eq(bookings.familyId, familyId), eq(bookings.status, "confirmed"), eq(bookingItems.status, "confirmed"), eq(sessions.localDate, date), gt(sessions.endsAt, now)))
    .orderBy(asc(sessions.startsAt));
  // Extras already paid for but not yet added count as added (no paying twice).
  const pending = rows.length
    ? await db
        .select()
        .from(bookingExtras)
        .where(and(inArray(bookingExtras.bookingItemId, rows.map((r) => r.item.id)), inArray(bookingExtras.status, ["added"])))
    : [];
  const has = (itemId: string, key: string, addons: string[]) => addons.includes(key) || pending.some((p) => p.bookingItemId === itemId && p.addonKey === key);
  const bySession = new Map<string, typeof rows>();
  for (const r of rows) bySession.set(r.session.id, [...(bySession.get(r.session.id) ?? []), r]);
  return [...bySession.values()].map((group) => {
    const { session: s, program: p } = group[0];
    const all = addonsFor(p.kind, p.slug).filter(offerable);
    const forFamily = all.filter((a) => a.perFamily);
    return {
      sessionId: s.id,
      title: s.title ?? p.name,
      time: `${fmtTime(s.startsAt)} – ${fmtTime(s.endsAt)}`,
      children: group.map((r) => ({
        itemId: r.item.id,
        name: r.child ? r.child.preferredName || r.child.firstName : "Your booking",
        added: r.item.addons,
        offers: all
          .filter((a) => !a.perFamily && !has(r.item.id, a.key, r.item.addons))
          .filter((a) => a.minAgeMonths == null || (r.child && ageInMonths(r.child.birthDate, date) >= a.minAgeMonths))
          .map(toOffer),
      })),
      family: forFamily.map((a) => ({
        offer: toOffer(a),
        itemId: group[0].item.id,
        added: group.some((r) => has(r.item.id, a.key, r.item.addons)),
      })),
    };
  });
}

/** Upcoming days (and today) the family has care, for the portal's "Add extras" links. */
export async function daysWithCare(db: Executor, familyId: string, now = new Date()) {
  const rows = await db
    .selectDistinct({ date: sessions.localDate })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .where(and(eq(bookings.familyId, familyId), eq(bookings.status, "confirmed"), eq(bookingItems.status, "confirmed"), gt(sessions.endsAt, now)))
    .orderBy(asc(sessions.localDate));
  return rows.map((r) => r.date);
}

/**
 * The family chose extras for a day: invoice them and open a card checkout. Each pick is
 * `{ itemId, key }`; per-family extras are charged once per session whichever child carries them.
 */
export async function startExtrasCheckout(db: DB, actor: Actor, input: { familyId: string; date: string; picks: { itemId: string; key: string }[]; baseUrl: string; now?: Date }) {
  const offers = await extrasForDay(db, input.familyId, input.date, input.now);
  const lines: { kind: "charge"; description: string; unitCents: number; bookingItemId: string; key: string }[] = [];
  const seen = new Set<string>();
  for (const pick of input.picks) {
    for (const s of offers) {
      const fam = s.family.find((f) => f.offer.key === pick.key && s.children.some((c) => c.itemId === pick.itemId) && !f.added);
      const child = s.children.find((c) => c.itemId === pick.itemId);
      const per = child?.offers.find((o) => o.key === pick.key);
      const offer = fam?.offer ?? per;
      if (!offer) continue;
      const itemId = fam ? fam.itemId : pick.itemId;
      const k = `${fam ? s.sessionId : itemId}:${offer.key}`;
      if (seen.has(k)) continue;
      seen.add(k);
      lines.push({
        kind: "charge",
        description: `${offer.label} (${offer.time}) · ${s.title} · ${fmtDate(input.date, "EEE d MMM")}${fam ? "" : ` · ${child!.name}`}`,
        unitCents: offer.priceCents,
        bookingItemId: itemId,
        key: offer.key,
      });
    }
  }
  if (!lines.length) throw new OpsError("invalid", "Choose at least one extra to add.");
  const inv = await createInvoice(db, actor, {
    familyId: input.familyId,
    description: `Extras for ${fmtDate(input.date, "EEE d MMM")}`,
    lines: lines.map(({ key: _k, ...l }) => l),
  });
  await db.insert(bookingExtras).values(lines.map((l) => ({ bookingItemId: l.bookingItemId, addonKey: l.key, priceCents: l.unitCents, invoiceId: inv.id })));
  const t = (await invoiceTotals(db, [inv.id])).get(inv.id)!;
  const provider = activeProvider();
  const paymentId = crypto.randomUUID();
  const [g] = await db.select().from(guardians).where(and(eq(guardians.familyId, input.familyId), eq(guardians.isPrimary, true)));
  const checkout = await provider.createCheckout({
    paymentId,
    amountCents: t.balance,
    description: `Yalla extras · ${fmtDate(input.date, "EEE d MMM")}`,
    details: `Invoice ${inv.number}`,
    customerEmail: g?.email,
    successUrl: `${input.baseUrl}${invoiceStatusPath(inv.number)}`,
    cancelUrl: `${input.baseUrl}${invoiceStatusPath(inv.number, { cancelled: "1" })}`,
    expiresAt: new Date(Date.now() + 23 * 3600 * 1000),
    idempotencyKey: `extras:${inv.id}`,
  });
  await db.insert(payments).values({
    id: paymentId,
    invoiceId: inv.id,
    familyId: input.familyId,
    amountCents: t.balance,
    method: "card",
    status: "pending",
    provider: provider.name,
    checkoutRef: checkout.checkoutRef,
    providerRef: provider.name === "stripe" ? checkout.url : null,
    idempotencyKey: `extras:${inv.id}`,
  });
  await audit(db, actor, { action: "booking.extras_checkout", entityType: "invoice", entityId: inv.id, summary: `Extras for ${input.date}: ${lines.map((l) => l.description.split(" · ")[0]).join(", ")} (${usd(t.balance)})` });
  return { invoice: inv, url: provider.name === "test" ? `${input.baseUrl}${checkout.url}` : checkout.url };
}

/** After the extras' invoice is paid, they join the booking (once). */
export async function applyPaidExtras(db: Executor, invoiceId: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv || inv.status !== "paid") return 0;
  const list = await db.select().from(bookingExtras).where(and(eq(bookingExtras.invoiceId, invoiceId), eq(bookingExtras.status, "pending")));
  for (const x of list) {
    const [item] = await db.select().from(bookingItems).where(eq(bookingItems.id, x.bookingItemId));
    if (item && !item.addons.includes(x.addonKey)) await db.update(bookingItems).set({ addons: [...item.addons, x.addonKey] }).where(eq(bookingItems.id, item.id));
    await db.update(bookingExtras).set({ status: "added", addedAt: new Date() }).where(eq(bookingExtras.id, x.id));
  }
  if (list.length) await audit(db, { type: "system", name: "Payment" }, { action: "booking.extras_added", entityType: "invoice", entityId: invoiceId, summary: `Added ${list.length} paid extra${list.length === 1 ? "" : "s"} to the booking` });
  return list.length;
}
