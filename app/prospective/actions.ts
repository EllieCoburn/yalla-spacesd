"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, accessToken, codeMatches } from "@/lib/prospective";

export async function enterPortal(_prev: { error?: string } | undefined, formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const token = accessToken();
  if (!token || !codeMatches(code)) {
    return { error: "That code doesn’t look right. Please check it, or request access below." };
  }
  (await cookies()).set(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
  redirect("/prospective/home");
}

export async function leavePortal() {
  (await cookies()).delete(ACCESS_COOKIE);
  redirect("/prospective");
}
