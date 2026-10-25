import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingExplorer } from "@/components/booking/BookingExplorer";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Book Care",
  description: "Browse live availability for drop-in care, weekend care, Parents’ Night Out and camps at Yalla, and reserve in moments.",
};

export default function BookPage() {
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
          <p className="max-w-xs border-l-2 border-oxblood/40 pl-4 text-[0.8rem] text-oxblood">
            Preview mode: sessions, times and spaces shown are sample data until booking goes live. No bookings or payments are made.
          </p>
        </div>
      </section>
      <Suspense>
        <BookingExplorer />
      </Suspense>
    </>
  );
}
