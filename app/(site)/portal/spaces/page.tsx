import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookASpace } from "@/components/spaces/BookASpace";
import { SpacesHeader } from "@/components/spaces/SpacesNav";
import { getDb, isDbConfigured } from "@/lib/db";
import { PORTAL_OPEN_PREVIEW } from "@/lib/portal-preview";
import { dayView, myDay, myReservation, type DayView } from "@/lib/spaces/availability";
import { addDaysISO, todayLA } from "@/lib/time";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "Book a Space", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The first day from today that's still open (today counts until the last space closes). */
async function firstOpenDay(db: ReturnType<typeof getDb>, from: string): Promise<DayView> {
  const now = new Date();
  let view = await dayView(db, from, now);
  for (let i = 0; i < 14; i++) {
    const closesAt = Math.max(0, ...view.workspaces.map((w) => (w.hours ? Number(w.hours[1].slice(0, 2)) * 60 + Number(w.hours[1].slice(3)) : 0)));
    const laNow = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
    const nowMin = Number(laNow.find((p) => p.type === "hour")!.value) * 60 + Number(laNow.find((p) => p.type === "minute")!.value);
    if (view.open && (view.date !== view.today || nowMin < closesAt)) return view;
    view = await dayView(db, addDaysISO(view.date, 1), now);
  }
  return view;
}

export default async function BookASpacePage({ searchParams }: { searchParams: Promise<{ date?: string; move?: string }> }) {
  if (!isDbConfigured()) redirect("/portal");
  const g = await getGuardian();
  if (!g && !PORTAL_OPEN_PREVIEW) redirect("/portal?signin=1&next=/portal/spaces");
  const sp = await searchParams;
  const db = getDb();
  const moving = g && sp.move ? await myReservation(db, g.familyId, sp.move) : null;
  const canMove = moving?.canMove ? moving : null;
  const requested = canMove?.intervals[0]?.localDate ?? (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date >= todayLA() ? sp.date : null);
  const view = requested ? await dayView(db, requested) : await firstOpenDay(db, todayLA());
  const me = g ? await myDay(db, g.familyId, view.date) : null;

  return (
    <div className="pt-28 lg:pt-36">
      <SpacesHeader current="book" preview={!g} />
      <section className="shell mt-12 mb-14 grid gap-8 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          <p className="eyebrow text-ink-soft">Family Portal · Book a Space</p>
          <h1 className="display mt-5 text-[clamp(2.6rem,1.8rem+3vw,4.6rem)]">
            A space for <em>your best work.</em>
          </h1>
          <p className="mt-6 max-w-xl text-[1.08rem] text-ink-soft">Whether you need a little privacy or an entire day to yourself, find your space at Yalla.</p>
        </div>
      </section>
      <BookASpace initialView={view} initialMe={me} signedIn={!!g} moving={canMove} />
    </div>
  );
}
