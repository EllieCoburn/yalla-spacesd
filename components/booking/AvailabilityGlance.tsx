"use client";

import Link from "next/link";
import { addDays, format } from "date-fns";
import { useEffect, useState } from "react";
import { availabilityFor, previewSessions, type PreviewSession } from "@/lib/booking/preview";

const kindLabel: Record<string, string> = {
  drop_in: "Flex",
  weekend: "Weekends",
  parents_night: "After Hours",
  camp: "Camp",
  happening: "Happening",
};

/** A small live window into the booking calendar for the home page. */
export function AvailabilityGlance() {
  const [sessions, setSessions] = useState<PreviewSession[] | null>(null);

  useEffect(() => {
    const today = new Date();
    const list = previewSessions({ from: format(addDays(today, 1), "yyyy-MM-dd"), to: format(addDays(today, 14), "yyyy-MM-dd") });
    setSessions(list.slice(0, 6));
  }, []);

  return (
    <ul className="divide-y divide-chalk/15 border-y border-chalk/15">
      {(sessions ?? Array.from({ length: 6 }, () => null)).map((s, i) => {
        if (!s) return <li key={i} className="h-[4.25rem]" />;
        const a = availabilityFor(s);
        const d = new Date(s.startsAt);
        return (
          <li key={s.id}>
            <Link
              href={`/book?offering=${s.kind}&date=${format(d, "yyyy-MM-dd")}`}
              className="group grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 py-4 transition-colors hover:bg-chalk/[0.04] sm:grid-cols-[4.5rem_1fr_auto_auto]"
            >
              <span className="leading-none">
                <span className="eyebrow block text-[0.6rem] text-chalk/60">{format(d, "EEE")}</span>
                <span className="display mt-1 block text-[1.6rem]">{format(d, "d")}</span>
              </span>
              <span>
                <span className="block text-[0.95rem]">{s.title}</span>
                <span className="text-[0.8rem] text-chalk/60">
                  {format(d, "h:mmaaa")} – {format(new Date(s.endsAt), "h:mmaaa")}
                </span>
              </span>
              <span className="eyebrow hidden text-[0.6rem] text-chalk/60 sm:block">{kindLabel[s.kind]}</span>
              <span className="text-right text-[0.8rem]">
                {a.state === "full" ? (
                  <span className="text-chalk/50">Waitlist</span>
                ) : a.state === "limited" ? (
                  <span className="text-[#f3c9a8]">{a.remaining} left</span>
                ) : a.state === "open" ? (
                  <span>{a.remaining} spaces</span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
