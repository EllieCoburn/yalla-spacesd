/**
 * A child's day as a timeline: photos, food, naps, potty and messages. Used in the Family Portal and by
 * the team in Admin (where `actions` adds "Woke up" and "Remove" to each entry).
 */
import type { ReactNode } from "react";
import { entryTitle, type FeedEntry } from "@/lib/ops/day-feed";
import { fmtTime } from "@/lib/time";

const ICON: Record<string, ReactNode> = {
  photo: (
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-1.8h6.6L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
  ),
  food: <path d="M7 4v7a2 2 0 0 0 4 0V4M9 11v9M16 4c-1.7 1-2.5 3-2.5 5.5S15 13 16 13v7" />,
  nap: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
  potty: <path d="M12 4c-2.5 3.5-5 6.4-5 9.5a5 5 0 0 0 10 0C17 10.4 14.5 7.5 12 4z" />,
  message: <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3v-3h0.5A1.5 1.5 0 0 1 5 14.5z" />,
};
const TINT: Record<string, string> = {
  photo: "bg-[#e9e9fb] text-[#3d40b8]",
  food: "bg-[#f8eedd] text-[#8a5212]",
  nap: "bg-[#e7e5f1] text-[#4b4fd6]",
  potty: "bg-[#e6f0ea] text-[#2c6447]",
  message: "bg-[#efeee9] text-ink",
};

export function FeedTimeline({ entries, photoBase, actions, empty }: { entries: FeedEntry[]; photoBase: string; actions?: (e: FeedEntry) => ReactNode; empty?: ReactNode }) {
  if (!entries.length) return <div className="text-[0.9rem] text-ink-soft">{empty ?? "Nothing posted yet."}</div>;
  return (
    <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[17px] before:w-px before:bg-ink/10">
      {entries.map((e) => {
        const fromFamily = e.kind === "message" && e.data?.from === "family";
        const d = e.data ?? {};
        return (
          <li key={e.id} className="relative flex gap-3.5">
            <span className={`relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TINT[e.kind] ?? TINT.message}`} aria-hidden>
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                {ICON[e.kind] ?? ICON.message}
              </svg>
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-[0.95rem] text-ink">{e.kind === "message" ? (fromFamily ? `${e.authorName}` : `${e.authorName.split(" ")[0]} from Team Yalla`) : entryTitle(e)}</p>
                <p className="text-[0.78rem] text-ink-soft tabular-nums">{fmtTime(e.occurredAt)}</p>
              </div>
              {e.kind === "food" && d.items ? <p className="text-[0.88rem] text-ink-soft">{d.items}</p> : null}
              {e.kind === "photo" && e.photoId ? (
                <a href={`${photoBase}${e.photoId}`} target="_blank" rel="noopener" className="mt-2 block max-w-sm overflow-hidden rounded-lg border border-ink/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${photoBase}${e.photoId}`} alt={e.note ? e.note : "A photo from the day"} loading="lazy" className="block h-auto w-full" />
                </a>
              ) : null}
              {e.note ? <p className={`mt-1 text-[0.9rem] whitespace-pre-line ${e.kind === "message" ? `rounded-lg px-3 py-2 ${fromFamily ? "bg-blue/[0.06]" : "bg-ink/[0.04]"} text-ink` : "text-ink-soft"}`}>{e.note}</p> : null}
              {actions ? <div className="mt-1.5">{actions(e)}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
