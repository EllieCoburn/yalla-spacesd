import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getDb, isDbConfigured } from "@/lib/db";
import { FAMILY_SESSION_MS, resolveFamilySession } from "@/lib/family-auth";

export const FAMILY_COOKIE = "yalla_family";

export const getGuardian = cache(async () => {
  if (!isDbConfigured()) return null;
  const token = (await cookies()).get(FAMILY_COOKIE)?.value;
  return resolveFamilySession(getDb(), token);
});

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
