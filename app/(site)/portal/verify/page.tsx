import type { Metadata } from "next";
import { Mark } from "@/components/brand/Mark";
import { redeemAction } from "../actions";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The link lands here and the guardian presses a button to finish signing in. Using a button
 * (POST) means email link scanners can't use up the single-use token by visiting it.
 */
export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string; next?: string }> }) {
  const { token, next } = await searchParams;
  return (
    <section className="flex min-h-[80svh] items-center pt-28 pb-16">
      <div className="mx-auto w-full max-w-md px-6 text-center">
        <Mark name="arch" className="mx-auto h-12 w-auto text-blue" />
        <h1 className="display mt-8 text-[clamp(2.4rem,2rem+1.5vw,3.2rem)]">
          Welcome <em>back.</em>
        </h1>
        {token ? (
          <form action={redeemAction} className="mt-10">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="next" value={next ?? ""} />
            <button className="h-14 w-full rounded-full bg-ink text-[0.95rem] text-chalk transition-colors duration-500 hover:bg-blue">Continue to your Family Portal</button>
          </form>
        ) : (
          <p className="mt-6 text-ink-soft">This link is incomplete. Request a new one from the sign-in page.</p>
        )}
      </div>
    </section>
  );
}
