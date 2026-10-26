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
      <div className="mb-6 rounded-lg bg-ink/5 p-3 text-[0.78rem] text-ink-soft">
        <p>
          This deployment: <strong className="text-ink">{process.env.VERCEL_ENV === "production" ? "Production" : process.env.VERCEL_ENV === "preview" ? "Preview" : "Local"}</strong>
          {process.env.VERCEL_GIT_COMMIT_SHA ? <> · version {process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}</> : null}
        </p>
        <p className="mt-1">
          ADMIN_SETUP_TOKEN: <strong className={process.env.ADMIN_SETUP_TOKEN ? "text-[#2c6447]" : "text-[#8a2333]"}>{process.env.ADMIN_SETUP_TOKEN ? "found ✓" : "not found ✕"}</strong> · AUTH_SECRET:{" "}
          <strong className={(process.env.AUTH_SECRET ?? "").length >= 32 ? "text-[#2c6447]" : "text-[#8a2333]"}>
            {(process.env.AUTH_SECRET ?? "").length >= 32 ? "found ✓" : process.env.AUTH_SECRET ? "too short (needs 32+ characters) ✕" : "not found ✕"}
          </strong>
        </p>
        {!process.env.ADMIN_SETUP_TOKEN ? (
          <p className="mt-1">
            In Vercel, make sure the variable is ticked for <strong>{process.env.VERCEL_ENV === "production" ? "Production" : "Preview"}</strong>, then redeploy and open the newest deployment.
          </p>
        ) : null}
      </div>
      <SetupForm />
    </>
  );
}
