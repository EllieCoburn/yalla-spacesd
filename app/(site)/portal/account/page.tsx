import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SetPasswordForm } from "@/components/portal/PortalForms";
import { getDb, isDbConfigured } from "@/lib/db";
import { hasPassword } from "@/lib/family-auth";
import { signOutAction } from "../actions";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const sp = await searchParams;
  const g = isDbConfigured() ? await getGuardian() : null;
  if (!g) redirect("/portal?next=/portal/account");
  const has = await hasPassword(getDb(), g.guardianId);

  return (
    <section className="pt-32 pb-24 lg:pt-40">
      <div className="shell">
        <div className="mx-auto max-w-xl">
          <Link href="/portal/home" className="eyebrow text-ink-soft hover:text-ink">
            ← Family Portal
          </Link>
          <h1 className="display mt-6 text-[clamp(2.4rem,2rem+2vw,3.4rem)]">
            Your <em>account.</em>
          </h1>
          <p className="mt-4 text-ink-soft">
            Signed in as {g.firstName} {g.lastName} · {g.email}
          </p>

          {!has || sp.welcome ? (
            <p role="status" className="mt-8 border-l-2 border-blue/40 pl-4 text-[0.92rem]">
              {has ? "Welcome back. You can change your password below." : "Welcome! Choose a password so you can sign in with your email and password from now on."}
            </p>
          ) : null}

          <div className="mt-10 border-t border-line pt-8">
            <p className="display text-[1.5rem]">{has ? "Change your password" : "Set your password"}</p>
            <div className="mt-6">
              <SetPasswordForm hasPassword={has} />
            </div>
          </div>

          <div className="mt-12 border-t border-line pt-8">
            <p className="display text-[1.5rem]">Sign out</p>
            <p className="mt-1 text-[0.9rem] text-ink-soft">You stay signed in on this device until you sign out.</p>
            <form action={signOutAction} className="mt-5">
              <button className="h-11 rounded-full border border-ink/25 px-6 text-[0.88rem] hover:border-ink">Sign out</button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
