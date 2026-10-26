import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { redeemMagicLink, requestMagicLink, resolveFamilySession } from "@/lib/family-auth";
import { familyPortalData, listPublicSessions, submitPublicBooking, type PublicBookingInput } from "@/lib/ops/public-booking";
import { createTemplate, addRequirement } from "@/lib/ops/forms";
import { createHold } from "@/lib/ops/bookings";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

const base = "http://localhost:3105";

beforeEach(reset);

function input(sessionId: string, overrides: Partial<PublicBookingInput> = {}): PublicBookingInput {
  return {
    guardian: { firstName: "Robin", lastName: "Newcomer", email: "robin.new@example.com" },
    children: [{ key: "a", firstName: "Pip", lastName: "Newcomer", birthDate: "2023-02-01" }],
    lines: [{ sessionId, childKeys: ["a"] }],
    signatures: [],
    meta: {},
    baseUrl: base,
    ...overrides,
  };
}

describe("public booking", () => {
  it("creates a family once, then requires sign-in rather than duplicating it", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 5 });
    const first = await submitPublicBooking(db(), input(sess.id));
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.url).toMatch(/\/pay\/test\/tcs_/);
    const second = await submitPublicBooking(db(), input(sess.id, { guardian: { firstName: "Robin", lastName: "Newcomer", email: "ROBIN.NEW@example.com" } }));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("sign_in_required");
    expect(await db().select().from(s.families)).toHaveLength(1);

    // Signed in, the same child (first name + birth date) is matched, not duplicated.
    const [g] = await db().select().from(s.guardians);
    const signedIn = { sessionId: "x", guardianId: g.id, familyId: g.familyId, familyName: "", firstName: g.firstName, lastName: g.lastName, email: g.email, canBook: true, canViewBilling: true, canViewSensitive: true };
    const sess2 = await session(p.id, { capacity: 5 }, 9);
    const third = await submitPublicBooking(db(), input(sess2.id, { signedIn }));
    expect(third.ok).toBe(true);
    expect(await db().select().from(s.children)).toHaveLength(1);
  });

  it("explains insufficient capacity for siblings before payment and leaves no records", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 1 });
    const res = await submitPublicBooking(
      db(),
      input(sess.id, {
        children: [
          { key: "a", firstName: "Ivy", lastName: "Sib", birthDate: "2022-05-01" },
          { key: "b", firstName: "Jo", lastName: "Sib", birthDate: "2023-08-01" },
        ],
        lines: [{ sessionId: sess.id, childKeys: ["a", "b"] }],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Only 1 spot remains .* needs 2/);
    expect(await db().select().from(s.payments)).toHaveLength(0);
    expect(await db().select().from(s.families)).toHaveLength(0);
  });

  it("asks for blocking agreements, records the typed signature, then holds", async () => {
    const p = await program({ kind: "weekend" });
    const sess = await session(p.id, { capacity: 5 });
    const { template } = await createTemplate(db(), owner, { title: "Weekend waiver", kind: "waiver", perChild: true, requiresSignature: true, frequency: "once", enforcement: "blocks_booking", body: "Placeholder text" });
    await addRequirement(db(), owner, { templateId: template.id, scope: "program", programId: p.id });
    const missing = await submitPublicBooking(db(), input(sess.id));
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.code).toBe("agreements");
      expect(missing.agreements?.[0].childKey).toBe("a");
    }
    expect(await db().select().from(s.families)).toHaveLength(0); // nothing left behind
    const signed = await submitPublicBooking(db(), input(sess.id, { signatures: [{ templateId: template.id, childKey: "a", signatureText: "Robin Newcomer", consent: true }] }));
    expect(signed.ok).toBe(true);
    const [sub] = await db().select().from(s.formSubmissions);
    expect(sub.signerName).toBe("Robin Newcomer");
    expect(sub.versionBody).toBe("Placeholder text");
  });

  it("lists truthful public states", async () => {
    const p = await program({ lowAvailabilityThreshold: 2 });
    const open = await session(p.id, { capacity: 10 }, 3);
    const low = await session(p.id, { capacity: 1 }, 4);
    const full = await session(p.id, { capacity: 1 }, 5);
    const f = await family("Fill");
    await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: full.id, childId: f.children[0].id }], source: "admin" });
    const list = await listPublicSessions(db(), { from: todayLA(), to: addDaysISO(todayLA(), 10) });
    const byId = new Map(list.map((x) => [x.id, x.state]));
    expect(byId.get(open.id)).toMatchObject({ state: "available", remaining: 10 });
    expect(byId.get(low.id)).toMatchObject({ state: "limited", remaining: 1 });
    expect(byId.get(full.id)).toMatchObject({ state: "full" });
  });
});

describe("family portal access", () => {
  it("magic links work once and never reveal unknown emails", async () => {
    const f = await family("Link");
    const unknown = await requestMagicLink(db(), "nobody@example.com", base);
    const known = await requestMagicLink(db(), f.guardian.email, base);
    expect(Object.keys(unknown)).toEqual([]);
    expect(known.devLink).toMatch(/\/portal\/verify\?token=/);
    const token = new URL(known.devLink!).searchParams.get("token")!;
    const session = await redeemMagicLink(db(), token);
    expect(session).toBeTruthy();
    expect(await redeemMagicLink(db(), token)).toBeNull();
    const ctx = await resolveFamilySession(db(), session);
    expect(ctx?.familyId).toBe(f.family.id);
  });

  it("shows billing and care details only to guardians allowed to see them", async () => {
    const f = await family("Gate");
    await db().update(s.children).set({ allergies: "Sesame" }).where(eq(s.children.id, f.children[0].id));
    await db().update(s.guardians).set({ canViewSensitive: true }).where(eq(s.guardians.id, f.guardian.id));
    f.guardian.canViewSensitive = true;
    const { createInvoice } = await import("@/lib/ops/billing");
    await createInvoice(db(), owner, { familyId: f.family.id, description: "Camp", lines: [{ kind: "charge", description: "Camp", unitCents: 10000 }] });
    const [second] = await db()
      .insert(s.guardians)
      .values({ familyId: f.family.id, firstName: "Second", lastName: "Gate", email: "second.gate@example.com", canViewBilling: false, canViewSensitive: false })
      .returning();
    const ctx = (g: typeof second) => ({ sessionId: "x", guardianId: g.id, familyId: f.family.id, familyName: "", firstName: g.firstName, lastName: g.lastName, email: g.email, canBook: g.canBook, canViewBilling: g.canViewBilling, canViewSensitive: g.canViewSensitive });
    const primary = await familyPortalData(db(), ctx(f.guardian));
    const limited = await familyPortalData(db(), ctx(second));
    expect(primary.billing?.invoices).toHaveLength(1);
    expect(primary.children[0].care?.allergies).toBe("Sesame");
    expect(limited.billing).toBeNull();
    expect(limited.children[0].care).toBeNull();
  });
});

describe("routes", () => {
  it("rejects unsigned test webhooks and unauthenticated cron calls", async () => {
    const { POST } = await import("@/app/api/webhooks/test/route");
    const bad = await POST(new Request(`${base}/api/webhooks/test`, { method: "POST", body: JSON.stringify({ id: "e1", type: "payment.succeeded" }), headers: { "x-yalla-test-signature": "t=1,v1=nope" } }));
    expect(bad.status).toBe(400);

    const { GET } = await import("@/app/api/cron/housekeeping/route");
    process.env.CRON_SECRET = "cron-test-secret";
    expect((await GET(new Request(`${base}/api/cron/housekeeping`))).status).toBe(401);
    expect((await GET(new Request(`${base}/api/cron/housekeeping`, { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    const ok = await GET(new Request(`${base}/api/cron/housekeeping`, { headers: { authorization: "Bearer cron-test-secret" } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toHaveProperty("expiredHolds");
  });

  it("accepts a correctly signed test webhook and confirms the booking", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 3 });
    const res = await submitPublicBooking(db(), input(sess.id));
    expect(res.ok).toBe(true);
    const [pay] = await db().select().from(s.payments);
    const { signTestPayload } = await import("@/lib/payments/provider");
    const { POST } = await import("@/app/api/webhooks/test/route");
    const body = JSON.stringify({ id: "evt_route_1", type: "payment.succeeded", checkoutRef: pay.checkoutRef, providerRef: "pi_route", amountCents: pay.amountCents });
    const r = await POST(new Request(`${base}/api/webhooks/test`, { method: "POST", body, headers: { "x-yalla-test-signature": signTestPayload(body) } }));
    expect(r.status).toBe(200);
    const [b] = await db().select().from(s.bookings);
    expect(b.status).toBe("confirmed");
  });
});
