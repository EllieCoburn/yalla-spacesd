import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb, isDbConfigured } from "@/lib/db";
import { daysWithCare, extrasForDay } from "@/lib/ops/booking-extras";
import { ExtrasForm } from "@/components/portal/ExtrasForm";
import { fmtDate, todayLA } from "@/lib/time";
import { getGuardian } from "../../session";

export const metadata: Metadata = { title: "Add coworking & extras", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Coworking upgrades and extras for one day the family has care (today or upcoming): a second
 * grown-up, camp Early Bird or late stay, and a private space for the day.
 */
export default async function ExtrasPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  if (!isDbConfigured()) redirect("/portal");
  const g = await getGuardian();
  if (!g) redirect("/portal?signin=1&next=/portal/extras/" + date);
  const db = getDb();
  const days = await extrasForDay(db, g.familyId, date);
  const other = (await daysWithCare(db, g.familyId)).filter((d) => d !== date).slice(0, 8);
  return (
    <div className="pt-28 pb-24 lg:pt-36">
      <div className="shell max-w-3xl">
        <Link href="/portal/home" className="text-[0.85rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">
          ← Family Portal
        </Link>
        <p className="eyebrow mt-8 text-ink-soft">{date === todayLA() ? "Today" : fmtDate(date, "EEEE")}</p>
        <h1 className="display mt-3 text-[clamp(2.2rem,1.6rem+2vw,3.4rem)]">
          {fmtDate(date, "MMMM d")}: <em>add to your day.</em>
        </h1>
        {days.length ? (
          <>
            <p className="mt-4 max-w-xl text-ink-soft">
              Coworking in our common areas is already included. Add a second grown-up or other extras below, or reserve a private space for the day.
            </p>
            <div className="mt-10">
              <ExtrasForm date={date} days={days} />
            </div>
          </>
        ) : (
          <p className="mt-6 text-ink-soft">You don’t have care booked on this day (or it has already ended), so there’s nothing to add.</p>
        )}

        <div className="mt-12 border-t border-line pt-8">
          <p className="display text-[1.4rem]">Need a private space?</p>
          <p className="mt-2 text-ink-soft">Private offices and desks to rent, and complimentary time in our phone booth, subject to availability.</p>
          <Link href={"/portal/spaces?date=" + date} className="mt-5 inline-flex h-12 items-center rounded-full border border-ink/25 px-6 text-[0.9rem] hover:border-ink">
            See what’s available on {fmtDate(date, "MMM d")}
          </Link>
        </div>

        {other.length ? (
          <div className="mt-12 border-t border-line pt-8">
            <p className="eyebrow text-[0.6rem] text-ink-soft">Your other days</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {other.map((d) => (
                <Link key={d} href={"/portal/extras/" + d} className="border border-line px-4 py-2 text-[0.9rem] hover:border-ink">
                  {fmtDate(d, "EEE MMM d")}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
