import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getDb, isDbConfigured } from "@/lib/db";
import { eq } from "drizzle-orm";
import { families, guardians, spaceEntitlements } from "@/lib/db/schema";
import { FAMILY_SESSION_MS, resolveFamilySession, type GuardianContext } from "@/lib/family-auth";
import { PORTAL_OPEN_PREVIEW, previewGuardian } from "@/lib/portal-preview";

export const FAMILY_COOKIE = "yalla_family";

export const getGuardian = cache(async () => {
  if (!isDbConfigured()) return null;
  const token = (await cookies()).get(FAMILY_COOKIE)?.value;
  return resolveFamilySession(getDb(), token);
});

/**
 * The family the portal acts for. While the open preview is on (lib/portal-preview.ts), visitors
 * who aren't signed in act as a made-up "Sample family" so every page works without a login.
 * The sample family can't sign in (no portal access) and is marked as sample data.
 */
export const getPortalGuardian = cache(async (): Promise<{ guardian: GuardianContext | null; preview: boolean }> => {
  const real = await getGuardian();
  if (real || !PORTAL_OPEN_PREVIEW || !isDbConfigured()) return { guardian: real, preview: false };
  return { guardian: await previewFamilyGuardian(getDb()), preview: true };
});

const PREVIEW_EMAIL = "portal-preview@yalla.invalid";

async function previewFamilyGuardian(db: ReturnType<typeof getDb>): Promise<GuardianContext> {
  let [row] = await db.select({ g: guardians, f: families }).from(guardians).innerJoin(families, eq(families.id, guardians.familyId)).where(eq(guardians.email, PREVIEW_EMAIL));
  if (!row) {
    await db.transaction(async (tx) => {
      const [f] = await tx.insert(families).values({ name: previewGuardian.familyName, isSample: true }).returning();
      await tx
        .insert(guardians)
        .values({ familyId: f.id, firstName: previewGuardian.firstName, lastName: "Sample", email: PREVIEW_EMAIL, isPrimary: true, canBook: true, canViewBilling: true, portalAccess: false })
        .onConflictDoNothing();
      // So complimentary workspace time can be tried in the preview.
      await tx.insert(spaceEntitlements).values({ familyId: f.id, mode: "grant", note: "Portal preview sample family" });
    });
    [row] = await db.select({ g: guardians, f: families }).from(guardians).innerJoin(families, eq(families.id, guardians.familyId)).where(eq(guardians.email, PREVIEW_EMAIL));
  }
  return {
    sessionId: "preview",
    guardianId: row.g.id,
    familyId: row.f.id,
    familyName: row.f.name,
    firstName: row.g.firstName,
    lastName: row.g.lastName,
    email: row.g.email,
    canBook: true,
    canViewBilling: true,
    canViewSensitive: false,
  };
}

export async function setFamilyCookie(token: string) {
  (await cookies()).set(FAMILY_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(FAMILY_SESSION_MS / 1000),
  });
}

export async function clearFamilyCookie() {
  (await cookies()).delete(FAMILY_COOKIE);
}

export async function requestContext() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return {
    baseUrl: process.env.PUBLIC_BASE_URL ?? `${proto}://${host}`,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}
