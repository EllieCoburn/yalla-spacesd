import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PORTAL_OPEN_PREVIEW } from "@/lib/portal-preview";
import { Mark } from "@/components/brand/Mark";
import { WindowField } from "@/components/brand/WindowField";
import { PasswordSignInForm, SignInForm } from "@/components/portal/PortalForms";
import { isDbConfigured } from "@/lib/db";
import { safeNextPath } from "@/lib/family-auth";
import { getGuardian } from "./session";

export const metadata: Metadata = {
  title: "Family Portal",
  description: "Sign in to manage your children’s profiles, forms, bookings and payments at Yalla.",
};
export const dynamic = "force-dynamic";

export default async function PortalSignIn({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string; signin?: string }> }) {
  const sp = await searchParams;
  const configured = isDbConfigured();
  if (configured && (await getGuardian())) redirect(safeNextPath(sp.next));
  // While the open preview is on, skip sign-in unless someone asks for it (?signin=1 or an expired link).
  if (PORTAL_OPEN_PREVIEW && !sp.signin && !sp.expired) redirect(sp.next && /^\/portal\//.test(sp.next) ? sp.next : "/portal/home");

  return (
    <section className="grid min-h-[100svh] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <WindowField seed={5} width={900} height={1100} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-chalk px-14 py-16 text-center">
            <Mark name="mark" className="mx-auto h-40 w-auto text-blue" />
            <p className="display mt-8 text-[1.8rem]">
              Welcome <em>home.</em>
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center pt-28 pb-16 lg:pt-24">
        <div className="mx-auto w-full max-w-md px-6">
          <p className="eyebrow text-ink-soft">Family Portal</p>
          <h1 className="display mt-6 text-[clamp(2.6rem,2rem+2vw,3.6rem)]">
            Sign in to <em>your family.</em>
          </h1>
          <p className="mt-5 text-ink-soft">Children’s profiles, forms, upcoming bookings and payments, all in one place. You’ll stay signed in on this device until you sign out.</p>
          {sp.expired ? <p className="mt-6 border-l-2 border-oxblood/40 pl-4 text-[0.88rem] text-oxblood">That link has expired or was already used. Sign in with your password, or request a new link below.</p> : null}

          {configured ? (
            <>
              <PasswordSignInForm next={sp.next} />
              <p className="mt-8 text-[0.95rem]">
                New to Yalla?{" "}
                <Link href={`/portal/join${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="text-blue underline underline-offset-4">
                  Create your family account
                </Link>
              </p>
              <details className="mt-6 border-t border-line pt-5">
                <summary className="cursor-pointer text-[0.88rem] text-ink-soft hover:text-ink">Forgot your password, or never set one?</summary>
                <p className="mt-3 text-[0.85rem] text-ink-soft">We’ll email you a link to sign in and choose a new password.</p>
                <SignInForm next="/portal/account" />
              </details>
            </>
          ) : (
            <div className="mt-12 border-t border-line pt-8">
              <p className="text-ink-soft">Family sign-in opens soon. In the meantime, we’re happy to help at hello@yallaspacesd.com.</p>
            </div>
          )}

          <p className="mt-10 text-[0.9rem] text-ink-soft">
            Considering Yalla?{" "}
            <Link href="/programs" className="text-ink underline underline-offset-4">
              Explore programs
            </Link>{" "}
            or{" "}
            <Link href="/club-yalla" className="text-ink underline underline-offset-4">
              Club Yalla
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
