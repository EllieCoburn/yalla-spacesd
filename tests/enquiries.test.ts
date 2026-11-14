/** Website messages: saved to the Inbox, emailed to the team, confirmed to the family. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { submitEnquiry } from "@/lib/ops/enquiries";
import { bodyHtml, emailHtml, plainText } from "@/lib/notify/html";
import { setPolicy } from "@/lib/ops/settings";
import { db, owner, reset } from "./helpers";

beforeEach(reset);

describe("Website messages", () => {
  it("saves a tour request and emails every team address plus the family", async () => {
    await setPolicy(db(), owner, "notifications.staffEmails", "hello@yalla.test, director@yalla.test");
    const e = await submitEnquiry(db(), {
      kind: "tour",
      name: "Sam Visitor",
      email: "Sam@Example.com",
      phone: "619 555 0100",
      details: [
        { label: "Child’s age or due date", value: "14 months" },
        { label: "Message", value: "" },
      ],
      baseUrl: "http://test",
      vars: { interests: "Club Yalla", explore: "While you wait:\n\n• [A day at Club Yalla](http://test/club-yalla)" },
    });
    expect(e).toMatchObject({ kind: "tour", email: "sam@example.com", status: "new" });
    expect(e.details).toEqual([{ label: "Child’s age or due date", value: "14 months" }]);
    const sent = await db().select().from(s.messages).where(eq(s.messages.relatedId, e.id));
    expect(sent.filter((m) => m.templateKey === "staff_new_enquiry").map((m) => m.toAddress).sort()).toEqual(["director@yalla.test", "hello@yalla.test"]);
    const confirm = sent.find((m) => m.templateKey === "tour_received");
    expect(confirm?.toAddress).toBe("sam@example.com");
    expect(confirm?.subject).toBe("Thank you for your tour request");
    expect(confirm?.body).toContain("[A day at Club Yalla](http://test/club-yalla)");
    expect(sent.find((m) => m.templateKey === "staff_new_enquiry")?.body).toContain("14 months");
  });

  it("asks for a valid email and limits repeated submissions", async () => {
    await expect(submitEnquiry(db(), { kind: "event", name: "X", email: "not-an-email", details: [], baseUrl: "http://test" })).rejects.toThrow(/email/);
    for (let i = 0; i < 8; i++) await submitEnquiry(db(), { kind: "event", name: "Repeat", email: "r@example.com", details: [], baseUrl: "http://test", ip: "1.2.3.4" });
    await expect(submitEnquiry(db(), { kind: "event", name: "Repeat", email: "r@example.com", details: [], baseUrl: "http://test", ip: "1.2.3.4" })).rejects.toThrow(/several messages/);
  });

  it("turns a plain-text email into the designed version", () => {
    const body = "Hi Sam,\n\nThanks <for> writing.\n\nName: Sam\nEmail: sam@example.com\n\n• [A day at Club Yalla](https://x.test/club-yalla)\n\nSign in here:\nhttps://x.test/portal?t=1\n\nWarmly,\nYalla";
    const inner = bodyHtml(body, "family_sign_in");
    expect(inner).toContain("Hi Sam,");
    expect(inner).toContain("Thanks &lt;for&gt; writing.");
    expect(inner).toContain('href="mailto:sam@example.com"');
    expect(inner).toContain('<a href="https://x.test/club-yalla"');
    expect(inner).toContain("Sign in to the Family Portal");
    expect(inner).toMatch(/italic[^>]*>Team Yalla</);
    const full = emailHtml({ key: "tour_received", subject: "Thank you for your tour request", body, audience: "family" });
    expect(full).toContain("/email/hero-space.jpg");
    expect(full).toContain("408 Nutmeg Street");
    expect(plainText(body)).toContain("A day at Club Yalla: https://x.test/club-yalla");
  });
});
