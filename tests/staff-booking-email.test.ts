/** The team gets an email for every confirmed booking: who, what, for whom, and spots left. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { setPolicy } from "@/lib/ops/settings";
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
