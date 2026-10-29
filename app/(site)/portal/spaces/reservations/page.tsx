import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { ReservationActions } from "@/components/spaces/ReservationActions";
import { SpacesHeader } from "@/components/spaces/SpacesNav";
import { getDb, isDbConfigured } from "@/lib/db";
import { PORTAL_OPEN_PREVIEW } from "@/lib/portal-preview";
import { myReservations, type MyReservation } from "@/lib/spaces/availability";
import { BOOKING_TYPE_LABEL, CATEGORY_LABEL } from "@/lib/spaces/config";
import { fmtDate, fmtTime } from "@/lib/time";
import { getPortalGuardian } from "../../session";

export const metadata: Metadata = { title: "My Reservations", robots: { index: false } };
export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
] as const;

function when(r: MyReservation) {
  const a = r.intervals[0];
  const z = r.intervals[r.intervals.length - 1];
  const time = `${fmtTime(a.start)} – ${fmtTime(a.end)}`;
  return r.intervals.length > 1 ? { date: `${fmtDate(a.localDate, "EEE MMM d")} – ${fmtDate(z.localDate, "EEE MMM d")}`, time: `${time} each day` } : { date: fmtDate(a.localDate, "EEEE, MMMM d"), time };
}

function duration(r: MyReservation) {
  if (r.bookingType === "week") return `${r.intervals.length} days`;
  if (r.bookingType === "full_day") return "Full day";
  if (r.bookingType === "half_day") return "Half day";
  const m = r.intervals.reduce((s, i) => s + (new Date(i.end).getTime() - new Date(i.start).getTime()) / 60000, 0);
  return m < 60 ? `${m} minutes` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : m > 60 ? "s" : ""}`;
}

export default async function MyReservationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!isDbConfigured()) redirect("/portal");
  const { guardian: g, preview } = await getPortalGuardian();
  if (!g && !PORTAL_OPEN_PREVIEW) redirect("/portal?signin=1&next=/portal/spaces/reservations");
  const { tab: raw } = await searchParams;
  const tab = TABS.find((t) => t.key === raw)?.key ?? "upcoming";
  const all = g ? await myReservations(getDb(), g.familyId) : { upcoming: [], past: [], cancelled: [] };
  const list = all[tab];

  return (
    <div className="pt-28 pb-28 lg:pt-36">
      <SpacesHeader current="reservations" preview={preview} />
      <section className="shell mt-12">
        <h1 className="display text-[clamp(2.4rem,1.8rem+2vw,3.6rem)]">
          My <em>reservations.</em>
        </h1>
        <nav aria-label="Reservations" className="mt-8 flex gap-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/portal/spaces/reservations?tab=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={`h-10 rounded-full border px-4 text-[0.85rem] leading-10 transition-colors ${tab === t.key ? "border-ink bg-ink text-chalk" : "border-ink/15 hover:border-ink/50"}`}
            >
              {t.label}
              <span className="ml-2 opacity-60">{all[t.key].length}</span>
            </Link>
          ))}
        </nav>

        {list.length === 0 ? (
          <div className="mt-10 border border-line bg-paper py-20 text-center">
            <Mark name="window" className="mx-auto h-10 w-auto text-blue" />
            <p className="display mt-6 text-[1.7rem]">{tab === "upcoming" ? "A little room to make plans." : tab === "past" ? "Nothing here yet." : "No cancellations."}</p>
            <p className="mt-2 text-ink-soft">{tab === "upcoming" ? "Your upcoming workspace reservations will appear here." : "Reservations will appear here over time."}</p>
            {tab === "upcoming" ? (
              <Link href="/portal/spaces" className="mt-8 inline-flex h-11 items-center rounded-full bg-ink px-5 text-[0.88rem] text-chalk hover:bg-blue">
                Book a space
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {list.map((r) => {
              const w = when(r);
              const held = r.status === "held" || r.status === "pending_payment";
              return (
                <li key={r.reference} className="grid gap-5 py-7 sm:grid-cols-[1fr_auto] sm:items-start">
                  <details className="group">
                    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <p className="eyebrow text-[0.58rem] text-ink-soft">
                        {CATEGORY_LABEL[r.workspace.category]} · {r.reference}
                      </p>
                      <p className="display mt-2 text-[1.7rem]">
                        {r.workspace.name}
                        <span className="ml-3 align-middle text-[0.8rem] text-ink-soft transition-transform group-open:rotate-180">▾</span>
                      </p>
                      <p className="mt-1 text-[0.95rem]">{w.date}</p>
                      <p className="text-[0.9rem] text-ink-soft">
                        {w.time} · {duration(r)}
                      </p>
                    </summary>
                    <dl className="mt-5 grid max-w-lg grid-cols-2 gap-x-6 gap-y-3 text-[0.88rem]">
                      <dt className="text-ink-soft">Booking</dt>
                      <dd>{BOOKING_TYPE_LABEL[r.bookingType]}</dd>
                      <dt className="text-ink-soft">Status</dt>
                      <dd>{r.status === "confirmed" ? "Confirmed" : held ? "Awaiting payment" : r.status === "needs_attention" ? "Yalla will be in touch" : "Cancelled"}</dd>
                      <dt className="text-ink-soft">Price</dt>
                      <dd>{r.totalCents ? usd(r.totalCents) : "Included with tuition"}</dd>
                      <dt className="text-ink-soft">Payment</dt>
                      <dd>{r.paymentStatus}</dd>
                      {r.invoiceNumber ? (
                        <>
                          <dt className="text-ink-soft">Receipt</dt>
                          <dd>
                            <Link href="/portal/home?tab=payments" className="underline underline-offset-4">
                              {r.invoiceNumber}
                            </Link>
                          </dd>
                        </>
                      ) : null}
                      {r.cancellationReason && tab === "cancelled" ? (
                        <>
                          <dt className="text-ink-soft">Note</dt>
                          <dd>{r.cancellationReason}</dd>
                        </>
                      ) : null}
                    </dl>
                    {tab === "upcoming" ? <p className="mt-4 text-[0.8rem] text-ink-soft">{r.changeNote}</p> : null}
                  </details>
                  {tab === "upcoming" ? <ReservationActions reference={r.reference} canCancel={r.canCancel} canMove={r.canMove} confirmed={r.status === "confirmed"} held={held} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
