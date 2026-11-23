import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { abandonedCheckouts, cartSummary, cleanCartItems, openCarts, pruneCarts, saveCart } from "@/lib/ops/carts";
import { expireHolds } from "@/lib/ops/bookings";
import { submitPublicBooking, type PublicBookingInput } from "@/lib/ops/public-booking";
import { db, family, program, reset, session } from "./helpers";

beforeEach(reset);

const CART = "cart-0123456789abcdef";

function booking(sessionId: string, email = "robin.new@example.com"): PublicBookingInput {
  return {
    guardian: { firstName: "Robin", lastName: "Newcomer", email, phone: "619-555-0100" },
    children: [{ key: "a", firstName: "Pip", lastName: "Newcomer", birthDate: "2023-02-01", allergies: "", medications: "" }],
    lines: [{ sessionId, childKeys: ["a"] }],
    signatures: [],
    meta: {},
    baseUrl: "http://localhost:3105",
  };
}

describe("carts", () => {
  it("cleans what the browser sends", () => {
    expect(cleanCartItems("nope")).toEqual([]);
    expect(cleanCartItems([{ id: "a", spots: 99, extras: ["early", 5, "x".repeat(50)], label: "<b>ignored</b>" }, { id: "a", spots: 2, extras: [] }, { spots: 1 }])).toEqual([
      { id: "a", spots: 2, extras: [] },
    ]);
    expect(cleanCartItems([{ id: "b", spots: 99, extras: ["early"], flexible: true }])).toEqual([{ id: "b", spots: 20, extras: ["early"], flexible: true }]);
  });

  it("saves, updates and clears a cart, keeping only upcoming sessions", async () => {
    const p = await program({ name: "Camp" });
    const a = await session(p.id, { capacity: 5 });
    const b = await session(p.id, { capacity: 5 }, 9);
    const past = await session(p.id, { capacity: 5 }, -2);

    expect((await saveCart(db(), { cartId: "short", items: [{ id: a.id, spots: 1, extras: [] }] })).ok).toBe(false);
    expect((await saveCart(db(), { cartId: CART, items: [{ id: a.id, spots: 2, extras: [] }, { id: past.id, spots: 1, extras: [] }, { id: "missing", spots: 1, extras: [] }] })).count).toBe(1);

    let open = await openCarts(db());
    expect(open.carts).toHaveLength(1);
    expect(open.carts[0].family).toBeNull();
    expect(open.spots).toBe(2);
    expect(open.demand[0]).toMatchObject({ carts: 1, spots: 2, remaining: 5 });

    // A signed-in family is linked, and stays linked after signing out.
    const { family: f } = await family("Lee");
    await saveCart(db(), { cartId: CART, items: [{ id: a.id, spots: 1, extras: [] }, { id: b.id, spots: 1, extras: [] }], familyId: f.id });
    await saveCart(db(), { cartId: "cart-other-visitor-0001", items: [{ id: a.id, spots: 1, extras: [] }] });
    await saveCart(db(), { cartId: CART, items: [{ id: a.id, spots: 1, extras: [] }, { id: b.id, spots: 1, extras: [] }], familyId: null });
    open = await openCarts(db());
    expect(open.carts).toHaveLength(2);
    expect(open.signedIn).toBe(1);
    expect(open.carts.find((c) => c.id === CART)?.family?.name).toBe(f.name);
    expect(open.demand[0]).toMatchObject({ session: { id: a.id }, carts: 2 });

    // Emptying the cart removes it.
    await saveCart(db(), { cartId: CART, items: [] });
    expect((await openCarts(db())).carts).toHaveLength(1);
  });

  it("forgets carts left alone for a week", async () => {
    const p = await program();
    const a = await session(p.id, { capacity: 5 }, 20);
    const old = new Date(Date.now() - 8 * 24 * 3600_000);
    await saveCart(db(), { cartId: CART, items: [{ id: a.id, spots: 1, extras: [] }], now: old });
    expect((await openCarts(db())).carts).toHaveLength(0);
    await pruneCarts(db());
    expect(await db().select().from(s.carts)).toHaveLength(0);
  });
});

describe("abandoned checkouts", () => {
  it("lists checkouts in progress and those whose hold ran out, and notices later bookings", async () => {
    const p = await program({ name: "Flex" });
    const a = await session(p.id, { capacity: 5 });
    const b = await session(p.id, { capacity: 5 }, 10);

    expect((await submitPublicBooking(db(), booking(a.id))).ok).toBe(true);
    expect((await submitPublicBooking(db(), booking(b.id, "sam@example.com"))).ok).toBe(true);
    let r = await abandonedCheckouts(db(), { days: 30 });
    expect(r.inProgress).toHaveLength(2);
    expect(r.abandoned).toHaveLength(0);

    // Both holds run out.
    await expireHolds(db(), new Date(Date.now() + 7 * 24 * 3600_000));
    r = await abandonedCheckouts(db(), { days: 30 });
    expect(r.inProgress).toHaveLength(0);
    expect(r.abandoned).toHaveLength(2);
    const robin = r.abandoned.find((x) => x.contact?.email === "robin.new@example.com")!;
    expect(robin.contact).toMatchObject({ name: "Robin Newcomer", phone: "619-555-0100" });
    expect(robin.lines).toMatchObject([{ session: { id: a.id }, childName: "Pip" }]);
    expect(robin.bookedLater).toBe(false);

    // Robin comes back and books the same day again.
    expect((await submitPublicBooking(db(), booking(a.id))).ok).toBe(true);
    r = await abandonedCheckouts(db(), { days: 30 });
    expect(r.abandoned.find((x) => x.contact?.email === "robin.new@example.com")?.bookedLater).toBe(true);
    expect((await cartSummary(db())).abandoned).toBe(1);
  });
});
