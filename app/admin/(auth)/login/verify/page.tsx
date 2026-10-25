import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth/session";
import { VerifyForm } from "../../AuthForms";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function VerifyPage() {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");
  if (!staff.mfaEnabled || staff.mfaVerified) redirect("/admin");
  return (
    <>
      <h1 className="mt-8 font-serif text-[2rem] text-ink lg:mt-0">Two-step verification</h1>
      <p className="mt-2 mb-8 text-[0.9rem] text-ink-soft">Enter the code from your authenticator app for {staff.email}.</p>
      <VerifyForm />
    </>
  );
}
