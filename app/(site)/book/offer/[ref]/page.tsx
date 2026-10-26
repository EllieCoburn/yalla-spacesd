import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { getDb, isDbConfigured } from "@/lib/db";
import { bookingStatusView } from "@/lib/ops/public-booking";
import { fmtDateTime } from "@/lib/time";
import { acceptOfferAction } from "../../actions";

export const metadata: Metadata = { title: "Your waitlist offer", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Offer({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ error?: string }> }) {
  const { ref } = await params;
  const { error } = await searchParams;
  if (!isDbConfigured()) notFound();
  const v = await bookingStatusView(getDb(), ref);
  if (!v || v.source !== "waitlist") notFound();
  const open = (v.status === "held" || v.status === "pending_payment") && !!v.holdExpiresAt && new Date(v.holdExpiresAt) > new Date();

  return (
    <section className="pt-32 pb-28 lg:pt-40">
      <div className="shell">
        <div className="mx-auto max-w-xl text-center">
          <Mark name="sun" className="mx-auto h-12 w-12 text-blue" />
          {v.status === "confirmed" ? (
            <>
              <h1 className="display mt-8 text-[clamp(2.4rem,1.8rem+2vw,3.4rem)]">
                You’re <em>booked.</em>
              </h1>
              <p className="mt-4 text-ink-soft">This offer has been accepted and confirmed.</p>
            </>
          ) : open ? (
            <>
              <h1 className="display mt-8 text-[clamp(2.4rem,1.8rem+2vw,3.4rem)]">
                A spot opened <em>for you.</em>
              </h1>
              <p className="mt-4 text-ink-soft">We’re holding it until {fmtDateTime(v.holdExpiresAt!)}. Nothing is charged until you accept and pay.</p>
            </>
          ) : (
            <>
              <h1 className="display mt-8 text-[clamp(2.4rem,1.8rem+2vw,3.4rem)]">
                This offer <em>has ended.</em>
              </h1>
              <p className="mt-4 text-ink-soft">The hold expired and the spot has been released. You can check current availability or rejoin the waitlist.</p>
            </>
          )}
          {error ? <p className="mt-4 text-[0.88rem] text-oxblood">{error}</p> : null}
        </div>
        <div className="mx-auto mt-10 max-w-xl bg-paper p-7">
          <ul className="divide-y divide-line">
            {v.lines.map((l) => (
              <li key={l.id} className="py-3 text-[0.92rem]">
                {l.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-10 flex justify-center gap-3">
          {open ? (
            <form action={acceptOfferAction}>
              <input type="hidden" name="reference" value={v.reference} />
              <button className="h-12 rounded-full bg-ink px-7 text-[0.9rem] text-chalk hover:bg-blue">Accept and pay</button>
            </form>
          ) : null}
          <Link href="/book" className="inline-flex h-12 items-center rounded-full border border-ink/25 px-7 text-[0.9rem] hover:border-ink">
            See availability
          </Link>
        </div>
      </div>
    </section>
  );
}
