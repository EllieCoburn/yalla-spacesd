/**
 * Who can have a Family Portal account: families who book and pay on the website (the payment is
 * their way in), and families Yalla invites. There's no open sign-up.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import {
  claimPortal,
  claimPortalFromBooking,
  portalClaimForPass,
  inviteDetails,
  inviteToPortal,
  portalClaimFor,
  redeemFamilyLink,
  registerFamilyAccount,
  requestMagicLink,
  resolveFamilySession,
  setFamilyPassword,
  signInWithPassword,
} from "@/lib/family-auth";
import { linkKey } from "@/lib/links";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { createFamily } from "@/lib/ops/families";
import { startGuestSignup } from "@/lib/playpass/membership";
import { processEvent } from "@/lib/payments/webhooks";
import { submitPublicBooking, type PublicBookingInput } from "@/lib/ops/public-booking";
import { setPolicy } from "@/lib/ops/settings";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const base = "http://test";
const account = (over: Partial<Parameters<typeof registerFamilyAccount>[1]> = {}) => ({
  inviteToken: "",
  firstName: "Maya",
  lastName: "Rivera",
  email: "",
  phone: "619-555-0100",
  password: "garden-swing-42",
  children: [
    { firstName: "Leo", lastName: "Rivera", birthDate: "2022-03-14" },
    { firstName: "Ana", lastName: "Rivera", birthDate: "2024-07-02" },
  ],
  ...over,
});

async function invite(email = "maya@example.com", name = "Maya Rivera") {
  const r = await inviteToPortal(db(), owner, { email, name }, base);
  return new URL(r.devLink!).searchParams.get("invite")!;
}

/** Invited, then creates the account (signed in straight away). */
async function join(over: Partial<Parameters<typeof registerFamilyAccount>[1]> = {}) {
  const token = await invite();
  return registerFamilyAccount(db(), account({ inviteToken: token, ...over }), base);
}

describe("Joining by invitation", () => {
  it("there's no way in without an invitation", async () => {
    await expect(registerFamilyAccount(db(), account(), base)).rejects.toThrow(/invitation/);
    await expect(registerFamilyAccount(db(), account({ inviteToken: "made-up" }), base)).rejects.toThrow(/invitation/);
    expect(await db().select().from(s.families)).toHaveLength(0);
  });

  it("the invitation email has no working link in the stored copy, and the link works once", async () => {
    const token = await invite();
    const [msg] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "family_invite"));
    expect(msg.toAddress).toBe("maya@example.com");
    expect(msg.body).not.toContain(token);
    expect(await inviteDetails(db(), token)).toMatchObject({ email: "maya@example.com", firstName: "Maya", lastName: "Rivera" });
    await registerFamilyAccount(db(), account({ inviteToken: token }), base);
    expect(await inviteDetails(db(), token)).toBeNull();
    await expect(registerFamilyAccount(db(), account({ inviteToken: token }), base)).rejects.toThrow(/invitation/);
  });

  it("creates the family, guardian, password and children, confirms the email and signs in", async () => {
    const r = await join();
    const g = await resolveFamilySession(db(), r.session);
    expect(g).toMatchObject({ firstName: "Maya", email: "maya@example.com", emailVerified: true, hasPassword: true });
    const kids = await db().select().from(s.children).where(eq(s.children.familyId, g!.familyId));
    expect(kids.map((k) => [k.firstName, k.lastName, k.birthDate]).sort()).toEqual([
      ["Ana", "Rivera", "2024-07-02"],
      ["Leo", "Rivera", "2022-03-14"],
    ]);
    const [row] = await db().select().from(s.guardians).where(eq(s.guardians.id, g!.guardianId));
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    expect(row.passwordHash).not.toContain("garden-swing-42");
  });

  it("requires at least one child with first name, last name and date of birth", async () => {
    const token = await invite();
    await expect(registerFamilyAccount(db(), account({ inviteToken: token, children: [] }), base)).rejects.toThrow(/at least one child/);
    await expect(registerFamilyAccount(db(), account({ inviteToken: token, children: [{ firstName: "Kid", lastName: "", birthDate: "2022-01-01" }] }), base)).rejects.toThrow(/last name/);
    await expect(registerFamilyAccount(db(), account({ inviteToken: token, children: [{ firstName: "Kid", lastName: "R", birthDate: "" }] }), base)).rejects.toThrow(/date of birth/);
    await expect(registerFamilyAccount(db(), account({ inviteToken: token, children: [{ firstName: "Kid", lastName: "R", birthDate: "2999-01-01" }] }), base)).rejects.toThrow(/future/);
    await expect(registerFamilyAccount(db(), account({ inviteToken: token, password: "short" }), base)).rejects.toThrow(/8 characters/);
    expect(await db().select().from(s.families)).toHaveLength(0);
    // The invitation still works after a mistake.
    expect(await inviteDetails(db(), token)).not.toBeNull();
  });

  it("a family already on file (no password yet) joins their existing record", async () => {
    const f = await family("Booked");
    const r = await inviteToPortal(db(), owner, { email: f.guardian.email }, base);
    const token = new URL(r.devLink!).searchParams.get("invite")!;
    expect(await inviteDetails(db(), token)).toMatchObject({ existing: true, hasChildren: true });
    const done = await registerFamilyAccount(db(), account({ inviteToken: token, children: [] }), base);
    const g = await resolveFamilySession(db(), done.session);
    expect(g?.familyId).toBe(f.family.id);
    expect(await db().select().from(s.families)).toHaveLength(1);
  });

  it("won't invite someone who already has an account", async () => {
    await join();
    await expect(inviteToPortal(db(), owner, { email: "MAYA@example.com" }, base)).rejects.toThrow(/already has/);
  });

  it("sends the family a welcome email and tells the team who joined", async () => {
    await setPolicy(db(), owner, "notifications.staffEmails", "hello@yalla.test");
    await join();
    const sent = await db().select().from(s.messages);
    expect(sent.find((m) => m.templateKey === "family_welcome")?.toAddress).toBe("maya@example.com");
    const notice = sent.find((m) => m.templateKey === "staff_family_joined");
    expect(notice?.toAddress).toBe("hello@yalla.test");
    expect(notice?.body).toContain("Joined: Invitation from Yalla");
    expect(notice?.body).toContain("Child 1: Leo, born Mar 14, 2022");
  });

  it("signs in later with email and password; repeated wrong passwords pause sign-in", async () => {
    await join();
    expect("session" in (await signInWithPassword(db(), { email: " Maya@Example.com ", password: "garden-swing-42", baseUrl: base }))).toBe(true);
    await expect(signInWithPassword(db(), { email: "nobody@example.com", password: "whatever-123", baseUrl: base })).rejects.toThrow(/don’t match/);
    for (let i = 0; i < 8; i++) await signInWithPassword(db(), { email: "maya@example.com", password: `nope-${i}-xxxx`, baseUrl: base }).catch(() => null);
    await expect(signInWithPassword(db(), { email: "maya@example.com", password: "garden-swing-42", baseUrl: base })).rejects.toThrow(/wait 15 minutes/);
  });

  it("a signed-in guardian can change their password", async () => {
    const r = await join();
    const g = (await resolveFamilySession(db(), r.session))!;
    await setFamilyPassword(db(), g, "new-swing-set-77");
    expect("session" in (await signInWithPassword(db(), { email: "maya@example.com", password: "new-swing-set-77", baseUrl: base }))).toBe(true);
  });
});

describe("Joining by booking", () => {
  const input = (sessionId: string, email = "robin.new@example.com"): PublicBookingInput => ({
    guardian: { firstName: "Robin", lastName: "Newcomer", email, phone: "619-555-0100" },
    children: [{ key: "a", firstName: "Pip", lastName: "Newcomer", birthDate: "2023-02-01" }],
    lines: [{ sessionId, childKeys: ["a"] }],
    signatures: [],
    meta: {},
    baseUrl: base,
  });

  async function book(email?: string) {
    const p = await program({ priceCents: 5000 });
    const sess = await session(p.id, { capacity: 5 });
    const r = await submitPublicBooking(db(), input(sess.id, email));
    if (!r.ok) throw new Error(r.error);
    const [b] = await db().select().from(s.bookings).orderBy(s.bookings.createdAt);
    return { b, sess };
  }
  async function pay(bookingId: string) {
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, bookingId));
    const [p] = await db().select().from(s.payments).where(eq(s.payments.invoiceId, inv.id));
    await processEvent(db(), "test", { id: `evt_${p.id}`, type: "payment.succeeded", checkoutRef: p.checkoutRef!, providerRef: "pi_x", amountCents: p.amountCents });
  }

  it("before paying there's no portal access, not even by a sign-in link", async () => {
    const { b } = await book();
    expect(await portalClaimFor(db(), b.reference, linkKey("booking", b.reference))).toBeNull();
    await requestMagicLink(db(), "robin.new@example.com", base);
    expect(await db().select().from(s.messages).where(eq(s.messages.templateKey, "family_sign_in"))).toHaveLength(0);
  });

  it("an unpaid guest can come back and book again with the same email", async () => {
    const { sess } = await book();
    const again = await submitPublicBooking(db(), input(sess.id));
    expect(again.ok).toBe(true);
    expect(await db().select().from(s.families)).toHaveLength(1);
    expect(await db().select().from(s.children)).toHaveLength(1);
  });

  it("paying opens the portal from the confirmation page, once, and emails a confirm-your-email link", async () => {
    await setPolicy(db(), owner, "notifications.staffEmails", "hello@yalla.test");
    const { b } = await book();
    await pay(b.id);
    const k = linkKey("booking", b.reference);
    expect(await portalClaimFor(db(), b.reference, "wrong-key")).toBeNull();
    expect(await portalClaimFor(db(), b.reference, k)).toMatchObject({ firstName: "Robin" });
    const session = await claimPortalFromBooking(db(), b.reference, k);
    const g = await resolveFamilySession(db(), session!);
    expect(g).toMatchObject({ email: "robin.new@example.com", emailVerified: false, hasPassword: false });
    expect(await claimPortalFromBooking(db(), b.reference, k)).toBeNull(); // only once

    const sent = await db().select().from(s.messages);
    const confirm = sent.filter((m) => m.templateKey === "family_confirm_email");
    expect(confirm).toHaveLength(1);
    expect(confirm[0].subject).toBe("Your Yalla Family Portal is ready");
    expect(sent.some((m) => m.templateKey === "family_welcome")).toBe(false); // the confirmation email is the welcome
    expect(sent.find((m) => m.templateKey === "staff_family_joined")?.body).toContain("Joined: First booking on the website");
  });

  it("the confirm-your-email link confirms the email and signs in", async () => {
    const { b } = await book();
    await pay(b.id);
    const [g] = await db().select().from(s.guardians);
    const { sendEmailConfirmation } = await import("@/lib/family-auth");
    const r = await sendEmailConfirmation(db(), g.id, base);
    const token = new URL(r.devLink!).searchParams.get("token")!;
    const done = await redeemFamilyLink(db(), token);
    expect(done?.purpose).toBe("confirm_email");
    expect((await resolveFamilySession(db(), done!.session))?.emailVerified).toBe(true);
    expect(await redeemFamilyLink(db(), token)).toBeNull();
  });

  it("a later booking doesn't send the welcome again", async () => {
    const { b, sess } = await book();
    await pay(b.id);
    const [g] = await db().select().from(s.guardians);
    const signedIn = { sessionId: "x", guardianId: g.id, familyId: g.familyId, familyName: "", firstName: g.firstName, lastName: g.lastName, email: g.email, canBook: true, canViewBilling: true, canViewSensitive: true, emailVerified: false, hasPassword: false };
    const second = await submitPublicBooking(db(), { ...input(sess.id), signedIn });
    if (!second.ok) throw new Error(second.error);
    const [, b2] = await db().select().from(s.bookings).orderBy(s.bookings.createdAt);
    await pay(b2.id);
    expect(await db().select().from(s.messages).where(eq(s.messages.templateKey, "family_confirm_email"))).toHaveLength(1);
  });
});

describe("Bookings the team makes", () => {
  async function teamBooking(familyId: string, childId: string) {
    const p = await program();
    const sess = await session(p.id, { capacity: 5 });
    const hold = await createHold(db(), owner, { familyId, items: [{ sessionId: sess.id, childId }], source: "admin" });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: true });
    return hold.booking;
  }

  it("a family new to the portal gets a welcome with a link to set up their account (the portal doesn't open by itself)", async () => {
    const { family: f, guardian: g } = await createFamily(db(), owner, { guardian: { firstName: "Tess", lastName: "Walkin", email: "tess@example.com", portalAccess: false } });
    const { addChild } = await import("@/lib/ops/families");
    const { child } = await addChild(db(), owner, f.id, { firstName: "Bo", lastName: "Walkin", birthDate: "2022-06-01" });
    const b = await teamBooking(f.id, child.id);
    const sent = await db().select().from(s.messages);
    expect(sent.some((m) => m.templateKey === "booking_confirmation")).toBe(false);
    const welcome = sent.find((m) => m.templateKey === "booking_welcome_team")!;
    expect(welcome.subject).toBe("Welcome to Yalla! Your booking is confirmed");
    expect(welcome.body).toContain("Team Yalla has confirmed your booking");
    expect(welcome.body).toContain("[private link removed]");
    // No portal yet: no sign-in link, no "open my portal" on the confirmation page.
    await requestMagicLink(db(), "tess@example.com", base);
    expect(await db().select().from(s.messages).where(eq(s.messages.templateKey, "family_sign_in"))).toHaveLength(0);
    expect(await portalClaimFor(db(), b.reference, linkKey("booking", b.reference))).toBeNull();
    // The link in the email is an invitation for their existing family (children already on file).
    const [inv] = await db().select().from(s.familyInvites);
    expect(inv.guardianId).toBe(g.id);
    expect(inv.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 3600_000);
  });

  it("a family already in the portal gets a short confirmation pointing to it", async () => {
    const f = await family("Regular");
    await db().update(s.guardians).set({ portalAccess: true }).where(eq(s.guardians.id, f.guardian.id));
    await teamBooking(f.family.id, f.children[0].id);
    const sent = await db().select().from(s.messages);
    const msg = sent.find((m) => m.templateKey === "booking_confirmed_team")!;
    expect(msg.body).toContain("Team Yalla has booked this for you");
    expect(msg.body).toContain("/portal/home?tab=bookings");
    expect(sent.some((m) => m.templateKey === "booking_welcome_team" || m.templateKey === "family_confirm_email")).toBe(false);
  });
});

describe("Joining with a Play Pass", () => {
  async function plan() {
    await db().insert(s.playPassPlans).values({ tier: "gather", name: "Gather", priceCents: 18000, allocationCents: 20000, minExperiences: 3, sortOrder: 1 });
  }
  const guest = (over: Partial<Parameters<typeof startGuestSignup>[1]> = {}) => ({
    tier: "gather",
    acceptTerms: true,
    baseUrl: base,
    guardian: { firstName: "Pat", lastName: "Member", email: "pat@example.com", phone: "619-555-0100" },
    children: [{ firstName: "Lu", lastName: "Member", birthDate: "2021-09-09" }],
    ...over,
  });
  async function pay(subId: string) {
    const [sub] = await db().select().from(s.playPassSubscriptions).where(eq(s.playPassSubscriptions.id, subId));
    await processEvent(db(), "test", { id: `evt_c_${subId}`, type: "membership.checkout_completed", checkoutRef: sub.checkoutRef!, customerRef: "tcus_1", subscriptionRef: `tsubref_${sub.id}`, localId: sub.id });
    await processEvent(db(), "test", { id: `evt_p_${subId}`, type: "membership.invoice_paid", invoiceRef: `tin_init_${sub.id}`, subscriptionRef: `tsubref_${sub.id}`, localId: sub.id, amountCents: sub.initialChargeCents, reason: "initial", chargeRef: `tpi_${sub.id}` });
  }

  it("needs a child's first name, last name and date of birth", async () => {
    await plan();
    await expect(startGuestSignup(db(), guest({ children: [] }))).rejects.toThrow(/at least one child/);
    await expect(startGuestSignup(db(), guest({ children: [{ firstName: "Lu", lastName: "", birthDate: "2021-09-09" }] }))).rejects.toThrow(/last name/);
  });

  it("the portal opens only once the first payment goes through", async () => {
    await plan();
    const { subscriptionId, url } = await startGuestSignup(db(), guest());
    expect(url).toContain("/pay/test/");
    const k = linkKey("playpass", subscriptionId);
    expect(await portalClaimForPass(db(), subscriptionId, k)).toBeNull(); // not paid yet
    await requestMagicLink(db(), "pat@example.com", base);
    expect(await db().select().from(s.messages).where(eq(s.messages.templateKey, "family_sign_in"))).toHaveLength(0);

    await pay(subscriptionId);
    expect(await portalClaimForPass(db(), subscriptionId, "nope")).toBeNull();
    const session = await claimPortal(db(), { playPass: subscriptionId }, k);
    expect((await resolveFamilySession(db(), session!))?.email).toBe("pat@example.com");
    expect(await claimPortal(db(), { playPass: subscriptionId }, k)).toBeNull();
    const [confirm] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "family_confirm_email"));
    expect(confirm.body).toContain("Your Play Pass is active");
    const kids = await db().select().from(s.children);
    expect(kids.map((c) => [c.firstName, c.lastName])).toEqual([["Lu", "Member"]]);
  });

  it("someone already in the portal is asked to sign in", async () => {
    await plan();
    await join();
    await expect(startGuestSignup(db(), guest({ guardian: { firstName: "M", lastName: "R", email: "maya@example.com", phone: "619-555-0100" } }))).rejects.toThrow(/sign in/);
  });
});
