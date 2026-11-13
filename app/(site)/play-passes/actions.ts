"use server";

import { redirect } from "next/navigation";
import { OpsError } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { billingPortalUrl, startSignup } from "@/lib/playpass/membership";
import { changeTier, requestCancel, requestPause, withdrawCancel, withdrawPause } from "@/lib/playpass/changes";
import { revalidatePath } from "next/cache";
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
