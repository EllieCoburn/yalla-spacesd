/** "$X was added to your Yalla Wallet": one email per credit transaction, with the reason exactly as written. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { createHold, startCheckout } from "@/lib/ops/bookings";
import { familyCancelItem } from "@/lib/ops/public-booking";
import { giveWalletCredit, sendWalletCreditEmails, MAX_ATTEMPTS } from "@/lib/ops/wallet-credit-email";
import { emailHtml, plainText } from "@/lib/notify/html";
import { adjustWallet, issueCredit, walletSummary } from "@/lib/playpass/wallet";
import { processEvent } from "@/lib/payments/webhooks";
import { resolveOffer, staffCancelBooking } from "@/lib/ops/yalla-cancellations";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const BASE = "https://yalla.test";
const REASON =
  "With your usual 15% code and this $112 wallet credit, the two $160 sessions come to $160 total ($80 per child). That’s 50% off the session fees. Your November 25, 2026 booking also included extended care, which I discounted by 15%, so the overall discount for the booking will be slightly different.";

const emails = (familyId?: string) =>
  db()
    .select()
    .from(s.messages)
    .where(familyId ? and(eq(s.messages.templateKey, "wallet_credit"), eq(s.messages.familyId, familyId)) : eq(s.messages.templateKey, "wallet_credit"));

async function familyWithTwoParents() {
  const f = await family("Rivera");
  // A second parent: only the primary account email gets the wallet email.
  await db().insert(s.guardians).values({ familyId: f.family.id, firstName: "Sam", lastName: "Rivera", email: "sam.rivera@example.com", portalAccess: true });
  return f;
}

describe("Wallet credit email", () => {
  it("a staff credit of $112: the amount, the reason word for word, and the new balance, to the primary email only", async () => {
    const f = await familyWithTwoParents();
    // They already had $20 of credit, so the new balance is $132.
    await issueCredit(db(), { familyId: f.family.id, amountCents: 2000, sourceRef: "earlier", note: "Earlier", createdBy: "test" });
    await giveWalletCredit(db(), owner, { familyId: f.family.id, amountCents: 11200, reason: REASON, idempotencyKey: "form-1" });
    expect((await walletSummary(db(), f.family.id)).availableCents).toBe(13200);

    expect(await sendWalletCreditEmails(db(), { baseUrl: BASE })).toBe(1);
    const [m] = await emails();
    expect(m.toAddress).toBe(f.guardian.email);
    expect(m.subject).toBe("$112.00 was added to your Yalla Wallet");
    expect(m.body).toContain(`Hi ${f.guardian.firstName},`);
    expect(m.body).toContain("We added $112.00 to your Yalla Wallet. It’s available to use at checkout the next time you book.");
    expect(m.body).toContain("**Your available wallet balance** · $132.00");
    expect(m.body).toContain(`${BASE}/portal/wallet`);
    // The reason, exactly as written, in both the text and designed versions.
    expect(plainText(m.body)).toContain(REASON);
    const html = emailHtml({ key: "wallet_credit", subject: m.subject, body: m.body, audience: "family" });
    expect(html).toContain("With your usual 15% code and this $112 wallet credit, the two $160 sessions come to $160 total ($80 per child). That’s 50% off the session fees.");
    expect(html).toContain("Your November 25, 2026 booking also included extended care, which I discounted by 15%");
    expect(html).toContain("View your Yalla Wallet");
    if (process.env.WALLET_EMAIL_OUT) (await import("node:fs")).writeFileSync(process.env.WALLET_EMAIL_OUT, html);
  });

  it("keeps line breaks and typed characters, without turning them into formatting", async () => {
    const f = await family("Chen");
    const reason = "Thank you for helping on Saturday!\n- Snack: $12.50\n**Paint:** $8\n\nSee you December 3, 2026.";
    await giveWalletCredit(db(), owner, { familyId: f.family.id, amountCents: 2050, reason, idempotencyKey: "k" });
    await sendWalletCreditEmails(db(), { baseUrl: BASE });
    const [m] = await emails();
    expect(plainText(m.body)).toContain(reason);
    const html = emailHtml({ key: "wallet_credit", subject: m.subject, body: m.body, audience: "family" });
    expect(html).toContain("Thank you for helping on Saturday!<br>- Snack: $12.50<br>**Paint:** $8");
    expect(html).toContain("See you December 3, 2026.");
    expect(html).not.toContain("<strong style=\"font-weight:500;\">Paint:</strong>");
  });

  it("a retried request (same form submission) adds no credit and sends no second email", async () => {
    const f = await family("Retry");
    await giveWalletCredit(db(), owner, { familyId: f.family.id, amountCents: 5000, reason: "Thanks!", idempotencyKey: "same" });
    await sendWalletCreditEmails(db(), { baseUrl: BASE });
    await giveWalletCredit(db(), owner, { familyId: f.family.id, amountCents: 5000, reason: "Thanks!", idempotencyKey: "same" });
    expect(await sendWalletCreditEmails(db(), { baseUrl: BASE })).toBe(0);
    expect((await walletSummary(db(), f.family.id)).availableCents).toBe(5000);
    expect(await emails()).toHaveLength(1);
    // Two runs at once can't both send it either.
    await giveWalletCredit(db(), owner, { familyId: f.family.id, amountCents: 100, reason: "Again", idempotencyKey: "other" });
    const [a, b] = await Promise.all([sendWalletCreditEmails(db(), { baseUrl: BASE }), sendWalletCreditEmails(db(), { baseUrl: BASE })]);
    expect(a + b).toBe(1);
    expect(await emails()).toHaveLength(2);
  });

  it("requires a reason for staff credits", async () => {
    const f = await family("NoReason");
    await expect(giveWalletCredit(db(), owner, { familyId: f.family.id, amountCents: 1000, reason: "   ", idempotencyKey: "x" })).rejects.toThrow(/reason shared with the family/);
    expect((await walletSummary(db(), f.family.id)).availableCents).toBe(0);
  });

  it("if sending fails, the credit stays and it's retried on the next run", async () => {
    const [fam] = await db().insert(s.families).values({ name: "Nobody family" }).returning();
    await giveWalletCredit(db(), owner, { familyId: fam.id, amountCents: 3000, reason: "Thank you", idempotencyKey: "f" });
    expect(await sendWalletCreditEmails(db(), { baseUrl: BASE })).toBe(0);
    const [n] = await db().select().from(s.walletCreditNotices);
    expect(n).toMatchObject({ sentAt: null, attempts: 1 });
    expect(n.lastError).toMatch(/guardian/i);
    expect((await walletSummary(db(), fam.id)).availableCents).toBe(3000);
    await db().insert(s.guardians).values({ familyId: fam.id, firstName: "Lee", lastName: "Nobody", email: "lee@example.com", isPrimary: true, portalAccess: true });
    expect(await sendWalletCreditEmails(db(), { baseUrl: BASE })).toBe(1);
    expect(MAX_ATTEMPTS).toBeGreaterThan(1);
  });

  it("positive balance adjustments email the family; removals don't", async () => {
    const f = await family("Adjust");
    await adjustWallet(db(), owner, { familyId: f.family.id, amountCents: 1500, note: "Correction for last month", idempotencyKey: "a1" });
    await adjustWallet(db(), owner, { familyId: f.family.id, amountCents: -500, note: "Oops", idempotencyKey: "a2" });
    await sendWalletCreditEmails(db(), { baseUrl: BASE });
    const list = await emails();
    expect(list).toHaveLength(1);
    expect(list[0].subject).toBe("$15.00 was added to your Yalla Wallet");
    expect(plainText(list[0].body)).toContain("Correction for last month");
  });
});

describe("Credits issued automatically", () => {
  async function paidCamp(daysAhead = 5) {
    const camp = await program({ kind: "camp", slug: `camp-${Math.random().toString(36).slice(2, 7)}`, name: "Camp Yalla", priceCents: 16000 });
    const sess = await session(camp.id, { capacity: 6 }, daysAhead, "09:00", "15:00");
    const f = await family("Auto");
    const hold = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: sess.id, childId: f.children[0].id }], source: "public", acknowledgePaperwork: true });
    await startCheckout(db(), owner, hold.booking.id, { base: "http://test" });
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, hold.booking.id));
    const [card] = await db().select().from(s.payments).where(and(eq(s.payments.invoiceId, inv.id), eq(s.payments.method, "card")));
    await processEvent(db(), "test", { id: `evt_${Math.random()}`, type: "payment.succeeded", checkoutRef: card.checkoutRef!, providerRef: "tpi", amountCents: card.amountCents });
    const [item] = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, hold.booking.id));
    const g = { guardianId: f.guardian.id, familyId: f.family.id, familyName: "Auto family", firstName: f.guardian.firstName, lastName: f.guardian.lastName, email: f.guardian.email, canBook: true, canViewBilling: true, canViewSensitive: true, emailVerified: true, hasPassword: true, sessionId: "s" };
    return { f, sess, booking: hold.booking, item, g };
  }

  it("a family's own cancellation 24+ hours ahead: one email with a family-friendly reason", async () => {
    const { f, item, g, sess } = await paidCamp();
    await familyCancelItem(db(), g, item.id);
    await sendWalletCreditEmails(db(), { baseUrl: BASE });
    const list = await emails(f.family.id);
    expect(list).toHaveLength(1);
    expect(list[0].subject).toBe("$160.00 was added to your Yalla Wallet");
    expect(plainText(list[0].body)).toMatch(new RegExp(`You cancelled Camp Yalla on \\w+, \\w+ \\d+ for ${f.children[0].firstName} at least 24 hours before it began, so what you paid for it was returned to your Yalla Wallet\\.`));
    void sess;
  });

  it("Yalla cancels and the family takes credit: one email for the credit and the thank-you together", async () => {
    const { f, booking } = await paidCamp();
    await staffCancelBooking(db(), owner, { bookingId: booking.id, reason: "A burst pipe in the play garden", notify: false, mode: "yalla" });
    const [offer] = await db().select().from(s.cancellationOffers).where(eq(s.cancellationOffers.familyId, f.family.id));
    await resolveOffer(db(), owner, { offerId: offer.id, choice: "credit" });
    await resolveOffer(db(), owner, { offerId: offer.id, choice: "credit" }); // a double tap
    await sendWalletCreditEmails(db(), { baseUrl: BASE });
    const list = await emails(f.family.id);
    expect(list).toHaveLength(1);
    expect(list[0].subject).toBe("$168.00 was added to your Yalla Wallet");
    const text = plainText(list[0].body);
    expect(text).toContain("You chose Yalla Wallet credit, so we returned the $160 you paid and added $8 (5%) as a thank-you for your flexibility.");
    expect(text).toContain("Why it was cancelled: A burst pipe in the play garden");
    expect(text).not.toContain("YL-");
  });

  it("staff cancel for a family 24+ hours ahead: the email doesn't show the internal note", async () => {
    const { f, booking } = await paidCamp();
    await staffCancelBooking(db(), owner, { bookingId: booking.id, reason: "Mom called, kid has a cold (internal)", notify: false, mode: "family_policy" });
    await sendWalletCreditEmails(db(), { baseUrl: BASE });
    const [m] = await emails(f.family.id);
    expect(plainText(m.body)).toMatch(/Your booking for Camp Yalla on \w+, \w+ \d+ was cancelled at least 24 hours before it began/);
    expect(m.body).not.toContain("internal");
  });
});

describe("Credits added before the email existed", () => {
  it("are listed as not emailed, staff can send the email once, then they're not listed", async () => {
    const { creditsWithoutEmail, emailForCredit } = await import("@/lib/ops/wallet-credit-email");
    const { walletActivity } = await import("@/lib/playpass/wallet");
    const f = await family("Kim");
    // A credit with no email recorded (as before this feature).
    await issueCredit(db(), { familyId: f.family.id, amountCents: 11200, sourceRef: "courtesy:old", note: REASON, createdBy: "Owner" });
    const log = await walletActivity(db(), f.family.id);
    const missing = await creditsWithoutEmail(db(), f.family.id, log);
    expect(missing.size).toBe(1);
    const [entryId] = [...missing];
    await emailForCredit(db(), { familyId: f.family.id, entryId, reason: REASON });
    expect(await sendWalletCreditEmails(db(), { baseUrl: BASE })).toBe(1);
    const [m] = await emails(f.family.id);
    expect(m.subject).toBe("$112.00 was added to your Yalla Wallet");
    expect(plainText(m.body)).toContain(REASON);
    expect(plainText(m.body)).toContain("Your available wallet balance · $112.00");
    await expect(emailForCredit(db(), { familyId: f.family.id, entryId, reason: REASON })).rejects.toThrow(/already sent/);
    expect((await creditsWithoutEmail(db(), f.family.id, log)).size).toBe(0);
  });
});
