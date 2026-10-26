"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicSession } from "@/lib/ops/public-booking";
import { addDaysISO, fmtDate, fmtTime, todayLA } from "@/lib/time";
import { stateLabel } from "./format";

const kindLabel: Record<string, string> = {
  drop_in: "Flex",
  weekend: "Weekends",
  parents_night: "After Hours",
  camp: "Camp",
  happening: "Happening",
};

/** A small live window into the booking calendar for the home page. */
export function AvailabilityGlance() {
  const [sessions, setSessions] = useState<PublicSession[] | null>(null);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    const from = addDaysISO(todayLA(), 1);
    fetch(`/api/availability?from=${from}&to=${addDaysISO(from, 13)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { configured: boolean; sessions: PublicSession[] }) => {
        setConfigured(j.configured);
        // One row per program and day (Flex has a session per cohort): show the most open one.
        const rank = (x: PublicSession) => {
          const st = x.state;
          return st.state === "available" ? 3000 + (st.remaining ?? 99) : st.state === "limited" ? 2000 + st.remaining : st.state === "full" ? 1000 : 0;
        };
        const best = new Map<string, PublicSession>();
        for (const s of j.sessions) {
          if (s.state.state === "not_offered") continue;
          const key = `${s.programId}:${s.localDate}`;
          const cur = best.get(key);
          if (!cur || rank(s) > rank(cur)) best.set(key, s);
        }
        const picked = [...best.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 6);
        setSessions(picked);
      })
      .catch(() => setSessions([]));
  }, []);

  if (sessions && (!configured || sessions.length === 0)) {
    return (
      <div className="border-y border-chalk/15 py-10 text-center">
        <p className="display text-[1.6rem]">New dates are coming soon.</p>
        <p className="mt-2 text-[0.9rem] text-chalk/60">Get in touch and we’ll let you know when booking opens.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-chalk/15 border-y border-chalk/15">
      {(sessions ?? Array.from({ length: 6 }, () => null)).map((s, i) => {
        if (!s) return <li key={i} className="h-[4.25rem]" />;
        const st = stateLabel(s);
        return (
          <li key={s.id}>
            <Link
              href={`/book?offering=${s.kind}&date=${s.localDate}`}
              className="group grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 py-4 transition-colors hover:bg-chalk/[0.04] sm:grid-cols-[4.5rem_1fr_auto_auto]"
            >
              <span className="leading-none">
                <span className="eyebrow block text-[0.6rem] text-chalk/60">{fmtDate(s.localDate, "EEE")}</span>
                <span className="display mt-1 block text-[1.6rem]">{fmtDate(s.localDate, "d")}</span>
              </span>
              <span>
                <span className="block text-[0.95rem]">{s.programName}</span>
                <span className="text-[0.8rem] text-chalk/60">
                  {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}
                </span>
              </span>
              <span className="eyebrow hidden text-[0.6rem] text-chalk/60 sm:block">{kindLabel[s.kind]}</span>
              <span className="text-right text-[0.8rem]">
                <span className={st.tone === "low" ? "text-[#f3c9a8]" : st.tone === "muted" ? "text-chalk/50" : ""}>{st.text}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
