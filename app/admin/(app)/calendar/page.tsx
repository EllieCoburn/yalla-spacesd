import Link from "next/link";
import { Card, Empty, PageHeader, Pill, Status } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { CALENDAR_PROGRAMS, calendarSessions, type CalendarProgram, type CalendarSession } from "@/lib/admin/queries/calendar";
import { roster } from "@/lib/ops/attendance";
import { addDaysISO, eachDate, fmtDate, fmtTime, todayLA, weekdayOf } from "@/lib/time";

export const metadata = { title: "Enrollment calendar" };

type SP = { month?: string; date?: string; program?: string };

/** "18 months – 3 years" → "18m–3y", "4 – 7 years" → "4–7y". */
const shortGroup = (g: string) =>
  g
    .replace(/\s*–\s*/g, "–")
    .replace(/ months?/g, "m")
    .replace(/ years?/g, "y")
    .replace(/\s+/g, " ");

const KIND_DOT: Record<string, string> = { camp: "bg-blue", drop_in: "bg-[#2c6447]", happening: "bg-[#c08a3e]", parents_night: "bg-[#673e46]", nature: "bg-[#2c6447]" };
const fill = (s: CalendarSession) => (s.capacity ? Math.min(100, Math.round((s.booked / s.capacity) * 100)) : 0);
const barTone = (s: CalendarSession) => (s.booked >= s.capacity ? "bg-[#8a2333]" : s.capacity - s.booked <= 2 ? "bg-[#c08a3e]" : "bg-blue");

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requirePermission("roster.view");
  const sp = await searchParams;
  const db = getDb();
  const today = todayLA();
  const program = (CALENDAR_PROGRAMS.some((p) => p.key === sp.program) ? sp.program : "camp") as CalendarProgram;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : (sp.date ?? today).slice(0, 7);
  const first = `${month}-01`;
  const nextMonth = addDaysISO(first, 32).slice(0, 7);
  const prevMonth = addDaysISO(first, -1).slice(0, 7);
  const last = addDaysISO(`${nextMonth}-01`, -1);
  // The grid runs Monday to Sunday, from the Monday on or before the 1st to the Sunday on or after the last day.
  const gridStart = addDaysISO(first, -((weekdayOf(first) + 6) % 7));
  const gridEnd = addDaysISO(last, (7 - weekdayOf(last)) % 7);
  const list = await calendarSessions(db, gridStart, gridEnd, program);
  const byDate = new Map<string, CalendarSession[]>();
  for (const s of list) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const inMonth = list.filter((s) => s.date >= first && s.date <= last);
  const selected =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : today.startsWith(month) && byDate.has(today)
        ? today
        : (inMonth.find((s) => s.date >= today) ?? inMonth[0])?.date ?? null;
  const allDay = selected ? (byDate.get(selected) ?? []) : [];
  // In "Everything", only sessions with someone booked are listed (the rest are counted).
  const daySessions = program === "all" ? allDay.filter((s) => s.booked > 0) : allDay;
  const emptyHidden = allDay.length - daySessions.length;
  const rosters = await Promise.all(daySessions.map(async (s) => ({ s, r: await roster(db, s.id, staff.permissions) })));

  const qs = (extra: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ month, program, date: selected ?? undefined, ...extra })) if (v) p.set(k, v);
    return `/admin/calendar?${p}`;
  };
  const totalBooked = inMonth.reduce((n, s) => n + s.booked, 0);
  const days = eachDate(gridStart, gridEnd);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <>
      <PageHeader
        title="Enrollment calendar"
        subtitle={`${inMonth.length ? `${totalBooked} ${totalBooked === 1 ? "child" : "children"} booked across ${new Set(inMonth.map((s) => s.date)).size} days` : "Nothing scheduled"} in ${fmtDate(first, "MMMM yyyy")}`}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            <Link scroll={false} className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={qs({ month: prevMonth, date: undefined })} aria-label="Previous month">
              ←
            </Link>
            <Link scroll={false} className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={qs({ month: today.slice(0, 7), date: today })}>
              Today
            </Link>
            <Link scroll={false} className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={qs({ month: nextMonth, date: undefined })} aria-label="Next month">
              →
            </Link>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Program">
        {CALENDAR_PROGRAMS.map((p) => (
          <Link
            key={p.key}
            scroll={false}
            href={qs({ program: p.key, date: undefined })}
            aria-current={program === p.key ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-[0.82rem] transition-colors ${program === p.key ? "bg-ink text-chalk" : "border border-ink/15 bg-white text-ink-soft hover:border-ink/40 hover:text-ink"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,1fr)]">
        {/* The month */}
        <Card padded={false} className="self-start overflow-hidden">
          <div className="grid grid-cols-[repeat(5,minmax(0,1fr))_repeat(2,minmax(0,0.6fr))] border-b border-ink/10 bg-[#f7f5ef] text-center text-[0.68rem] tracking-[0.14em] text-ink-soft uppercase">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-2.5">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((w) => (
            <div key={w[0]} className="grid grid-cols-[repeat(5,minmax(0,1fr))_repeat(2,minmax(0,0.6fr))] border-b border-ink/10 last:border-b-0">
              {w.map((d) => {
                const raw = byDate.get(d) ?? [];
                // "Everything": one chip per program for the day (its groups added together).
                const ss: CalendarSession[] =
                  program === "all"
                    ? [...new Set(raw.map((x) => x.programName))].map((name) => {
                        const g = raw.filter((x) => x.programName === name);
                        return { ...g[0], id: `${d}-${name}`, booked: g.reduce((n, x) => n + x.booked, 0), capacity: g.reduce((n, x) => n + x.capacity, 0) };
                      })
                    : raw;
                const out = d < first || d > last;
                const isSel = d === selected;
                const booked = raw.reduce((n, s) => n + s.booked, 0);
                return (
                  <Link
                    key={d}
                    scroll={false}
                    href={qs({ date: d, month })}
                    aria-current={isSel ? "date" : undefined}
                    aria-label={`${fmtDate(d, "EEEE d MMMM")}: ${ss.length ? `${ss.length} sessions, ${booked} booked` : "nothing scheduled"}`}
                    className={`group relative min-h-[6.5rem] border-r border-ink/10 p-1.5 text-left transition-colors last:border-r-0 sm:min-h-[7.5rem] sm:p-2 ${
                      isSel ? "bg-blue/[0.07] ring-2 ring-blue ring-inset" : ss.length ? "hover:bg-blue/[0.04]" : "hover:bg-ink/[0.02]"
                    } ${out ? "bg-[#f7f5ef]/60" : ""}`}
                  >
                    <span className="flex items-center justify-between">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.82rem] tabular-nums ${d === today ? "bg-ink text-chalk" : out ? "text-ink/30" : "text-ink"}`}>{Number(d.slice(8))}</span>
                      {ss.length ? <span className="text-[0.68rem] text-ink-soft tabular-nums sm:hidden">{booked}</span> : null}
                    </span>
                    {/* Each session: its group, booked of capacity, and a fill bar. */}
                    <span className="mt-1.5 hidden space-y-1 sm:block">
                      {ss.slice(0, 3).map((s) => (
                        <span key={s.id} className={`block rounded-md bg-white/80 px-1.5 py-1 ring-1 ring-ink/10 ${out ? "opacity-50" : ""}`}>
                          <span className="flex items-center gap-1 text-[0.68rem] leading-tight">
                            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[s.programKind] ?? "bg-ink/40"}`} />
                            <span className="truncate">{program === "all" ? s.programName.replace("Yalla ", "") : shortGroup(s.group)}</span>
                          </span>
                          <span className="mt-1 flex items-center gap-1.5">
                            <span className="block h-1 flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
                              <span className={`block h-full ${barTone(s)}`} style={{ width: `${fill(s)}%` }} />
                            </span>
                            <span className={`text-[0.66rem] leading-none tabular-nums ${s.booked ? "text-ink" : "text-ink-soft"}`}>
                              {s.capacity ? `${s.booked}/${s.capacity}` : s.booked}
                            </span>
                          </span>
                        </span>
                      ))}
                      {ss.length > 3 ? <span className="block text-[0.66rem] text-ink-soft">+{ss.length - 3} more</span> : null}
                    </span>
                    {ss.length ? <span aria-hidden className={`mt-2 block h-1.5 w-1.5 rounded-full sm:hidden ${KIND_DOT[ss[0].programKind] ?? "bg-ink/40"}`} /> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </Card>

        {/* The chosen day */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          <Card
            title={selected ? fmtDate(selected, "EEEE d MMMM") : "Choose a day"}
            actions={selected ? <Link href={`/admin/roster?date=${selected}`} className="text-[0.82rem] text-blue hover:underline">Open roster →</Link> : null}
          >
            {!selected || !rosters.length ? (
              <Empty title={selected ? (emptyHidden ? "No one booked this day" : "Nothing scheduled this day") : "Tap a day to see who’s coming"}>
                {emptyHidden ? `${emptyHidden} session${emptyHidden === 1 ? "" : "s"} scheduled, none booked yet.` : null}
              </Empty>
            ) : (
              <div className="space-y-6">
                {emptyHidden ? <p className="text-[0.78rem] text-ink-soft">Showing sessions with bookings. {emptyHidden} more scheduled with no one booked yet.</p> : null}
                {rosters.map(({ s, r }) => {
                  const coming = r.children.filter((c) => c.expected || c.attendance?.status === "checked_in" || c.attendance?.status === "checked_out");
                  const notComing = r.children.filter((c) => !coming.includes(c));
                  return (
                    <section key={s.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium text-ink">
                            <span aria-hidden className={`h-2 w-2 rounded-full ${KIND_DOT[s.programKind] ?? "bg-ink/40"}`} />
                            {program === "all" ? s.title : s.group}
                          </p>
                          <p className="text-[0.78rem] text-ink-soft">
                            {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
                            {s.waiting ? ` · ${s.waiting} on the waitlist` : ""}
                          </p>
                        </div>
                        <div className="w-28 shrink-0 text-right">
                          <p className="text-[0.82rem] tabular-nums">
                            <span className="font-medium">{s.booked}</span>
                            <span className="text-ink-soft">{s.capacity ? ` of ${s.capacity}` : " booked"}</span>
                          </p>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
                            <span className={`block h-full ${barTone(s)}`} style={{ width: `${fill(s)}%` }} />
                          </span>
                        </div>
                      </div>
                      {coming.length ? (
                        <ul className="mt-3 divide-y divide-ink/[0.07] rounded-lg ring-1 ring-ink/10">
                          {coming.map((c) => (
                            <li key={c.childId} className="flex items-start gap-3 px-3 py-2.5">
                              <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist text-[0.8rem] text-blue">
                                {(c.preferredName || c.name)[0]}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <Link href={`/admin/families/${c.familyId}`} className="text-[0.9rem] text-ink hover:text-blue">
                                    {c.preferredName ? `${c.preferredName} ${c.name.split(" ").slice(1).join(" ")}` : c.name}
                                  </Link>
                                  <span className="text-[0.75rem] text-ink-soft">{c.age}</span>
                                </span>
                                <span className="mt-1 flex flex-wrap gap-1.5">
                                  {c.extras.map((x) => (
                                    <Pill key={x} tone="info">
                                      {x.replace(/ \(.*\)$/, "")}
                                    </Pill>
                                  ))}
                                  {c.care?.allergies ? (
                                    <Pill tone="warning" icon="alert">
                                      Allergies
                                    </Pill>
                                  ) : null}
                                  {c.paperwork?.length ? <Pill tone="critical">{c.paperwork.length} form{c.paperwork.length === 1 ? "" : "s"} missing</Pill> : null}
                                  {c.source === "membership" ? <Pill tone="neutral">Club Yalla</Pill> : null}
                                </span>
                                {c.care?.allergies ? <span className="mt-1 block text-[0.75rem] text-[#8a5212]">{c.care.allergies}</span> : null}
                              </span>
                              <span className="shrink-0">
                                <Status kind="attendance" value={c.attendance?.status ?? "expected"} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 rounded-lg bg-[#f7f5ef] px-3 py-2.5 text-[0.82rem] text-ink-soft">No one booked yet.</p>
                      )}
                      {notComing.length ? (
                        <p className="mt-2 text-[0.75rem] text-ink-soft">
                          Not coming:{" "}
                          {Object.entries(
                            notComing.reduce<Record<string, string[]>>((acc, c) => {
                              const why = c.notExpectedReason?.toLowerCase() ?? "cancelled";
                              (acc[why] ??= []).push(c.preferredName || c.name.split(" ")[0]);
                              return acc;
                            }, {}),
                          )
                            .map(([why, names]) => `${[...new Set(names)].join(", ")} (${why})`)
                            .join("; ")}
                        </p>
                      ) : null}
                      <p className="mt-2 flex gap-4 text-[0.78rem]">
                        <Link href={`/admin/roster?date=${s.date}&session=${s.id}`} className="text-blue hover:underline">
                          Check in on the roster
                        </Link>
                        <a href={`/admin/export/roster/${s.id}`} className="text-blue hover:underline">
                          Download roster
                        </a>
                      </p>
                    </section>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
