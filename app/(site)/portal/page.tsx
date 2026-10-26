import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { WindowField } from "@/components/brand/WindowField";
import { SignInForm } from "@/components/portal/PortalForms";
import { isDbConfigured } from "@/lib/db";
import { getGuardian } from "./session";

export const metadata: Metadata = {
  title: "Family Portal",
  description: "Sign in to manage your children’s profiles, forms, bookings and payments at Yalla.",
};
export const dynamic = "force-dynamic";

export default async function PortalSignIn({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string }> }) {
  const sp = await searchParams;
  const configured = isDbConfigured();
  if (configured && (await getGuardian())) redirect(sp.next?.startsWith("/book") ? sp.next : "/portal/home");

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
          <p className="mt-5 text-ink-soft">Children’s profiles, forms, upcoming bookings and payments, all in one place.</p>
          {sp.expired ? <p className="mt-6 border-l-2 border-oxblood/40 pl-4 text-[0.88rem] text-oxblood">That link has expired or was already used. Request a new one below.</p> : null}

          {configured ? (
            <>
              <SignInForm next={sp.next} />
              <p className="mt-4 text-[0.8rem] text-ink-soft">No passwords to remember. Each guardian signs in with their own email.</p>
            </>
          ) : (
            <div className="mt-12 border-t border-line pt-8">
              <p className="text-[0.85rem] text-oxblood">Preview: sign-in isn’t connected on this deployment.</p>
              <Link href="/portal/home" className="mt-3 inline-flex items-center gap-2 text-[0.95rem] text-blue underline-offset-4 hover:underline">
                Explore the portal with a sample family →
              </Link>
            </div>
          )}

          <p className="mt-10 text-[0.9rem] text-ink-soft">
            Considering Yalla?{" "}
            <Link href="/membership" className="text-ink underline underline-offset-4">
              Membership & tuition
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
