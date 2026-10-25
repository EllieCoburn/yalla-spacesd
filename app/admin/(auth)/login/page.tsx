import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth/session";
import { staffCount } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { LoginForm } from "../AuthForms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; setup?: string }> }) {
  const sp = await searchParams;
  if ((await staffCount(getDb())) === 0) redirect("/admin/setup");
  const staff = await getStaff();
  if (staff && (!staff.mfaEnabled || staff.mfaVerified)) redirect("/admin");
  return (
    <>
      <h1 className="mt-8 font-serif text-[2rem] text-ink lg:mt-0">Staff sign in</h1>
      <p className="mt-2 mb-8 text-[0.9rem] text-ink-soft">For the Yalla team only. Families sign in through the Family Portal.</p>
      {sp.reset ? <p className="mb-4 rounded-lg bg-[#e6f0ea] px-3 py-2 text-[0.85rem] text-[#2c6447]">Your password was reset. Sign in with the new one.</p> : null}
      {sp.setup ? <p className="mb-4 rounded-lg bg-[#e6f0ea] px-3 py-2 text-[0.85rem] text-[#2c6447]">Owner account created. Sign in to finish setting up two-step verification.</p> : null}
      <LoginForm next={sp.next?.startsWith("/admin") ? sp.next : undefined} />
    </>
  );
}
