import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { staffCount } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { SetupForm } from "../AuthForms";

export const metadata: Metadata = { title: "First-time setup" };

export default async function SetupPage() {
  if ((await staffCount(getDb())) > 0) redirect("/admin/login");
  return (
    <>
      <h1 className="mt-8 font-serif text-[2rem] text-ink lg:mt-0">Set up Yalla Admin</h1>
      <p className="mt-2 mb-8 text-[0.9rem] text-ink-soft">Create the first owner account. This page disappears once any staff account exists.</p>
      <SetupForm />
    </>
  );
}
