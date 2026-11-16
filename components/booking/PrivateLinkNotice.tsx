import Link from "next/link";
import { Mark } from "@/components/brand/Mark";

/** Shown when a booking or invoice page is opened without its private link or a matching sign-in. */
export function PrivateLinkNotice({ what = "booking" }: { what?: string }) {
  return (
    <section className="flex min-h-[70vh] items-center justify-center px-6 pt-32 pb-20">
      <div className="max-w-md text-center">
        <Mark name="arch" className="mx-auto h-12 w-auto text-blue" />
        <h1 className="display mt-8 text-[2.2rem]">This {what} is private.</h1>
        <p className="mt-4 text-ink-soft">To keep children’s details safe, please open the link from your confirmation email, or sign in to your Family Portal to see your bookings.</p>
        <Link href="/portal" className="mt-8 inline-flex h-12 items-center rounded-full bg-ink px-7 text-[0.9rem] text-chalk hover:bg-blue">
          Sign in to your Family Portal
        </Link>
      </div>
    </section>
  );
}
