/** What families see on the Stripe payment page: what they're buying, not just a reference. */
import { beforeEach, describe, expect, it } from "vitest";
import { checkoutLabel, createHold } from "@/lib/ops/bookings";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

describe("Checkout label", () => {
  it("names the program and date, and lists sessions, children and the reference", async () => {
    const p = await program({ kind: "happening", name: "Weekend Play Sessions", priceCents: 6000 });
    const s1 = await session(p.id, { title: "Weekend Play · AM play session" }, 8, "09:00", "12:00");
    const f = await family("Label", [{ first: "Leo", birth: "2023-01-15" }]);
    const hold = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: s1.id, childId: f.children[0].id }], source: "public", acknowledgePaperwork: true });
    const label = await checkoutLabel(db(), hold.booking.id);
    expect(label.name).toMatch(/^Weekend Play · AM play session · \w{3}, \w{3} \d+$/);
    expect(label.details).toContain("(Leo)");
    expect(label.details).toContain(`Reference ${hold.booking.reference}`);
    expect(label.name).not.toContain(hold.booking.reference);
  });

  it("summarizes several sessions", async () => {
    const p = await program({ kind: "drop_in", name: "Yalla Flex", priceCents: 15000 });
    const a = await session(p.id, {}, 8);
    const b = await session(p.id, {}, 9);
    const f = await family("Two");
    const hold = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: a.id, childId: f.children[0].id }, { sessionId: b.id, childId: f.children[0].id }], source: "public", acknowledgePaperwork: true });
    const label = await checkoutLabel(db(), hold.booking.id, { walletCents: 2500 });
    expect(label.name).toBe("Yalla Flex · 2 sessions");
    expect(label.details).toContain("$25.00 applied from your Yalla Wallet");
  });
});
