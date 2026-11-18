"use server";

import { getDb, isDbConfigured } from "@/lib/db";
import { careNeededForBooking, checkPromo, joinPublicWaitlist, previewAgreements, retryCheckout, saveBookingCare, signForBooking, submitPublicBooking, type Agreement, type PublicBookingResult } from "@/lib/ops/public-booking";
import { startCheckout } from "@/lib/ops/bookings";
import { OpsError } from "@/lib/audit";
import { getGuardian, requestContext, setFamilyCookie } from "../portal/session";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { bookings } from "@/lib/db/schema";
import { bookingStatusPath, offerPath } from "@/lib/links";
import { mayViewStatus } from "@/lib/booking-access";
import { allow, throttle } from "@/lib/rate-limit";
import { requestMagicLink, safeNextPath, signInWithPassword } from "@/lib/family-auth";
import { CARE_REQUIRED, findGuardianByEmail } from "@/lib/ops/families";

export type BookingPayload = {
  guardian: { firstName: string; lastName: string; email: string; phone?: string };
  children: { key: string; existingId?: string | null; firstName: string; lastName: string; birthDate: string; allergies?: string | null; medications?: string | null }[];
  lines: { sessionId: string; childKeys: string[]; addons?: Record<string, string[]> }[];
  signatures: { templateId: string; childKey: string | null; signatureText?: string; consent: boolean; answers?: Record<string, string> }[];
  promoCode?: string | null;
};

function clip(s: unknown, n = 200) {
  return String(s ?? "").slice(0, n);
}

export async function submitBookingAction(payload: BookingPayload): Promise<PublicBookingResult> {
  if (!isDbConfigured()) return { ok: false, code: "unavailable", error: "Online booking isn’t open yet." };
  const ctx = await requestContext();
  const signedIn = await getGuardian();
  // Holds take real places off sale for a while, so repeated unpaid holds are limited.
  const tooMany = "That’s a lot of bookings in a short time. Please wait a little while, or call us at 619.775.4008.";
  if (!(await allow(getDb(), "bookingIp", ctx.ip))) return { ok: false, code: "throttled", error: tooMany };
  if (!(await allow(getDb(), "bookingEmail", signedIn?.email ?? payload.guardian?.email))) return { ok: false, code: "throttled", error: tooMany };
  try {
    return await submitPublicBooking(getDb(), {
      signedIn,
      guardian: { firstName: clip(payload.guardian.firstName, 80), lastName: clip(payload.guardian.lastName, 80), email: clip(payload.guardian.email, 200), phone: clip(payload.guardian.phone, 40) },
      children: payload.children.slice(0, 8).map((c) => ({ key: clip(c.key, 60), existingId: c.existingId ? clip(c.existingId, 60) : null, firstName: clip(c.firstName, 80), lastName: clip(c.lastName, 80), birthDate: clip(c.birthDate, 10), allergies: typeof c.allergies === "string" ? clip(c.allergies, 1000) : null, medications: typeof c.medications === "string" ? clip(c.medications, 1000) : null })),
      lines: payload.lines.slice(0, 60).map((l) => ({
        sessionId: clip(l.sessionId, 60),
        childKeys: l.childKeys.slice(0, 8).map((k) => clip(k, 60)),
        // Add-on keys are checked against the program's offer when the hold is created.
        addons: Object.fromEntries(Object.entries(l.addons ?? {}).slice(0, 8).map(([k, v]) => [clip(k, 60), (Array.isArray(v) ? v : []).slice(0, 4).map((x) => clip(x, 20))])),
      })),
      signatures: payload.signatures.slice(0, 40).map((s) => ({
        templateId: clip(s.templateId, 60),
        childKey: s.childKey ? clip(s.childKey, 60) : null,
        signatureText: clip(s.signatureText, 120),
        consent: !!s.consent,
        // Answers to online agreements (initials and signatures are drawings, checked again on the server).
        answers: s.answers && typeof s.answers === "object" ? Object.fromEntries(Object.entries(s.answers).slice(0, 80).map(([k, v]) => [clip(k, 60), String(v ?? "").slice(0, 200_100)])) : undefined,
      })),
      promoCode: payload.promoCode ? clip(payload.promoCode, 40) : null,
      meta: { ip: ctx.ip, userAgent: ctx.userAgent },
      baseUrl: ctx.baseUrl,
    });
  } catch (e) {
    console.error("[public booking failed]", (e as Error).message?.slice(0, 200));
    return { ok: false, code: "error", error: "Something went wrong and nothing was booked. Please try again." };
  }
}

export type PromoCheck = { ok: true; code: string; kind: "percent" | "fixed"; value: number; programId: string | null; programKind: string | null } | { ok: false; error: string };

/** "Apply" on the checkout's promo code field: is this code good for these sessions? */
export async function checkPromoAction(input: { code: string; sessionIds: string[] }): Promise<PromoCheck> {
  if (!isDbConfigured()) return { ok: false, error: "Promo codes aren’t available yet." };
  const ctx = await requestContext();
  if (!(await allow(getDb(), "promoIp", ctx.ip))) return { ok: false, error: "Too many tries. Please wait a little while." };
  try {
    const d = await checkPromo(getDb(), clip(input.code, 40), input.sessionIds.slice(0, 60).map((x) => clip(x, 60)));
    return { ok: true, code: d.code ?? "", kind: d.kind === "fixed" ? "fixed" : "percent", value: d.value, programId: d.programId, programKind: d.programKind };
  } catch (e) {
    if (e instanceof OpsError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function agreementsAction(input: { sessionIds: string[]; children: { key: string; existingId?: string | null; firstName: string; birthDate?: string }[] }): Promise<Agreement[]> {
  if (!isDbConfigured()) return [];
  const signedIn = await getGuardian();
  return previewAgreements(getDb(), { familyId: signedIn?.familyId ?? null, sessionIds: input.sessionIds.slice(0, 60), children: input.children.slice(0, 8).map((c) => ({ key: clip(c.key, 60), existingId: c.existingId ? clip(c.existingId, 60) : null, firstName: clip(c.firstName, 80), birthDate: c.birthDate ? clip(c.birthDate, 10) : undefined })) });
}

export async function joinWaitlistAction(input: { sessionId: string; guardian: { firstName: string; lastName: string; email: string; phone?: string }; child: { existingId?: string | null; firstName: string; lastName?: string; birthDate: string } }) {
  if (!isDbConfigured()) return { ok: false as const, code: "unavailable", error: "The waitlist isn’t open yet." };
  const ctx = await requestContext();
  if (!(await allow(getDb(), "waitlistIp", ctx.ip))) return { ok: false as const, code: "throttled", error: "That’s a lot of waitlist requests in a short time. Please try again later." };
  const guardian = { firstName: clip(input.guardian.firstName, 80), lastName: clip(input.guardian.lastName, 80), email: clip(input.guardian.email, 200), phone: clip(input.guardian.phone, 40) };
  const child = { existingId: input.child.existingId ? clip(input.child.existingId, 60) : null, firstName: clip(input.child.firstName, 80), lastName: clip(input.child.lastName, 80), birthDate: clip(input.child.birthDate, 10) };
  return joinPublicWaitlist(getDb(), { signedIn: await getGuardian(), guardian, child, sessionId: clip(input.sessionId, 60), baseUrl: ctx.baseUrl });
}

/** Retry a declined payment while the hold is still valid. */
export async function retryPaymentAction(form: FormData) {
  const ref = clip(form.get("reference"), 20);
  const key = clip(form.get("k"), 40);
  const [owned] = await getDb().select({ familyId: bookings.familyId }).from(bookings).where(eq(bookings.reference, ref));
  if (!owned || !(await mayViewStatus("booking", ref, key, owned.familyId))) redirect("/book");
  const ctx = await requestContext();
  let url: string;
  try {
    url = (await retryCheckout(getDb(), ref, ctx.baseUrl)).url;
  } catch (e) {
    if (e instanceof OpsError) redirect(bookingStatusPath(ref, { error: e.message }));
    throw e;
  }
  redirect(url);
}

/** Accept a waitlist offer: continue to payment for the held spot. */
/** A waitlist offer asks for each child's allergies and medications (if we don't have them) before payment. */
export async function saveOfferCareAction(form: FormData) {
  const ref = clip(form.get("reference"), 20);
  const key = clip(form.get("k"), 40);
  const db = getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.reference, ref));
  if (!b || b.source !== "waitlist" || !(await mayViewStatus("offer", ref, key, b.familyId))) redirect("/book");
  const ids = form.getAll("childId").map((x) => clip(x, 60));
  const answer = (kind: string, id: string) => {
    const yn = String(form.get(`${kind}Answer-${id}`) ?? "");
    const text = clip(form.get(`${kind}-${id}`), 1000).trim();
    return yn === "no" ? "" : yn === "yes" && text ? text : null;
  };
  try {
    await saveBookingCare(db, b.id, ids.map((id) => ({ childId: id, allergies: answer("allergies", id), medications: answer("medications", id) })));
  } catch (e) {
    if (e instanceof OpsError) redirect(offerPath(ref, { error: e.message }));
    throw e;
  }
  redirect(offerPath(ref));
}

export async function acceptOfferAction(form: FormData) {
  const ref = clip(form.get("reference"), 20);
  const key = clip(form.get("k"), 40);
  const ctx = await requestContext();
  const db = getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.reference, ref));
  if (!b || b.source !== "waitlist" || !(await mayViewStatus("offer", ref, key, b.familyId))) redirect("/book");
  if ((await careNeededForBooking(db, b.id)).length) redirect(offerPath(ref, { error: CARE_REQUIRED }));
  let url: string;
  try {
    url = (await startCheckout(db, { type: "system", name: "Waitlist offer" }, b.id, { base: ctx.baseUrl })).url;
  } catch (e) {
    if (e instanceof OpsError) redirect(offerPath(ref, { error: e.message }));
    throw e;
  }
  redirect(url);
}

export type OfferState = { error?: string } | undefined;

/** Accept a waitlist offer that needs agreements signed first: sign them, then continue to payment. */
export async function acceptOfferWithAgreementsAction(_: OfferState, form: FormData): Promise<OfferState> {
  const ref = clip(form.get("reference"), 20);
  const key = clip(form.get("k"), 40);
  const ctx = await requestContext();
  const db = getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.reference, ref));
  if (!b || b.source !== "waitlist" || !(await mayViewStatus("offer", ref, key, b.familyId))) return { error: "This offer link isn’t valid. Please use the link in your email." };
  let signatures: { templateId: string; childId: string | null; signatureText?: string; consent: boolean; answers?: Record<string, string> }[] = [];
  try {
    const raw = JSON.parse(String(form.get("signatures") ?? "[]"));
    if (Array.isArray(raw)) signatures = raw.slice(0, 20);
  } catch {
    return { error: "Something went wrong reading your signature. Please try again." };
  }
  if ((await careNeededForBooking(db, b.id)).length) return { error: CARE_REQUIRED };
  let url: string;
  try {
    await signForBooking(db, { type: "system", name: "Waitlist offer" }, { bookingId: b.id, signatures, ip: ctx.ip, userAgent: ctx.userAgent });
    url = (await startCheckout(db, { type: "system", name: "Waitlist offer" }, b.id, { base: ctx.baseUrl })).url;
  } catch (e) {
    if (e instanceof OpsError) return { error: e.message };
    throw e;
  }
  redirect(url);
}

/* ── Signing in from inside checkout (the selection stays on the page) ── */

export type CheckoutSignInState = { ok?: boolean; error?: string; message?: string; devLink?: string } | undefined;

/**
 * Whether an email belongs to a Family Portal account, so checkout can ask that family to sign in
 * before they fill everything in. (Booking with that email would require signing in anyway.)
 */
export async function portalEmailCheckAction(email: string): Promise<{ hasPortal: boolean }> {
  if (!isDbConfigured()) return { hasPortal: false };
  const { ip } = await requestContext();
  if (!(await allow(getDb(), "emailCheckIp", ip))) return { hasPortal: false };
  const g = await findGuardianByEmail(getDb(), clip(email, 200));
  return { hasPortal: !!g && (g.portalAccess || !!g.passwordHash) };
}

/** Email and password sign-in without leaving checkout. */
export async function checkoutSignInAction(_: CheckoutSignInState, form: FormData): Promise<CheckoutSignInState> {
  const email = clip(form.get("email"), 200);
  const { baseUrl, ip } = await requestContext();
  try {
    await throttle(getDb(), "familySignInIp", ip, "Too many sign-in attempts from this connection. Please wait 15 minutes and try again.");
    await throttle(getDb(), "familySignInEmail", email, "Too many sign-in attempts for this email. Please wait 15 minutes, or email yourself a sign-in link.");
    const r = await signInWithPassword(getDb(), { email, password: String(form.get("password") ?? ""), baseUrl, ip });
    if ("emailed" in r) return { message: "You haven’t set a password yet. We’ve emailed you a sign-in link; open it, then come back to this page.", devLink: r.devLink };
    await setFamilyCookie(r.session);
    return { ok: true };
  } catch (e) {
    if (e instanceof OpsError) return { error: e.message };
    throw e;
  }
}

/** Emails a sign-in link that brings the family back to this page. */
export async function checkoutEmailLinkAction(email: string, next: string): Promise<CheckoutSignInState> {
  const { baseUrl, ip } = await requestContext();
  const { devLink } = (await allow(getDb(), "signInLinkIp", ip)) ? await requestMagicLink(getDb(), clip(email, 200), baseUrl, safeNextPath(next, "/book")) : { devLink: undefined };
  return { message: "If that email has a Family Portal, a sign-in link is on its way. Open it and you’ll come back here.", devLink };
}
