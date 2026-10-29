import Link from "next/link";
import { ActionForm, Checkbox, Disclosure, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { btn, Card, Empty, FilterBar, FilterField, inputCls, Money, Notice, PageHeader, Pill, Stat, Status, Table } from "@/components/admin/ui";
import { familiesForPicker } from "@/lib/admin/queries/programs";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { adminCalendar, BLOCK_KINDS, listGroups, needsAttention, spaceReport, upcomingBlocks } from "@/lib/spaces/admin";
import { BOOKING_TYPE_LABEL, CATEGORY_LABEL, getSpaceConfig, toMinutes, type BookingType, type Category } from "@/lib/spaces/config";
import { addDaysISO, fmtDate, fmtDateTime, fmtTime, localDateOf, todayLA, weekdayOf } from "@/lib/time";
import { createBlockAction, createReservationAction, removeBlockAction } from "./actions";

export const metadata = { title: "Space reservations" };

const laMin = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  return Number(p.find((x) => x.type === "hour")!.value) * 60 + Number(p.find((x) => x.type === "minute")!.value);
};

export default async function SpacesAdmin({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; q?: string; status?: string }> }) {
  const staff = await requirePermission("spaces.view");
  const sp = await searchParams;
  const db = getDb();
  const today = todayLA();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const view = sp.view === "week" ? "week" : "day";
  const weekStart = addDaysISO(date, -((weekdayOf(date) + 6) % 7));
  const range = view === "week" ? { from: weekStart, to: addDaysISO(weekStart, 6) } : { from: date, to: date };
  const canManage = can(staff, "spaces.manage");
  const canConfigure = can(staff, "spaces.configure");
  const monthStart = `${today.slice(0, 8)}01`;
  const [cal, attention, list, blocks, month, todayCal, nextWeek, cfg, fams] = await Promise.all([
    adminCalendar(db, range.from, range.to),
    needsAttention(db),
    listGroups(db, { q: sp.q, status: sp.status || undefined, limit: 50 }),
    upcomingBlocks(db),
    spaceReport(db, monthStart, addDaysISO(addDaysISO(`${today.slice(0, 7)}-28`, 4).slice(0, 7) + "-01", -1)),
    adminCalendar(db, today, today),
    adminCalendar(db, today, addDaysISO(today, 6)),
    getSpaceConfig(db),
    canManage ? familiesForPicker(db) : Promise.resolve([]),
  ]);
  const q = (o: Record<string, string>) => `/admin/spaces?${new URLSearchParams({ date, view, ...o })}`;
  const step = view === "week" ? 7 : 1;
  const active = cal.workspaces.filter((w) => w.active);
  const opens = Object.values(cfg.hours).map(([o]) => toMinutes(o));
  const closes = Object.values(cfg.hours).map(([, c]) => toMinutes(c));
  const from = Math.floor((opens.length ? Math.min(...opens) : 510) / 60) * 60;
  const to = Math.ceil((closes.length ? Math.max(...closes) : 990) / 60) * 60;
  const pct = (m: number) => `${((Math.min(Math.max(m, from), to) - from) / (to - from)) * 100}%`;
  const ticks = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60);

  return (
    <>
      <PageHeader
        title="Space reservations"
        subtitle="Who’s booked, when, and what’s open."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/spaces/reports" className={btn.secondary}>
              Reports
            </Link>
            {canConfigure ? (
              <Link href="/admin/spaces/setup" className={btn.secondary}>
                Workspaces, rates & policies
              </Link>
            ) : null}
          </div>
        }
      />

      {attention.length ? (
        <div className="mb-6">
          <Notice tone="critical" title={`${attention.length} reservation${attention.length === 1 ? "" : "s"} need attention`}>
            Payment arrived after the hold ended and the time was taken. Refund or rebook:{" "}
            {attention.map((a, i) => (
              <span key={a.id}>
                {i ? ", " : ""}
                <Link className={btn.link} href={`/admin/spaces/${a.id}`}>
                  {a.reference} · {a.familyName}
                </Link>
              </span>
            ))}
          </Notice>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Today" value={todayCal.reservations.length} sub="reservations" />
        <Stat label="Next 7 days" value={nextWeek.reservations.length} sub="reservations" />
        <Stat label="Complimentary" value={month.complimentary} sub="this month" />
        <Stat label="Paid" value={month.paid} sub="this month" />
        <Stat label="Workspace revenue" value={<Money cents={month.revenueCents} />} sub="this month" />
        <Stat label="Cancellations" value={month.cancelled} sub={`this month · ${month.cancellationRate}%`} />
      </div>

      <Card
        title={view === "week" ? `Week of ${fmtDate(weekStart, "EEE d MMM")}` : fmtDate(date, "EEEE d MMMM")}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            <Link className={btn.ghost} href={q({ view: "day" })} aria-current={view === "day" ? "page" : undefined}>
              <span className={view === "day" ? "font-semibold text-ink" : ""}>Day</span>
            </Link>
            <Link className={btn.ghost} href={q({ view: "week" })} aria-current={view === "week" ? "page" : undefined}>
              <span className={view === "week" ? "font-semibold text-ink" : ""}>Week</span>
            </Link>
            <Link className={btn.secondary} href={q({ date: addDaysISO(date, -step) })} aria-label="Previous">
              ←
            </Link>
            {date !== today ? (
              <Link className={btn.secondary} href={q({ date: today })}>
                Today
              </Link>
            ) : null}
            <Link className={btn.secondary} href={q({ date: addDaysISO(date, step) })} aria-label="Next">
              →
            </Link>
          </div>
        }
      >
        {view === "day" ? (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[9rem_1fr]">
                <div />
                <div className="relative h-6 text-[0.7rem] text-ink-soft">
                  {ticks.map((t) => (
                    <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pct(t) }}>
                      {`${Math.floor(t / 60) % 12 || 12}${Math.floor(t / 60) >= 12 ? "pm" : "am"}`}
                    </span>
                  ))}
                </div>
              </div>
              {active.map((w) => {
                const res = cal.reservations.filter((r) => r.workspaceId === w.id);
                const blk = cal.blocks.filter((b) => !b.workspaceId || b.workspaceId === w.id);
                return (
                  <div key={w.id} className="grid grid-cols-[9rem_1fr] items-center border-t border-ink/8 py-2">
                    <div>
                      <p className="text-[0.88rem] font-medium">{w.name}</p>
                      <p className="text-[0.7rem] text-ink-soft">{CATEGORY_LABEL[w.category as Category]}</p>
                    </div>
                    <div className="relative h-11 rounded-md bg-[#fbfaf6] ring-1 ring-ink/8 ring-inset">
                      {ticks.map((t) => (
                        <span key={t} className="absolute inset-y-0 w-px bg-ink/6" style={{ left: pct(t) }} />
                      ))}
                      {blk.map((b) => (
                        <div
                          key={b.id}
                          className="hatch-dark absolute inset-y-1 flex items-center overflow-hidden rounded px-2 text-[0.7rem] text-ink-soft"
                          style={{ left: pct(laMin(b.startsAt)), width: `calc(${pct(b.endsAt.getTime() - b.startsAt.getTime() >= 86400000 ? to : laMin(b.endsAt) || to)} - ${pct(laMin(b.startsAt))})` }}
                          title={`${BLOCK_KINDS.find((k) => k.value === b.kind)?.label}${b.reason ? ` · ${b.reason}` : ""}`}
                        >
                          <span className="truncate">{BLOCK_KINDS.find((k) => k.value === b.kind)?.label}</span>
                        </div>
                      ))}
                      {res.map((r) => (
                        <Link
                          key={r.id}
                          href={`/admin/spaces/${r.groupId}`}
                          className={`absolute inset-y-1 flex flex-col justify-center overflow-hidden rounded px-2 text-[0.7rem] leading-tight ring-1 ring-inset hover:z-10 hover:shadow ${r.status === "held" ? "bg-[#f8eedd] text-[#8a5212] ring-[#8a5212]/25" : r.totalCents ? "bg-[#e9e9fb] text-[#3d40b8] ring-[#3d40b8]/25" : "bg-[#e6f0ea] text-[#2c6447] ring-[#2c6447]/20"}`}
                          style={{ left: pct(laMin(r.startsAt)), width: `calc(${pct(laMin(r.endsAt))} - ${pct(laMin(r.startsAt))})` }}
                          title={`${r.familyName} · ${fmtTime(r.startsAt)} – ${fmtTime(r.endsAt)} · ${BOOKING_TYPE_LABEL[r.bookingType as BookingType]}`}
                        >
                          <span className="truncate font-medium">{r.familyName}</span>
                          <span className="truncate opacity-75">
                            {fmtTime(r.startsAt)} – {fmtTime(r.endsAt)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="mt-3 flex flex-wrap gap-3 text-[0.72rem] text-ink-soft">
                <Pill tone="positive">Complimentary</Pill>
                <Pill tone="info">Paid</Pill>
                <Pill tone="warning">Held for payment</Pill>
                <span className="hatch-dark inline-block rounded px-2 py-0.5">Closed</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[0.8rem]">
              <thead>
                <tr className="text-left text-[0.7rem] text-ink-soft uppercase">
                  <th className="py-2 pr-3 font-medium">Space</th>
                  {Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)).map((d) => (
                    <th key={d} className="px-2 py-2 font-medium">
                      <Link href={`/admin/spaces?date=${d}&view=day`} className="hover:text-ink">
                        {fmtDate(d, "EEE d")}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {active.map((w) => (
                  <tr key={w.id} className="align-top">
                    <td className="py-2 pr-3 font-medium">{w.name}</td>
                    {Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)).map((d) => {
                      const res = cal.reservations.filter((r) => r.workspaceId === w.id && r.localDate === d);
                      const closed = cal.blocks.some((b) => (!b.workspaceId || b.workspaceId === w.id) && localDateOf(b.startsAt) <= d && localDateOf(new Date(b.endsAt.getTime() - 1)) >= d);
                      return (
                        <td key={d} className="space-y-1 px-2 py-2">
                          {res.map((r) => (
                            <Link key={r.id} href={`/admin/spaces/${r.groupId}`} className="block rounded bg-mist/50 px-1.5 py-1 hover:bg-mist">
                              <span className="block tabular-nums">
                                {fmtTime(r.startsAt)}–{fmtTime(r.endsAt)}
                              </span>
                              <span className="block truncate text-ink-soft">{r.familyName}</span>
                            </Link>
                          ))}
                          {closed ? <span className="hatch-dark block rounded px-1.5 py-1 text-ink-soft">Closure</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canManage ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="New reservation">
            <Disclosure label="Reserve a space for a family">
              <ActionForm action={createReservationAction} submit={{ label: "Reserve", pending: "Reserving…" }} resetOnSuccess>
                <SelectField name="familyId" label="Family" required options={[{ value: "", label: "Choose a family…" }, ...fams.map((f) => ({ value: f.id, label: f.name }))]} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField name="workspaceId" label="Workspace" required options={active.map((w) => ({ value: w.id, label: `${w.name} · ${CATEGORY_LABEL[w.category as Category]}` }))} />
                  <SelectField
                    name="bookingType"
                    label="Booking"
                    options={(["complimentary", "half_day", "full_day", "week", "hourly"] as BookingType[]).map((t) => ({ value: t, label: BOOKING_TYPE_LABEL[t] }))}
                  />
                  <TextField name="date" label="Date" type="date" required defaultValue={date} />
                  <SelectField
                    name="half"
                    label="Half day"
                    hint="For half-day bookings"
                    options={[
                      { value: "", label: "—" },
                      ...(cfg.halfDay.morning ? [{ value: "morning", label: `Morning (${cfg.halfDay.morning.start}–${cfg.halfDay.morning.end})` }] : []),
                      ...(cfg.halfDay.afternoon ? [{ value: "afternoon", label: `Afternoon (${cfg.halfDay.afternoon.start}–${cfg.halfDay.afternoon.end})` }] : []),
                    ]}
                  />
                  <TextField name="start" label="Start time" type="time" hint="Complimentary and hourly" />
                  <TextField name="minutes" label="Minutes" type="number" hint={`Complimentary: ${cfg.complimentary.durations.join(", ")}`} />
                </div>
                <SelectField
                  name="charge"
                  label="Charge"
                  hint="Paid types only. An invoice appears in the family’s Payments tab and in Billing."
                  options={[
                    { value: "invoice", label: "Create an invoice at the current rate" },
                    { value: "none", label: "No charge" },
                  ]}
                />
                <TextArea name="note" label="Staff note" rows={2} hint="Only staff see this." />
                {canConfigure ? <Checkbox name="override" label="Override booking rules" hint="Skips opening hours, notice, closures and the complimentary allowance. Never double-books." /> : null}
              </ActionForm>
            </Disclosure>
          </Card>
          <Card title="Closures">
            <Disclosure label="Close a workspace (maintenance, private event, team use…)">
              <ActionForm action={createBlockAction} submit={{ label: "Add closure", pending: "Saving…" }} resetOnSuccess>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField name="workspaceId" label="Workspace" options={[{ value: "", label: "All workspaces" }, ...active.map((w) => ({ value: w.id, label: w.name }))]} />
                  <SelectField name="kind" label="Reason" options={BLOCK_KINDS} />
                  <TextField name="date" label="From date" type="date" required defaultValue={date} />
                  <TextField name="endDate" label="To date" type="date" hint="Leave blank for one day" />
                  <TextField name="start" label="From time" type="time" defaultValue="08:30" />
                  <TextField name="end" label="To time" type="time" defaultValue="16:30" />
                </div>
                <TextField name="reason" label="Note" hint="Staff only. Families just see “unavailable”." />
                <Checkbox name="override" label="Close anyway if reservations exist" hint="Existing reservations stay; contact those families." />
              </ActionForm>
            </Disclosure>
            {blocks.length === 0 ? (
              <p className="mt-4 text-[0.85rem] text-ink-soft">No upcoming closures.</p>
            ) : (
              <ul className="mt-4 divide-y divide-ink/8 text-[0.85rem]">
                {blocks.map(({ block: b, workspace }) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <span className="font-medium">{workspace ?? "All workspaces"}</span> · {BLOCK_KINDS.find((k) => k.value === b.kind)?.label}
                      <span className="block text-[0.78rem] text-ink-soft">
                        {fmtDateTime(b.startsAt)} – {fmtDateTime(b.endsAt)}
                        {b.reason ? ` · ${b.reason}` : ""}
                      </span>
                    </span>
                    <ActionForm action={removeBlockAction} submit={{ label: "Remove", variant: "ghost" }} className="flex items-center gap-2">
                      <input type="hidden" name="blockId" value={b.id} />
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      <Card title="Reservations" className="mt-6" padded={false}>
        <div className="px-5 pt-4">
          <FilterBar action="/admin/spaces">
            <FilterField label="Search">
              <input name="q" defaultValue={sp.q} placeholder="Family or reference" className={inputCls} />
            </FilterField>
            <FilterField label="Status">
              <select name="status" defaultValue={sp.status ?? ""} className={inputCls}>
                <option value="">Any (not expired)</option>
                <option value="confirmed">Confirmed</option>
                <option value="held">Held</option>
                <option value="pending_payment">Awaiting payment</option>
                <option value="cancelled">Cancelled</option>
                <option value="needs_attention">Needs attention</option>
                <option value="expired">Expired holds</option>
              </select>
            </FilterField>
          </FilterBar>
        </div>
        {list.length === 0 ? (
          <div className="p-5">
            <Empty title="No reservations yet">Reservations families make in the portal appear here.</Empty>
          </div>
        ) : (
          <Table head={["Reference", "Family", "Space", "When", "Booking", "Status", "Total"]}>
            {list.map((g) => (
              <tr key={g.id}>
                <td>
                  <Link href={`/admin/spaces/${g.id}`} className={btn.link}>
                    {g.reference}
                  </Link>
                </td>
                <td>{g.familyName}</td>
                <td>{g.workspace}</td>
                <td className="tabular-nums">{g.first ? fmtDateTime(new Date(g.first)) : "—"}</td>
                <td>{BOOKING_TYPE_LABEL[g.bookingType as BookingType]}</td>
                <td>
                  <Status kind="booking" value={g.status} />
                </td>
                <td>{g.totalCents ? <Money cents={g.totalCents} /> : <span className="text-ink-soft">Included</span>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
