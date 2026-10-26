import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, asc, eq } from "drizzle-orm";
import { BookingExplorer } from "@/components/booking/BookingExplorer";
import { Mark } from "@/components/brand/Mark";
import { Eyebrow } from "@/components/ui/primitives";
import { getDb, isDbConfigured } from "@/lib/db";
import { children } from "@/lib/db/schema";
import { paymentsStatus } from "@/lib/payments/provider";
import { getGuardian } from "../portal/session";

export const metadata: Metadata = {
  title: "Book Care",
  description: "Browse live availability for Yalla Flex, Yalla Weekends, Yalla After Hours, Camp Yalla and Yalla Happenings, and reserve in moments.",
};

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const configured = isDbConfigured();
  const guardian = configured ? await getGuardian() : null;
  const saved = guardian
    ? await getDb()
        .select({ id: children.id, firstName: children.firstName, lastName: children.lastName, preferredName: children.preferredName, birthDate: children.birthDate })
        .from(children)
        .where(and(eq(children.familyId, guardian.familyId), eq(children.status, "active")))
        .orderBy(asc(children.birthDate))
    : [];
  const testPayments = configured && paymentsStatus().provider === "test";

  return (
    <>
      <section className="pt-32 pb-10 lg:pt-40">
        <div className="shell flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div>
            <Eyebrow>Book care</Eyebrow>
            <h1 className="display mt-6 text-[clamp(2.8rem,1.6rem+4vw,5rem)]">
              Find your <em>days.</em>
            </h1>
            <p className="mt-5 max-w-lg text-[1.05rem] text-ink-soft">
              Filter by offering, your child’s age and date, then reserve. Everything you book appears in your Family Portal.
            </p>
          </div>
          {guardian ? (
            <p className="max-w-xs border-l-2 border-blue/40 pl-4 text-[0.85rem] text-ink-soft">
              Signed in as {guardian.firstName} {guardian.lastName}.{" "}
              <Link href="/portal/home" className="underline underline-offset-4">
                Family Portal
              </Link>
            </p>
          ) : null}
          {testPayments ? (
            <p className="max-w-xs border-l-2 border-oxblood/40 pl-4 text-[0.8rem] text-oxblood">Test mode: payments use a sandbox checkout and no money moves. Bookings are real records in the test system.</p>
          ) : null}
        </div>
      </section>
      {configured ? (
        <Suspense>
          <BookingExplorer guardian={guardian ? { firstName: guardian.firstName, lastName: guardian.lastName, email: guardian.email } : null} savedChildren={saved} />
        </Suspense>
      ) : (
        <section className="pb-32">
          <div className="shell">
            <div className="mx-auto max-w-xl bg-paper px-8 py-16 text-center">
              <Mark name="arch" className="mx-auto h-12 w-auto text-blue" />
              <h2 className="display mt-8 text-[2.2rem]">
                Online booking <em>opens soon.</em>
              </h2>
              <p className="mx-auto mt-4 max-w-sm text-ink-soft">In the meantime, we’d love to hear from you. Tell us what you’re looking for and we’ll be in touch.</p>
              <Link href="/visit" className="mt-8 inline-flex h-12 items-center rounded-full bg-ink px-7 text-[0.9rem] text-chalk hover:bg-blue">
                Get in touch
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
