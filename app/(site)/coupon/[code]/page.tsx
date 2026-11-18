import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { CopyCode } from "@/components/site/CopyCode";
import { Button } from "@/components/ui/primitives";
import { getDb, isDbConfigured } from "@/lib/db";
import { discounts, programs } from "@/lib/db/schema";
import { normalizeCode } from "@/lib/ops/coupons";
import { todayLA } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Yalla code", robots: { index: false } };

/** Where an email's "Copy code" button lands: the code with a one-tap copy, and where to use it. */
export default async function CouponPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode(decodeURIComponent((await params).code)).slice(0, 30);
  const [d] = isDbConfigured() ? await getDb().select().from(discounts).where(eq(discounts.code, code)) : [];
  const today = todayLA();
  const live = !!d && d.active && (!d.startsOn || d.startsOn <= today) && (!d.endsOn || d.endsOn >= today);
  const [prog] = live && d.programId ? await getDb().select().from(programs).where(eq(programs.id, d.programId)) : [];
  const what = d ? (d.kind === "percent" ? `${d.value}% off` : `$${(d.value / 100).toFixed(d.value % 100 ? 2 : 0)} off`) : "";
  const book = prog ? `/programs/${prog.slug}?coupon=${code}#dates` : `/book?coupon=${code}`;
  return (
    <section className="pt-36 pb-24 lg:pt-44">
      <div className="shell text-center">
        {live ? (
          <>
            <h1 className="display text-[clamp(2.2rem,1.6rem+2vw,3.4rem)]">
              {what} <em>{prog ? `your next ${prog.name} booking` : "your next booking"}.</em>
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-ink-soft">
              Copy your code, then enter it under “Coupon code” when you book.{d.oncePerFamily ? " It can be used once per family." : ""}
            </p>
            <div className="mt-10">
              <CopyCode code={code} />
            </div>
            <div className="mt-10">
              <Button href={book} size="lg">
                {prog ? `Book ${prog.name}` : "Book now"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="display text-[clamp(2.2rem,1.6rem+2vw,3.4rem)]">This code isn’t active.</h1>
            <p className="mx-auto mt-4 max-w-lg text-ink-soft">It may have ended. Questions? Reply to the email it came in, or write to hello@yallaspacesd.com.</p>
          </>
        )}
      </div>
    </section>
  );
}
