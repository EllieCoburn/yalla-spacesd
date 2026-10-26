import Link from "next/link";
import { PaperworkPill, PaymentPill } from "@/components/admin/bookings/pills";
import { btn, Capacity, Card, Empty, FilterBar, FilterField, inputCls, LinkButton, PageHeader, Status, Table } from "@/components/admin/ui";
import { filterOptions, listBookings, weekSessions, type BookingFilters } from "@/lib/admin/queries/bookings";
import { STATUS } from "@/lib/admin/status";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { addDaysISO, fmtDate, fmtTime, todayLA, weekdayOf } from "@/lib/time";

export const metadata = { title: "Bookings" };

type SP = BookingFilters & { view?: string; page?: string; week?: string };

const PAYMENT_OPTIONS = [
  { value: "", label: "Any payment" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partly paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "none", label: "No invoice" },
  { value: "free", label: "No charge" },
];

export default async function BookingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requirePermission("bookings.view");
  const sp = await searchParams;
  const db = getDb();
  const opts = await filterOptions(db);
  const view = sp.view === "calendar" ? "calendar" : "list";
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) p.set(k, String(v));
    return `/admin/bookings?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Every booking, with booking, payment and paperwork status kept separate."
        actions={
          <>
            <div className="inline-flex rounded-lg border border-ink/15 bg-white p-0.5" role="group" aria-label="View">
              <Link href={keep({ view: undefined, page: undefined })} aria-current={view === "list" ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-[0.82rem] ${view === "list" ? "bg-ink text-chalk" : "text-ink-soft hover:text-ink"}`}>
                List
              </Link>
              <Link href={keep({ view: "calendar", page: undefined })} aria-current={view === "calendar" ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-[0.82rem] ${view === "calendar" ? "bg-ink text-chalk" : "text-ink-soft hover:text-ink"}`}>
                Week
              </Link>
            </div>
            {can(staff, "bookings.manage") ? (
              <LinkButton href="/admin/bookings/new" variant="primary">
                New booking
              </LinkButton>
            ) : null}
          </>
        }
      />

      <FilterBar action="/admin/bookings">
        {view === "calendar" ? <input type="hidden" name="view" value="calendar" /> : null}
        {view === "list" ? (
          <FilterField label="Search">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Family, child, email, YL-…" className={inputCls} />
          </FilterField>
        ) : null}
        <FilterField label="Program">
          <select name="program" defaultValue={sp.program ?? ""} className={inputCls}>
            <option value="">All programs</option>
            {opts.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FilterField>
        {view === "list" ? (
          <>
            <FilterField label="From">
              <input type="date" name="from" defaultValue={sp.from ?? ""} className={inputCls} />
            </FilterField>
            <FilterField label="To">
              <input type="date" name="to" defaultValue={sp.to ?? ""} className={inputCls} />
            </FilterField>
          </>
        ) : (
          <FilterField label="Week of">
            <input type="date" name="week" defaultValue={sp.week ?? todayLA()} className={inputCls} />
          </FilterField>
        )}
        {opts.locations.length > 1 ? (
          <FilterField label="Location">
            <select name="location" defaultValue={sp.location ?? ""} className={inputCls}>
              <option value="">All locations</option>
              {opts.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </FilterField>
        ) : null}
        <FilterField label="Cohort">
          <select name="cohort" defaultValue={sp.cohort ?? ""} className={inputCls}>
            <option value="">All cohorts</option>
            {opts.cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterField>
        {view === "list" ? (
          <>
            <FilterField label="Booking status">
              <select name="status" defaultValue={sp.status ?? ""} className={inputCls}>
                <option value="">Active & past (not expired)</option>
                {Object.entries(STATUS.booking).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </FilterField>
            {can(staff, "billing.view") ? (
              <FilterField label="Payment">
                <select name="payment" defaultValue={sp.payment ?? ""} className={inputCls}>
                  {PAYMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </FilterField>
            ) : null}
            {can(staff, "forms.view") ? (
              <FilterField label="Paperwork">
                <select name="paperwork" defaultValue={sp.paperwork ?? ""} className={inputCls}>
                  <option value="">Any paperwork</option>
                  <option value="complete">Complete</option>
                  <option value="issues">Needs forms</option>
                </select>
              </FilterField>
            ) : null}
          </>
        ) : null}
      </FilterBar>

      {view === "calendar" ? <WeekView sp={sp} /> : <ListView sp={sp} keep={keep} billing={can(staff, "billing.view")} forms={can(staff, "forms.view")} />}
    </>
  );
}

async function ListView({ sp, keep, billing, forms }: { sp: SP; keep: (e: Record<string, string | undefined>) => string; billing: boolean; forms: boolean }) {
  const page = Math.max(1, Number(sp.page) || 1);
  const res = await listBookings(getDb(), { ...sp, payment: billing ? sp.payment : undefined, paperwork: forms ? sp.paperwork : undefined }, page, { paperwork: forms });
  if (!res.rows.length)
    return (
      <Card>
        <Empty title="No bookings match these filters">Try widening the date range or clearing a filter.</Empty>
      </Card>
    );
  return (
    <Card padded={false}>
      <Table head={["Reference", "Family & children", "Program · first session", "Booking", "Payment", ...(forms ? ["Paperwork"] : [])]}>
        {res.rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={`/admin/bookings/${r.id}`} className="font-medium text-ink hover:text-blue">
                {r.reference}
              </Link>
              <span className="block text-[0.72rem] text-ink-soft">
                {r.source === "admin" ? "Staff" : r.source === "waitlist" ? "Waitlist offer" : "Online"}
                {r.status === "cancelled" ? "" : ` · ${r.itemCount} item${r.itemCount === 1 ? "" : "s"}`}
              </span>
            </td>
            <td>
              <Link href={`/admin/families/${r.familyId}`} className="text-ink hover:text-blue">
                {r.familyName}
              </Link>
              <span className="block text-[0.78rem] text-ink-soft">{r.children.join(", ") || "—"}</span>
            </td>
            <td>
              <span className="block text-ink">{r.programs.join(", ")}</span>
              {r.firstSession ? (
                <Link href={`/admin/sessions/${r.firstSession.id}`} className="text-[0.78rem] text-ink-soft hover:text-blue">
                  {fmtDate(r.firstSession.localDate, "EEE d MMM")} · {fmtTime(r.firstSession.startsAt)}–{fmtTime(r.firstSession.endsAt)}
                </Link>
              ) : null}
            </td>
            <td>
              <Status kind="booking" value={r.status} />
            </td>
            <td>{billing ? <PaymentPill state={r.payment} /> : <PaymentPill state={r.payment === "partial" ? "unpaid" : r.payment} />}</td>
            {forms ? (
              <td>
                <PaperworkPill state={r.paperwork} />
              </td>
            ) : null}
          </tr>
        ))}
      </Table>
      <div className="flex items-center justify-between border-t border-ink/8 px-5 py-3 text-[0.82rem] text-ink-soft">
        <span>
          {res.total} booking{res.total === 1 ? "" : "s"} · page {res.page} of {res.pages}
        </span>
        <span className="flex gap-2">
          {res.page > 1 ? (
            <Link className={btn.secondary} href={keep({ page: String(res.page - 1) })}>
              ← Previous
            </Link>
          ) : null}
          {res.page < res.pages ? (
            <Link className={btn.secondary} href={keep({ page: String(res.page + 1) })}>
              Next →
            </Link>
          ) : null}
        </span>
      </div>
    </Card>
  );
}

async function WeekView({ sp }: { sp: SP }) {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : todayLA();
  const monday = addDaysISO(anchor, -((weekdayOf(anchor) + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
  const rows = await weekSessions(getDb(), monday, days[6], sp);
  const week = (d: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, week: d })) if (v) p.set(k, String(v));
    return `/admin/bookings?${p}`;
  };
  const today = todayLA();
  return (
    <Card
      title={`Week of ${fmtDate(monday, "d MMMM yyyy")}`}
      actions={
        <span className="flex gap-1">
          <Link className={btn.ghost} href={week(addDaysISO(monday, -7))} aria-label="Previous week">
            ←
          </Link>
          <Link className={btn.ghost} href={week(today)}>
            This week
          </Link>
          <Link className={btn.ghost} href={week(addDaysISO(monday, 7))} aria-label="Next week">
            →
          </Link>
        </span>
      }
      padded={false}
    >
      <div className="grid divide-y divide-ink/8 md:grid-cols-7 md:divide-x md:divide-y-0">
        {days.map((d) => {
          const list = rows
            .filter((r) => r.session.localDate === d)
            .sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime() || (a.session.title ?? a.program.name).localeCompare(b.session.title ?? b.program.name));
          return (
            <section key={d} className={`min-h-40 p-3 ${d === today ? "bg-mist/30" : ""}`} aria-label={fmtDate(d, "EEEE d MMMM")}>
              <h3 className="mb-2 flex items-baseline justify-between text-[0.78rem] font-medium text-ink">
                <span>{fmtDate(d, "EEE")}</span>
                <span className={`tabular-nums ${d === today ? "rounded-full bg-blue px-1.5 text-white" : "text-ink-soft"}`}>{fmtDate(d, "d")}</span>
              </h3>
              {list.length === 0 ? <p className="text-[0.75rem] text-ink-soft/70">No sessions</p> : null}
              <ul className="space-y-2">
                {list.map((r) => (
                  <li key={r.session.id}>
                    <Link href={`/admin/sessions/${r.session.id}`} className={`block rounded-lg border p-2 text-[0.76rem] transition-colors hover:border-blue/50 ${r.session.status === "scheduled" ? "border-ink/10 bg-white" : "border-dashed border-ink/20 bg-transparent"}`}>
                      <span className="block font-medium text-ink">{r.session.title ?? r.program.name}</span>
                      <span className="block text-ink-soft tabular-nums">
                        {fmtTime(r.session.startsAt)}–{fmtTime(r.session.endsAt)}
                      </span>
                      {r.session.status !== "scheduled" ? (
                        <span className="mt-1 block">
                          <Status kind="session" value={r.session.status} />
                        </span>
                      ) : (
                        <span className="mt-1.5 block">
                          <Capacity used={r.availability.occupancy.used} capacity={r.availability.effectiveCapacity} remaining={r.availability.remaining} />
                          {r.availability.poolId && r.availability.remaining < r.availability.effectiveCapacity - r.availability.occupancy.used ? (
                            <span className="mt-1 block text-[0.68rem] text-ink-soft">Limited by shared room</span>
                          ) : null}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}
