"use server";

import { redirect } from "next/navigation";
import { OpsError } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { billingPortalUrl, startGuestSignup, startSignup } from "@/lib/playpass/membership";
import { changeTier, requestCancel, requestPause, withdrawCancel, withdrawPause } from "@/lib/playpass/changes";
import { revalidatePath } from "next/cache";
import { getGuardian, requestContext } from "../portal/session";
import { throttle } from "@/lib/rate-limit";

export type PassState = { error?: string; message?: string; devLink?: string; at?: number } | undefined;

/** Start the Play Pass checkout for the signed-in family. Prices are worked out on the server. */
export async function startPlayPassAction(_: PassState, form: FormData): Promise<PassState> {
  const g = await getGuardian();
  if (!g) return { error: "Please sign in to continue.", at: Date.now() };
  const { baseUrl, ip } = await requestContext();
  let url: string;
  try {
    await throttle(getDb(), "playPassIp", ip);
    ({ url } = await startSignup(getDb(), g, { tier: String(form.get("tier") ?? ""), acceptTerms: form.get("accept") === "on", baseUrl }));
  } catch (e) {
    if (e instanceof OpsError) return { error: e.message, at: Date.now() };
    throw e;
  }
  redirect(url);
}

/** A family new to Yalla buys a Play Pass; their Family Portal opens once the payment goes through. */
export async function startGuestPlayPassAction(_: PassState, form: FormData): Promise<PassState> {
  if (await getGuardian()) return startPlayPassAction(_, form);
  const { baseUrl, ip } = await requestContext();
  const f = (k: string, n = 80) => String(form.get(k) ?? "").slice(0, n);
  const firsts = form.getAll("childFirstName").map(String);
  const lasts = form.getAll("childLastName").map(String);
  const births = form.getAll("childBirthDate").map(String);
  // "no" = none known; "yes" = the details typed beside it.
  const care = (kind: string, i: number) => {
    const yn = String(form.getAll(`child${kind}Answer`)[i] ?? "");
    const text = String(form.getAll(`child${kind}`)[i] ?? "").slice(0, 1000).trim();
    return yn === "no" ? "" : yn === "yes" && text ? text : null;
  };
  let url: string;
  try {
    await throttle(getDb(), "playPassIp", ip);
    ({ url } = await startGuestSignup(getDb(), {
      tier: f("tier"),
      acceptTerms: form.get("accept") === "on",
      baseUrl,
      guardian: { firstName: f("firstName"), lastName: f("lastName"), email: f("email", 200), phone: f("phone", 40) },
      children: firsts.slice(0, 8).map((n, i) => ({ firstName: n.slice(0, 80), lastName: (lasts[i] ?? "").slice(0, 80), birthDate: births[i] ?? "", allergies: care("Allergies", i), medications: care("Medications", i) })),
    }));
  } catch (e) {
    if (e instanceof OpsError) return { error: e.message, at: Date.now() };
    throw e;
  }
  redirect(url);
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

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

/** 30 days' notice to cancel. */
export async function cancelPassAction(_: PassState): Promise<PassState> {
  return guarded(async (g) => {
    const r = await requestCancel(getDb(), g);
    revalidatePath("/portal/play-pass");
    return `We’ve received your notice. Your Play Pass stays active until ${longDate(r.endOn)}.${r.final ? ` Your prorated final payment of ${money(r.final.chargeCents)} is charged on the 1st of that month.` : ""}`;
  });
}

export async function undoCancelAction(_: PassState): Promise<PassState> {
  return guarded(async (g) => {
    await withdrawCancel(getDb(), g);
    revalidatePath("/portal/play-pass");
    return "Your Play Pass will keep going.";
  });
}

/** Upgrade now, or downgrade with 30 days' notice. */
export async function changeTierAction(_: PassState, form: FormData): Promise<PassState> {
  return guarded(async (g) => {
    const r = await changeTier(getDb(), g, String(form.get("tier") ?? ""));
    revalidatePath("/portal/play-pass");
    return r.kind === "upgrade"
      ? `Upgraded. ${money(r.chargeCents)} for the rest of this month is being charged, and ${money(r.allocationCents)} more is added to your balance once it goes through.`
      : r.kind === "downgrade"
        ? `Saved. Your new pass starts ${longDate(r.startsOn)}, after 30 days’ notice.`
        : "Your pass stays as it is.";
  });
}

export async function pausePassAction(_: PassState, form: FormData): Promise<PassState> {
  return guarded(async (g) => {
    const r = await requestPause(getDb(), g, { startOn: String(form.get("startOn") ?? ""), days: Number(form.get("days") ?? 0) });
    revalidatePath("/portal/play-pass");
    return `Your pause is scheduled. Your Play Pass reactivates automatically on ${longDate(r.resumeOn)}.`;
  });
}

export async function undoPauseAction(_: PassState): Promise<PassState> {
  return guarded(async (g) => {
    await withdrawPause(getDb(), g);
    revalidatePath("/portal/play-pass");
    return "Your pause has been cancelled.";
  });
}

export async function billingPortalAction() {
  const g = await getGuardian();
  if (!g) redirect("/portal?signin=1&next=/portal/play-pass");
  const { baseUrl } = await requestContext();
  const url = await billingPortalUrl(getDb(), g, `${baseUrl}/portal/play-pass`).catch(() => null);
  redirect(url ?? "/portal/play-pass?portal=unavailable");
}
