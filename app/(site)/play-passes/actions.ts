"use server";

import { redirect } from "next/navigation";
import { OpsError } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { requestMagicLink } from "@/lib/family-auth";
import { createFamily, findGuardianByEmail } from "@/lib/ops/families";
import { billingPortalUrl, changePlan, setRenewal, startSignup } from "@/lib/playpass/membership";
import { getGuardian, requestContext } from "../portal/session";

export type PassState = { error?: string; message?: string; devLink?: string; at?: number } | undefined;

/** Start the Play Pass checkout for the signed-in family. Prices are worked out on the server. */
export async function startPlayPassAction(_: PassState, form: FormData): Promise<PassState> {
  const g = await getGuardian();
  if (!g) return { error: "Please sign in to continue.", at: Date.now() };
  const { baseUrl } = await requestContext();
  let url: string;
  try {
    ({ url } = await startSignup(getDb(), g, { tier: String(form.get("tier") ?? ""), acceptTerms: form.get("accept") === "on", baseUrl }));
  } catch (e) {
    if (e instanceof OpsError) return { error: e.message, at: Date.now() };
    throw e;
  }
  redirect(url);
}

/** New families: create the account, then confirm the email with a sign-in link back to the pass. */
export async function createAccountAction(_: PassState, form: FormData): Promise<PassState> {
  const db = getDb();
  const tier = String(form.get("tier") ?? "");
  const next = `/play-passes/join?plan=${encodeURIComponent(tier)}`;
  const email = String(form.get("email") ?? "").trim().slice(0, 200);
  const { baseUrl } = await requestContext();
  if (!(await findGuardianByEmail(db, email))) {
    try {
      await createFamily(db, { type: "system", name: "Play Pass signup" }, {
        guardian: { firstName: String(form.get("firstName") ?? "").slice(0, 80), lastName: String(form.get("lastName") ?? "").slice(0, 80), email, phone: String(form.get("phone") ?? "").slice(0, 40) },
      });
    } catch (e) {
      if (e instanceof OpsError) return { error: e.message, at: Date.now() };
      throw e;
    }
  }
  const { devLink } = await requestMagicLink(db, email, baseUrl, next);
  return { message: "Check your email for a link to continue. It works once, for 20 minutes.", devLink, at: Date.now() };
}

/* ── Managing an existing Play Pass (Family Portal) ── */

async function guarded(fn: (g: NonNullable<Awaited<ReturnType<typeof getGuardian>>>) => Promise<string | void>): Promise<PassState> {
  const g = await getGuardian();
  if (!g) return { error: "Please sign in to manage your Play Pass.", at: Date.now() };
  try {
    const message = await fn(g);
    return { message: message ?? "Saved.", at: Date.now() };
  } catch (e) {
    if (e instanceof OpsError) return { error: e.message, at: Date.now() };
    throw e;
  }
}

export async function setRenewalAction(_: PassState, form: FormData): Promise<PassState> {
  const renew = form.get("renew") === "1";
  return guarded(async (g) => {
    await setRenewal(getDb(), g, renew);
    return renew ? "Your Play Pass will keep renewing." : "Your Play Pass won’t renew. Your balance stays in your wallet.";
  });
}

export async function changePlanAction(_: PassState, form: FormData): Promise<PassState> {
  return guarded(async (g) => {
    await changePlan(getDb(), g, String(form.get("tier") ?? ""));
    return "Saved. Your change takes effect at your next renewal.";
  });
}

export async function billingPortalAction() {
  const g = await getGuardian();
  if (!g) redirect("/portal?signin=1&next=/portal/play-pass");
  const { baseUrl } = await requestContext();
  const url = await billingPortalUrl(getDb(), g, `${baseUrl}/portal/play-pass`).catch(() => null);
  redirect(url ?? "/portal/play-pass?portal=unavailable");
}
