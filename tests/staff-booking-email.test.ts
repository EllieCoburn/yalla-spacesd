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
    expect(body).toContain(`${f.guardian.firstName} ${f.guardian.lastName} booked Camp Yalla · 18 months – 4 years on`);
    expect(body).toContain(`Jane ${f.children[0].lastName}, born December 12, 2023 (`);
    expect(body).toMatch(new RegExp(`Max ${f.children[1].lastName}, born June 1, 2025 \\(\\d+ months old\\)`));
    expect(body).toContain("You now have 6 spots left in that age group");
    expect(body).toContain("Booked by the team in Admin.");
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
    expect(m.body).toContain("That age group is now full for");
  });
});

describe("Team cancellation email", () => {
  it("a family cancelling a paid day in the portal: what was returned and spots now open", async () => {
    await setPolicy(db(), owner, "notifications.staffEmails", "hello@yalla.test");
    const p = await program({ name: "Camp Yalla", priceCents: 16000 });
    const sess = await session(p.id, { capacity: 8, title: "Camp Yalla · 4 – 6 years" });
    const r = await submitPublicBooking(db(), {
      guardian: { firstName: "John", lastName: "Doe", email: "john.doe@example.com" },
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
    expect(m.body).toContain("John Doe cancelled: Camp Yalla · 4 – 6 years on");
    expect(m.body).toContain("for Jane Doe.");
    expect(m.body).toContain("We returned $" + (out.credited / 100).toFixed(2) + " to their Yalla Wallet.");
    expect(m.body).toContain("You now have 8 spots in Camp Yalla · 4 – 6 years on");
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
    expect(m.body).toContain("Test Owner (Team Yalla) cancelled");
    expect(m.body).toContain("No credit was given (chosen when cancelling).");
    expect(m.body).toContain("You now have 4 spots in");
  });
});
