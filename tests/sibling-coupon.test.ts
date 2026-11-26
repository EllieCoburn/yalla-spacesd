/** Two children on the same camp days: the sibling discount, and a coupon code on top of it. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { invoiceTotals } from "@/lib/ops/billing";
import { submitPublicBooking } from "@/lib/ops/public-booking";
import { db, program, reset, session } from "./helpers";

beforeEach(reset);

describe("Sibling discount with a coupon code", () => {
  it("3 camp days for 2 children: 10% off the second child each day, then the code comes off what's left", async () => {
    const camp = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const days = [];
    for (const n of [5, 6, 7]) days.push(await session(camp.id, { capacity: 8, priceCents: 16000 }, n, "09:00", "15:00"));
    await db().insert(s.discounts).values({ code: "FRIENDSOFYALLA", name: "Friends", kind: "percent", value: 15, programId: camp.id });
    const res = await submitPublicBooking(db(), {
      guardian: { firstName: "Jordan", lastName: "Rivera", email: "jordan.sib@example.com", phone: "619-555-0100" },
      children: [
        { key: "a", firstName: "Ava", lastName: "Rivera", birthDate: "2021-06-05", allergies: "", medications: "" },
        { key: "l", firstName: "Leo", lastName: "Rivera", birthDate: "2020-05-01", allergies: "", medications: "" },
      ],
      lines: days.map((d) => ({ sessionId: d.id, childKeys: ["a", "l"] })),
      signatures: [],
      meta: {},
      baseUrl: "http://test",
      couponCode: "friendsofyalla",
    });
    expect(res.ok).toBe(true);
    const [g] = await db().select().from(s.guardians).where(eq(s.guardians.email, "jordan.sib@example.com"));
    const [b] = await db().select().from(s.bookings).where(eq(s.bookings.familyId, g.familyId));
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, b.id));
    const lines = await db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, inv.id));
    const sibling = lines.filter((l) => l.description.startsWith("Sibling discount"));
    expect(sibling).toHaveLength(3);
    expect(sibling.reduce((t, l) => t + l.amountCents, 0)).toBe(-4800);
    const coupon = lines.find((l) => l.description.startsWith("Coupon FRIENDSOFYALLA"));
    // 15% of ($960 − $48) = $136.80
    expect(coupon?.amountCents).toBe(-13680);
    expect((await invoiceTotals(db(), [inv.id])).get(inv.id)!.total).toBe(96000 - 4800 - 13680);
  });
});
