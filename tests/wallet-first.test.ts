/** Yalla Wallet first: any invoice is paid from the family's wallet automatically; only what's left goes to a card. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { createInvoice, invoiceTotals, sendInvoicePaymentLink } from "@/lib/ops/billing";
import { issueCredit, walletSummary } from "@/lib/playpass/wallet";
import { db, family, owner, reset } from "./helpers";

beforeEach(reset);

const credit = (familyId: string, cents: number) => issueCredit(db(), { familyId, amountCents: cents, sourceRef: `t:${Math.random()}`, note: "x", createdBy: "test" });
const charge = (familyId: string, cents: number, extra: Partial<Parameters<typeof createInvoice>[2]> = {}) =>
  createInvoice(db(), owner, { familyId, description: "Test", lines: [{ kind: "charge", description: "Something", unitCents: cents }], ...extra });

describe("Wallet first", () => {
  it("a new invoice is paid from the wallet straight away when it covers it", async () => {
    const f = await family("Wf");
    await credit(f.family.id, 5000);
    const inv = await charge(f.family.id, 3000);
    const t = (await invoiceTotals(db(), [inv.id])).get(inv.id)!;
    expect(t).toMatchObject({ balance: 0, walletApplied: 3000 });
    expect((await db().select().from(s.invoices).where(eq(s.invoices.id, inv.id)))[0].status).toBe("paid");
    expect((await walletSummary(db(), f.family.id)).availableCents).toBe(2000);
  });

  it("when it doesn't cover it, the wallet pays what it can and the card link is only for the rest", async () => {
    const f = await family("Part");
    await credit(f.family.id, 1000);
    const inv = await charge(f.family.id, 6000);
    expect((await invoiceTotals(db(), [inv.id])).get(inv.id)!.balance).toBe(5000);
    const r = await sendInvoicePaymentLink(db(), owner, inv.id, "http://test");
    expect(r.paidInFull).toBe(false);
    const [card] = await db().select().from(s.payments).where(and(eq(s.payments.invoiceId, inv.id), eq(s.payments.method, "card")));
    expect(card.amountCents).toBe(5000);
  });

  it("credit added after an invoice is used when the payment link is sent: no card if it covers it", async () => {
    const f = await family("Later");
    const inv = await charge(f.family.id, 4000);
    await credit(f.family.id, 4000);
    const r = await sendInvoicePaymentLink(db(), owner, inv.id, "http://test");
    expect(r).toMatchObject({ paidInFull: true, walletCents: 4000 });
    expect(await db().select().from(s.payments).where(and(eq(s.payments.invoiceId, inv.id), eq(s.payments.method, "card")))).toHaveLength(0);
  });

  it("Club Yalla dues (membership invoices) never use the wallet", async () => {
    const f = await family("Club");
    await credit(f.family.id, 9000);
    const [prog] = await db().insert(s.programs).values({ slug: `club-${Math.random()}`, name: "Club Yalla", kind: "membership", status: "published" }).returning();
    const [coh] = await db().insert(s.cohorts).values({ name: "Wildflowers", slug: `w-${Math.random()}` } as typeof s.cohorts.$inferInsert).returning();
    const [m] = await db()
      .insert(s.memberships)
      .values({ familyId: f.family.id, childId: f.children[0].id, programId: prog.id, cohortId: coh.id, weekdays: [1], startsOn: "2026-01-01", priceCents: 9000 })
      .returning();
    const inv = await charge(f.family.id, 9000, { membershipId: m.id });
    expect((await invoiceTotals(db(), [inv.id])).get(inv.id)!.balance).toBe(9000);
    expect((await walletSummary(db(), f.family.id)).availableCents).toBe(9000);
  });

  it("an approved late fee comes out of the wallet first", async () => {
    // (Late fees are only ever charged when an admin approves them; see late-fees.test.ts.)
    const f = await family("Late");
    await credit(f.family.id, 2500);
    const inv = await charge(f.family.id, 2000);
    expect((await invoiceTotals(db(), [inv.id])).get(inv.id)!.balance).toBe(0);
  });
});
