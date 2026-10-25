"use client";

import { addDays, format, startOfDay } from "date-fns";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { ageInMonths, previewSessions, sampleFamily, sampleForms, type PreviewSession } from "@/lib/booking/preview";
import type { FormStatus } from "@/lib/booking/types";

const tabs = ["Overview", "Children", "Bookings", "Forms", "Payments"] as const;
type Tab = (typeof tabs)[number];

const formTone: Record<FormStatus, string> = {
  approved: "text-ink-soft",
  submitted: "text-ink-soft",
  missing: "text-oxblood",
  expiring: "text-oxblood",
  expired: "text-oxblood",
};
const formLabel: Record<FormStatus, string> = {
  approved: "Complete",
  submitted: "Under review",
  missing: "Needed",
  expiring: "Expiring soon",
  expired: "Expired",
};

function ageLabel(birth: string) {
  const m = ageInMonths(birth);
  return m < 24 ? `${m} months` : `${Math.floor(m / 12)} years`;
}

export function PortalDashboard() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [upcoming, setUpcoming] = useState<(PreviewSession & { childId: string; lineId: string })[]>([]);
  const [cancelled, setCancelled] = useState<string[]>([]);

  useEffect(() => {
    const from = addDays(startOfDay(new Date()), 2);
    const s = previewSessions({ from: format(from, "yyyy-MM-dd"), to: format(addDays(from, 30), "yyyy-MM-dd") });
    const pick = [s.find((x) => x.kind === "drop_in"), s.find((x) => x.kind === "weekend"), s.find((x) => x.kind === "parents_night"), s.filter((x) => x.kind === "drop_in")[3]].filter(
      Boolean,
    ) as PreviewSession[];
    setUpcoming(pick.map((x, i) => ({ ...x, childId: i % 2 ? "c2" : "c1", lineId: `l${i}` })));
  }, []);

  const fam = sampleFamily;
  const child = (id: string) => fam.children.find((c) => c.id === id)!;
  const outstanding = sampleForms.filter((f) => f.status === "missing" || f.status === "expiring");
  const active = useMemo(() => upcoming.filter((u) => !cancelled.includes(u.lineId)), [upcoming, cancelled]);

  return (
    <div className="pt-28 pb-24 lg:pt-36">
      <div className="shell">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="eyebrow text-ink-soft">Family Portal</p>
            <h1 className="display mt-5 text-[clamp(2.4rem,1.8rem+2.4vw,4rem)]">
              Good to see you, <em>{fam.guardians[0].firstName}.</em>
            </h1>
          </div>
          <p className="max-w-xs border-l-2 border-oxblood/40 pl-4 text-[0.8rem] text-oxblood">Preview with a sample family. Nothing here is real data.</p>
        </div>

        <div className="no-scrollbar -mx-[clamp(1.25rem,4vw,3.5rem)] mt-10 flex gap-8 overflow-x-auto border-b border-line px-[clamp(1.25rem,4vw,3.5rem)] md:mx-0 md:px-0">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative shrink-0 pb-4 text-[0.92rem] transition-colors ${tab === t ? "text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {t}
              {t === "Forms" && outstanding.length ? (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-oxblood px-1.5 text-[0.65rem] text-chalk">{outstanding.length}</span>
              ) : null}
              <span className={`absolute inset-x-0 -bottom-px h-[2px] bg-blue transition-transform duration-500 ${tab === t ? "scale-x-100" : "scale-x-0"}`} />
            </button>
          ))}
        </div>

        <div className="mt-10">
          {tab === "Overview" ? (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="border border-line bg-paper p-7 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <p className="display text-[1.6rem]">Coming up</p>
                  <Link href="/book" className="text-[0.85rem] text-blue underline-offset-4 hover:underline">
                    Book more
                  </Link>
                </div>
                <BookingList items={active.slice(0, 3)} child={child} />
              </div>
              <div className="flex flex-col gap-6">
                <div className="bg-blue p-7 text-chalk">
                  <Mark name="balcony" className="h-10 w-auto" />
                  <p className="display mt-6 text-[1.5rem]">{outstanding.length} forms need attention</p>
                  <button onClick={() => setTab("Forms")} className="mt-5 text-[0.85rem] underline underline-offset-4">
                    Review forms
                  </button>
                </div>
                <div className="border border-line bg-paper p-7">
                  <p className="eyebrow text-[0.6rem] text-ink-soft">Your children</p>
                  <ul className="mt-4 space-y-3">
                    {fam.children.map((c) => (
                      <li key={c.id} className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-t-full bg-mist font-serif text-blue">{c.firstName[0]}</span>
                        <span>
                          <span className="block">{c.firstName}</span>
                          <span className="text-[0.8rem] text-ink-soft">{ageLabel(c.birthDate)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : tab === "Children" ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {fam.children.map((c) => (
                <div key={c.id} className="border border-line bg-paper p-7">
                  <div className="flex h-36 items-end justify-center rounded-t-full bg-mist">
                    <span className="display mb-6 text-[3rem] text-blue">{c.firstName[0]}</span>
                  </div>
                  <p className="display mt-6 text-[1.7rem]">
                    {c.firstName} {c.lastName}
                  </p>
                  <dl className="mt-4 space-y-2 text-[0.88rem]">
                    <div className="flex justify-between">
                      <dt className="text-ink-soft">Born</dt>
                      <dd>{format(new Date(c.birthDate + "T00:00:00"), "d MMMM yyyy")}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-soft">Age</dt>
                      <dd>{ageLabel(c.birthDate)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-soft">Allergies</dt>
                      <dd>{c.allergies ?? "Not provided"}</dd>
                    </div>
                  </dl>
                  <button className="mt-6 text-[0.85rem] text-blue underline-offset-4 hover:underline">Edit profile</button>
                </div>
              ))}
              <button className="flex min-h-64 flex-col items-center justify-center border border-dashed border-ink/25 text-ink-soft transition-colors hover:border-ink hover:text-ink">
                <span className="text-[2rem] font-light">+</span>
                <span className="text-[0.9rem]">Add a child</span>
              </button>
            </div>
          ) : tab === "Bookings" ? (
            <div className="border border-line bg-paper p-7">
              <div className="flex items-center justify-between">
                <p className="display text-[1.6rem]">Upcoming bookings</p>
                <Link href="/book" className="text-[0.85rem] text-blue underline-offset-4 hover:underline">
                  Book more
                </Link>
              </div>
              <BookingList items={active} child={child} onCancel={(id) => setCancelled((c) => [...c, id])} />
              {cancelled.length ? <p className="mt-4 text-[0.8rem] text-ink-soft">{cancelled.length} cancelled in this preview.</p> : null}
            </div>
          ) : tab === "Forms" ? (
            <ul className="divide-y divide-line border-y border-line">
              {sampleForms.map((f) => (
                <li key={f.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="block text-[1rem]">{f.title}</span>
                    <span className="text-[0.8rem] text-ink-soft">{f.childId ? `For ${child(f.childId).firstName}` : "Family"}</span>
                  </span>
                  <span className="flex items-center gap-5">
                    <span className={`eyebrow text-[0.6rem] ${formTone[f.status]}`}>{formLabel[f.status]}</span>
                    <button className={`h-10 rounded-full px-5 text-[0.82rem] ${f.status === "missing" ? "bg-ink text-chalk" : "border border-ink/20"}`}>
                      {f.status === "missing" ? "Complete" : "View"}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border border-line bg-paper p-10 text-center">
              <Mark name="window" className="mx-auto h-12 w-auto text-blue/60" />
              <p className="display mt-6 text-[1.6rem]">Payments & receipts</p>
              <p className="mx-auto mt-2 max-w-sm text-ink-soft">Payment history, saved cards and tuition statements will live here once secure payments are connected.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BookingList({
  items,
  child,
  onCancel,
}: {
  items: (PreviewSession & { childId: string; lineId: string })[];
  child: (id: string) => { firstName: string };
  onCancel?: (lineId: string) => void;
}) {
  if (!items.length) return <p className="mt-6 text-ink-soft">No upcoming bookings.</p>;
  return (
    <ul className="mt-6 divide-y divide-line">
      {items.map((b) => {
        const d = new Date(b.startsAt);
        return (
          <li key={b.lineId} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 py-4">
            <span className="text-center leading-none">
              <span className="eyebrow block text-[0.55rem] text-ink-soft">{format(d, "MMM")}</span>
              <span className="display mt-1 block text-[1.8rem]">{format(d, "d")}</span>
            </span>
            <span>
              <span className="block">{b.title}</span>
              <span className="text-[0.8rem] text-ink-soft">
                {child(b.childId).firstName} · {format(d, "EEE h:mmaaa")} – {format(new Date(b.endsAt), "h:mmaaa")}
              </span>
            </span>
            {onCancel ? (
              <button onClick={() => onCancel(b.lineId)} className="text-[0.8rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                Cancel
              </button>
            ) : (
              <span className="eyebrow text-[0.55rem] text-ink-soft">Confirmed</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
