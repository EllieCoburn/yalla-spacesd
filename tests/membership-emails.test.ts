/** Membership matters go to the membership inbox (membership@yallaspacesd.com by default). */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { notifyFamily } from "@/lib/notify";
import { submitEnquiry } from "@/lib/ops/enquiries";
import { db, family, reset } from "./helpers";

beforeEach(reset);

const staffNotices = async () => (await db().select().from(s.messages).where(eq(s.messages.relatedType, "staff"))).map((m) => ({ key: m.templateKey, to: m.toAddress, subject: m.subject, body: m.body }));

describe("Membership emails", () => {
  it("send Club Yalla applications to membership@ and everything else to hello@", async () => {
    await submitEnquiry(db(), { kind: "application", name: "Avery Applicant", email: "avery@example.com", details: [{ label: "Child", value: "June" }], baseUrl: "http://t" });
    await submitEnquiry(db(), { kind: "tour", name: "Toby Tour", email: "toby@example.com", details: [], baseUrl: "http://t" });
    const notices = (await staffNotices()).filter((n) => n.key === "staff_new_enquiry");
    expect(notices.find((n) => n.body.includes("Avery"))?.to).toBe("membership@yallaspacesd.com");
    expect(notices.find((n) => n.body.includes("Toby"))?.to).toBe("hello@yallaspacesd.com");
  });

  it("tell the membership team about Play Pass sign-ups, changes and failed payments, but not routine renewals", async () => {
    const f = await family("Member");
    await notifyFamily(db(), { key: "playpass_welcome", familyId: f.family.id, vars: { plan: "Play Pass Plus", amount: "$100" } });
    await notifyFamily(db(), { key: "playpass_change", familyId: f.family.id, vars: { change_summary: "Your Play Pass won’t renew." } });
    await notifyFamily(db(), { key: "playpass_payment_failed", familyId: f.family.id, vars: { amount: "$100", reason: "Card declined" } });
    await notifyFamily(db(), { key: "playpass_renewal", familyId: f.family.id, vars: { plan: "Play Pass Plus" } });
    const notices = (await staffNotices()).filter((n) => n.key === "staff_membership_update");
    expect(notices.map((n) => n.subject)).toEqual([
      expect.stringMatching(/^Play Pass: New member · /),
      expect.stringMatching(/^Play Pass: Membership change · /),
      expect.stringMatching(/^Play Pass: Payment didn’t go through · /),
    ]);
    expect(notices.every((n) => n.to === "membership@yallaspacesd.com")).toBe(true);
    expect(notices[1].body).toContain("Your Play Pass won’t renew.");
  });
});
