/** The team gets an email for every confirmed booking: who, what, for whom, and spots left. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { setPolicy } from "@/lib/ops/settings";
import { familyCancelItem, submitPublicBooking } from "@/lib/ops/public-booking";
import { staffCancelBooking } from "@/lib/ops/yalla-cancellations";
import { processEvent } from "@/lib/payments/webhooks";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

describe("Team booking email", () => {
  it("names the parent, session, children with birthdays and ages, and spots left", async () => {
    await setPolicy(db(), owner, "notifications.staffEmails", "hello@yalla.test, ops@yalla.test");
    const f = await family("Doe", [
      { first: "Jane", birth: "2023-12-12" },
      { first: "Max", birth: "2025-06-01" },
    ]);
    const p = await program({ name: "Camp Yalla" });
    const sess = await session(p.id, { capacity: 8, title: "Camp Yalla · 18 months – 4 years" });
    const hold = await createHold(db(), owner, { familyId: f.family.id, items: f.children.map((c) => ({ sessionId: sess.id, childId: c.id })), source: "admin", acknowledgePaperwork: true });
    // Even when the family isn't notified, the team is.
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
    const sent = await db().select().from(s.messages).where(eq(s.messages.templateKey, "staff_new_booking"));
    expect(sent.map((m) => m.toAddress).sort()).toEqual(["hello@yalla.test", "ops@yalla.test"]);
    const body = sent[0].body;
    expect(body).toContain(">> Camp Yalla · 18 months – 4 years");
    expect(body).toContain(`Parent: ${f.guardian.firstName} ${f.guardian.lastName}`);
    expect(body).toContain(`Child: Jane ${f.children[0].lastName} · born Dec 12, 2023 · `);
    expect(body).toMatch(new RegExp(`Child: Max ${f.children[1].lastName} · born Jun 1, 2025 · \\d+ months old`));
    expect(body).toContain("!! 6 | spots left in that age group");
    expect(body).toContain("Booked: By the team in Admin");
    expect(sent[0].subject).toMatch(/^New booking: /);
  });

  it("says when the age group is now full", async () => {
    await setPolicy(db(), owner, "notifications.staffEmails", "hello@yalla.test");
    const f = await family("Last");
    const p = await program();
    const sess = await session(p.id, { capacity: 1 });
    const hold = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: sess.id, childId: f.children[0].id }], source: "admin", acknowledgePaperwork: true });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
    const [m] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "staff_new_booking"));
    expect(m.body).toContain("!! Full | That age group is now full for");
  });
});

describe("Team cancellation email", () => {
  it("a family cancelling a paid day in the portal: what was returned and spots now open", async () => {
    await setPolicy(db(), owner, "notifications.staffEmails", "hello@yalla.test");
    const p = await program({ name: "Camp Yalla", priceCents: 16000 });
    const sess = await session(p.id, { capacity: 8, title: "Camp Yalla · 4 – 6 years" });
    const r = await submitPublicBooking(db(), {
      guardian: { firstName: "John", lastName: "Doe", email: "john.doe@example.com", phone: "619-555-0100" },
      children: [{ key: "a", firstName: "Jane", lastName: "Doe", birthDate: "2021-12-12" }],
      lines: [{ sessionId: sess.id, childKeys: ["a"] }],
      signatures: [],
      meta: {},
      baseUrl: "http://test",
    });
    if (!r.ok) throw new Error(r.error);
    const [b] = await db().select().from(s.bookings);
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, b.id));
    const [pay] = await db().select().from(s.payments).where(eq(s.payments.invoiceId, inv.id));
    await processEvent(db(), "test", { id: "evt_x1", type: "payment.succeeded", checkoutRef: pay.checkoutRef!, providerRef: "pi_1", amountCents: pay.amountCents });
    const [g] = await db().select().from(s.guardians);
    const [item] = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, b.id));
    const ctx = { sessionId: "x", guardianId: g.id, familyId: g.familyId, familyName: "", firstName: g.firstName, lastName: g.lastName, email: g.email, canBook: true, canViewBilling: true, canViewSensitive: true, emailVerified: true, hasPassword: false };
    const out = await familyCancelItem(db(), ctx, item.id);
    expect(out.credited).toBeGreaterThan(0);
    const [m] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "staff_booking_cancelled"));
    expect(m.subject).toMatch(/^Cancelled: John Doe · Camp Yalla · 4 – 6 years/);
    expect(m.body).toContain(">> Camp Yalla · 4 – 6 years");
    expect(m.body).toContain("Child: Jane Doe");
    expect(m.body).toContain("Cancelled by: John Doe in the Family Portal");
    expect(m.body).toContain("!! " + "$" + (out.credited / 100).toFixed(2) + " | returned to their Yalla Wallet");
    expect(m.body).toContain("!! 8 | spots now open in that age group");

    // The family's own email: what was cancelled, the money returned, a way to book again and the policy.
    const [fam] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "booking_cancellation"));
    expect(fam.toAddress).toBe("john.doe@example.com");
    expect(fam.body).toContain(">> Camp Yalla · 4 – 6 years");
    expect(fam.body).toContain("!! " + "$" + (out.credited / 100).toFixed(2) + " | has been returned to your Yalla Wallet");
    expect(fam.body).toMatch(/\n\S+\/book\n/);
    expect(fam.body).toMatch(/\[review our cancellation policy\]\(\S+\/policies#cancellation-refund\)/);
    // And the booking confirmation they got earlier used the same layout.
    const [conf] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "booking_confirmation"));
    expect(conf.body).toContain(">> Camp Yalla · 4 – 6 years");
    expect(conf.body).toContain("Paid by card: $");
  });

  it("the team cancelling says who did it and what happened to the money", async () => {
    await setPolicy(db(), owner, "notifications.staffEmails", "hello@yalla.test");
    const f = await family("Doe");
    const p = await program();
    const sess = await session(p.id, { capacity: 4 });
    const hold = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: sess.id, childId: f.children[0].id }], source: "admin", acknowledgePaperwork: true });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
    await staffCancelBooking(db(), owner, { bookingId: hold.booking.id, reason: "Family asked by phone", notify: false, mode: "family_none" });
    const [m] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "staff_booking_cancelled"));
    expect(m.body).toContain("Cancelled by: Test Owner (Team Yalla)");
    expect(m.body).toContain("~~ No credit was given (chosen when cancelling).");
    expect(m.body).toContain("!! 4 | spots now open");
  });
});
