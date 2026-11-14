/** Website messages: saved to the Inbox, emailed to the team, confirmed to the family. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { submitEnquiry } from "@/lib/ops/enquiries";
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
    });
    expect(e).toMatchObject({ kind: "tour", email: "sam@example.com", status: "new" });
    expect(e.details).toEqual([{ label: "Child’s age or due date", value: "14 months" }]);
    const sent = await db().select().from(s.messages).where(eq(s.messages.relatedId, e.id));
    expect(sent.filter((m) => m.templateKey === "staff_new_enquiry").map((m) => m.toAddress).sort()).toEqual(["director@yalla.test", "hello@yalla.test"]);
    expect(sent.find((m) => m.templateKey === "enquiry_received")?.toAddress).toBe("sam@example.com");
    expect(sent.find((m) => m.templateKey === "staff_new_enquiry")?.body).toContain("14 months");
  });

  it("asks for a valid email and limits repeated submissions", async () => {
    await expect(submitEnquiry(db(), { kind: "event", name: "X", email: "not-an-email", details: [], baseUrl: "http://test" })).rejects.toThrow(/email/);
    for (let i = 0; i < 8; i++) await submitEnquiry(db(), { kind: "event", name: "Repeat", email: "r@example.com", details: [], baseUrl: "http://test", ip: "1.2.3.4" });
    await expect(submitEnquiry(db(), { kind: "event", name: "Repeat", email: "r@example.com", details: [], baseUrl: "http://test", ip: "1.2.3.4" })).rejects.toThrow(/several messages/);
  });
});
