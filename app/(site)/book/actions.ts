"use server";

import { getDb, isDbConfigured } from "@/lib/db";
import { joinPublicWaitlist, previewAgreements, retryCheckout, submitPublicBooking, type Agreement, type PublicBookingResult } from "@/lib/ops/public-booking";
import { startCheckout } from "@/lib/ops/bookings";
import { OpsError } from "@/lib/audit";
import { getGuardian, requestContext } from "../portal/session";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { bookings } from "@/lib/db/schema";

export type BookingPayload = {
  guardian: { firstName: string; lastName: string; email: string; phone?: string };
  children: { key: string; existingId?: string | null; firstName: string; lastName: string; birthDate: string; allergies?: string }[];
  lines: { sessionId: string; childKeys: string[]; addons?: Record<string, string[]> }[];
  signatures: { templateId: string; childKey: string | null; signatureText?: string; consent: boolean }[];
};

function clip(s: unknown, n = 200) {
  return String(s ?? "").slice(0, n);
}

export async function submitBookingAction(payload: BookingPayload): Promise<PublicBookingResult> {
  if (!isDbConfigured()) return { ok: false, code: "unavailable", error: "Online booking isn’t open yet." };
  const ctx = await requestContext();
  const signedIn = await getGuardian();
  try {
    return await submitPublicBooking(getDb(), {
      signedIn,
      guardian: { firstName: clip(payload.guardian.firstName, 80), lastName: clip(payload.guardian.lastName, 80), email: clip(payload.guardian.email, 200), phone: clip(payload.guardian.phone, 40) },
      children: payload.children.slice(0, 8).map((c) => ({ key: clip(c.key, 60), existingId: c.existingId ? clip(c.existingId, 60) : null, firstName: clip(c.firstName, 80), lastName: clip(c.lastName, 80), birthDate: clip(c.birthDate, 10), allergies: clip(c.allergies, 500) })),
      lines: payload.lines.slice(0, 60).map((l) => ({
        sessionId: clip(l.sessionId, 60),
        childKeys: l.childKeys.slice(0, 8).map((k) => clip(k, 60)),
        // Add-on keys are checked against the program's offer when the hold is created.
        addons: Object.fromEntries(Object.entries(l.addons ?? {}).slice(0, 8).map(([k, v]) => [clip(k, 60), (Array.isArray(v) ? v : []).slice(0, 4).map((x) => clip(x, 20))])),
      })),
      signatures: payload.signatures.slice(0, 40).map((s) => ({ templateId: clip(s.templateId, 60), childKey: s.childKey ? clip(s.childKey, 60) : null, signatureText: clip(s.signatureText, 120), consent: !!s.consent })),
      meta: { ip: ctx.ip, userAgent: ctx.userAgent },
      baseUrl: ctx.baseUrl,
    });
  } catch (e) {
    console.error("[public booking failed]", (e as Error).message?.slice(0, 200));
    return { ok: false, code: "error", error: "Something went wrong and nothing was booked. Please try again." };
  }
}

export async function agreementsAction(input: { sessionIds: string[]; children: { key: string; existingId?: string | null; firstName: string }[] }): Promise<Agreement[]> {
  if (!isDbConfigured()) return [];
  const signedIn = await getGuardian();
  return previewAgreements(getDb(), { familyId: signedIn?.familyId ?? null, sessionIds: input.sessionIds.slice(0, 60), children: input.children.slice(0, 8) });
}

export async function joinWaitlistAction(input: { sessionId: string; guardian: { firstName: string; lastName: string; email: string }; child: { existingId?: string | null; firstName: string; birthDate: string } }) {
  if (!isDbConfigured()) return { ok: false as const, code: "unavailable", error: "The waitlist isn’t open yet." };
  const ctx = await requestContext();
  return joinPublicWaitlist(getDb(), { signedIn: await getGuardian(), guardian: input.guardian, child: input.child, sessionId: clip(input.sessionId, 60), baseUrl: ctx.baseUrl });
}

/** Retry a declined payment while the hold is still valid. */
export async function retryPaymentAction(form: FormData) {
  const ref = clip(form.get("reference"), 20);
  const ctx = await requestContext();
  let url: string;
  try {
    url = (await retryCheckout(getDb(), ref, ctx.baseUrl)).url;
  } catch (e) {
    if (e instanceof OpsError) redirect(`/book/confirmation/${ref}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(url);
}

/** Accept a waitlist offer: continue to payment for the held spot. */
export async function acceptOfferAction(form: FormData) {
  const ref = clip(form.get("reference"), 20);
  const ctx = await requestContext();
  const db = getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.reference, ref));
  if (!b || b.source !== "waitlist") redirect(`/book/offer/${ref}`);
  let url: string;
  try {
    url = (await startCheckout(db, { type: "system", name: "Waitlist offer" }, b.id, { base: ctx.baseUrl })).url;
  } catch (e) {
    if (e instanceof OpsError) redirect(`/book/offer/${ref}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(url);
}
