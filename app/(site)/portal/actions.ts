"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OpsError } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { redeemMagicLink, registerFamilyAccount, requestMagicLink, revokeFamilySession, safeNextPath, setFamilyPassword, signInWithPassword } from "@/lib/family-auth";
import { familyCancelItem, familySignForm, familyUpdateCare } from "@/lib/ops/public-booking";
import { clearFamilyCookie, getGuardian, requestContext, setFamilyCookie } from "./session";

export type PortalState = { ok?: boolean; error?: string; message?: string; devLink?: string; at?: number } | undefined;

const safeNext = (n: unknown) => safeNextPath(n);

export async function requestLinkAction(_: PortalState, form: FormData): Promise<PortalState> {
  const email = String(form.get("email") ?? "").slice(0, 200);
  const next = safeNext(form.get("next"));
  const { baseUrl } = await requestContext();
  const { devLink } = await requestMagicLink(getDb(), email, baseUrl, next);
  return {
    ok: true,
    message: "If that email belongs to a Yalla family, a sign-in link is on its way. It works once, for 20 minutes.",
    devLink: devLink ? (devLink.includes("&next=") ? devLink : `${devLink}&next=${encodeURIComponent(next)}`) : undefined,
    at: Date.now(),
  };
}

export async function redeemAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const next = safeNext(form.get("next"));
  const session = await redeemMagicLink(getDb(), token);
  if (!session) redirect("/portal?expired=1");
  await setFamilyCookie(session);
  redirect(next);
}

/** Email and password sign-in. Stays signed in on this browser until signing out. */
export async function signInAction(_: PortalState, form: FormData): Promise<PortalState> {
  const next = safeNext(form.get("next"));
  const { baseUrl, ip } = await requestContext();
  let session: string;
  try {
    const r = await signInWithPassword(getDb(), { email: String(form.get("email") ?? "").slice(0, 200), password: String(form.get("password") ?? ""), baseUrl, ip });
    if ("emailed" in r)
      return {
        ok: true,
        message: "You haven’t set a password yet. We’ve emailed you a link to set one. It works once, for 20 minutes.",
        devLink: r.devLink,
        at: Date.now(),
      };
    session = r.session;
  } catch (e) {
    if (e instanceof OpsError) return { ok: false, error: e.message, at: Date.now() };
    throw e;
  }
  await setFamilyCookie(session);
  redirect(next);
}

/** Create a family account (guardian, password and children) and sign in. */
export async function createAccountAction(_: PortalState, form: FormData): Promise<PortalState> {
  const next = safeNext(form.get("next"));
  const { baseUrl } = await requestContext();
  const names = form.getAll("childFirstName").map(String);
  const births = form.getAll("childBirthDate").map(String);
  let session: string;
  try {
    const r = await registerFamilyAccount(
      getDb(),
      {
        firstName: String(form.get("firstName") ?? "").slice(0, 80),
        lastName: String(form.get("lastName") ?? "").slice(0, 80),
        email: String(form.get("email") ?? "").slice(0, 200),
        password: String(form.get("password") ?? ""),
        children: names.slice(0, 12).map((n, i) => ({ firstName: n.slice(0, 80), birthDate: births[i] ?? "" })),
      },
      baseUrl,
    );
    if ("emailed" in r)
      return {
        ok: true,
        message: "Yalla already has this email from an earlier booking. To keep your family’s details safe, we’ve emailed you a link to finish setting up your account.",
        devLink: r.devLink,
        at: Date.now(),
      };
    session = r.session;
  } catch (e) {
    if (e instanceof OpsError) return { ok: false, error: e.message, at: Date.now() };
    throw e;
  }
  await setFamilyCookie(session);
  redirect(next);
}

export async function setPasswordAction(_: PortalState, form: FormData): Promise<PortalState> {
  return run(async () => {
    const g = await guardianOrFail();
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) throw new OpsError("invalid", "The two passwords don’t match.");
    await setFamilyPassword(getDb(), g, password);
    return "Password saved. You can now sign in with your email and password.";
  });
}

export async function signOutAction() {
  const g = await getGuardian();
  if (g) await revokeFamilySession(getDb(), g.sessionId);
  await clearFamilyCookie();
  redirect("/portal");
}

async function run(fn: () => Promise<string>): Promise<PortalState> {
  try {
    const message = await fn();
    revalidatePath("/portal/home");
    return { ok: true, message, at: Date.now() };
  } catch (e) {
    if (e instanceof OpsError) return { ok: false, error: e.message, at: Date.now() };
    console.error("[portal action failed]", (e as Error).message?.slice(0, 200));
    return { ok: false, error: "Something went wrong and nothing was changed. Please try again.", at: Date.now() };
  }
}

async function guardianOrFail() {
  const g = await getGuardian();
  if (!g) throw new OpsError("signed_out", "Your session has ended. Please sign in again.");
  return g;
}

export async function updateCareAction(_: PortalState, form: FormData): Promise<PortalState> {
  return run(async () => {
    const g = await guardianOrFail();
    await familyUpdateCare(getDb(), g, String(form.get("childId")), {
      allergies: String(form.get("allergies") ?? "").slice(0, 1000),
      medicalNotes: String(form.get("medicalNotes") ?? "").slice(0, 2000),
      careNotes: String(form.get("careNotes") ?? "").slice(0, 2000),
    });
    return "Saved. Yalla’s team will see the update.";
  });
}

export async function cancelItemAction(_: PortalState, form: FormData): Promise<PortalState> {
  return run(async () => {
    const g = await guardianOrFail();
    await familyCancelItem(getDb(), g, String(form.get("itemId")));
    return "Cancelled. If a refund or credit applies, Yalla will confirm it separately.";
  });
}

export async function signFormAction(_: PortalState, form: FormData): Promise<PortalState> {
  return run(async () => {
    const g = await guardianOrFail();
    const ctx = await requestContext();
    await familySignForm(getDb(), g, {
      templateId: String(form.get("templateId")),
      childId: form.get("childId") ? String(form.get("childId")) : null,
      signatureText: String(form.get("signatureText") ?? "").slice(0, 120),
      consent: form.get("consent") === "on",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return "Thank you — received.";
  });
}
