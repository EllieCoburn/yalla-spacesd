import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/brand/Mark";
import { WindowField } from "@/components/brand/WindowField";

export const metadata: Metadata = {
  title: "Family Portal",
  description: "Sign in to manage your children’s profiles, forms, bookings and payments at Yalla.",
};

export default function PortalSignIn() {
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

          <form className="mt-10 space-y-6" action="/portal/home">
            <label className="block">
              <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Email</span>
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                className="w-full border-0 border-b border-ink/20 bg-transparent px-0 py-3 text-[1.05rem] placeholder:text-ink/25 focus:border-blue focus:ring-0 focus:outline-none"
              />
            </label>
            <button className="h-14 w-full rounded-full bg-ink text-[0.95rem] text-chalk transition-colors duration-500 hover:bg-blue">
              Email me a sign-in link
            </button>
          </form>
          <p className="mt-4 text-[0.8rem] text-ink-soft">No passwords to remember. We’ll send a secure link to your inbox.</p>

          <div className="mt-12 border-t border-line pt-8">
            <p className="text-[0.85rem] text-oxblood">Preview: sign-in isn’t connected yet.</p>
            <Link href="/portal/home" className="mt-3 inline-flex items-center gap-2 text-[0.95rem] text-blue underline-offset-4 hover:underline">
              Explore the portal with a sample family →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
