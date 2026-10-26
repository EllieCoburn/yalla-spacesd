import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionEditor } from "@/components/admin/bookings/SessionEditor";
import { ActionForm, Disclosure, TextField } from "@/components/admin/forms";
import { Capacity, Card, DL, Empty, LinkButton, Money, Notice, PageHeader, Pill, Status, Table } from "@/components/admin/ui";
import { sessionDetail } from "@/lib/admin/queries/bookings";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { publicState } from "@/lib/ops/capacity";
import { WEEKDAY } from "@/lib/ops/memberships";
import { ageLabel, addDaysISO, fmtDate, fmtDateTime, fmtTime } from "@/lib/time";
import { applyChangeAction, duplicateAction, previewChangeAction } from "./actions";

export const metadata = { title: "Session" };

const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duplicated?: string }> }) {
  const staff = await requirePermission("programs.view");
  const { id } = await params;
  const { duplicated } = await searchParams;
  const d = await sessionDetail(getDb(), id);
  if (!d) notFound();
  const { s, p, availability: a } = d;
  const o = a.occupancy;
  const schedule = can(staff, "schedule.manage");
  const showBookings = can(staff, "bookings.view");
  const ps = publicState(s, p, a.remaining);
  const publicLabel =
    ps.state === "available" ? `Bookable · ${ps.remaining ?? "spots"} left` : ps.state === "limited" ? `Bookable · ${ps.showCount ? `only ${ps.remaining} left` : "few spots left"}` : ps.state === "full" ? `Fully booked${ps.waitlist ? " · waitlist open" : ""}` : ps.state === "closed" ? ps.reason : "Not offered";
  const confirmed = d.attendees.filter((x) => x.item.status === "confirmed");
  const held = d.attendees.filter((x) => x.item.status === "held");
  const cancelled = d.attendees.filter((x) => x.item.status === "cancelled");
  const current = {
    startTime: hhmm(s.startsAt),
    endTime: hhmm(s.endsAt),
    capacity: s.capacity,
    hardCapacity: s.hardCapacity,
    reservedSpots: s.reservedSpots,
    price: s.priceCents == null ? "" : (s.priceCents / 100).toFixed(2),
    status: s.status,
    notes: s.notes ?? "",
  };

  return (
    <>
      <PageHeader
        back={{ href: `/admin/bookings?view=calendar&week=${s.localDate}`, label: "Week view" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {s.title ?? p.name}
            <Status kind="session" value={s.status} />
          </span>
        }
        subtitle={`${fmtDate(s.localDate, "EEEE d MMMM yyyy")} · ${fmtTime(s.startsAt)}–${fmtTime(s.endsAt)} · ${d.location?.name ?? "No location"}`}
        actions={
          <>
            {can(staff, "roster.view") ? (
              <>
                <LinkButton href={`/admin/roster?date=${s.localDate}&session=${s.id}`}>Open roster</LinkButton>
                <LinkButton href={`/admin/roster/${s.id}/print`}>Print roster</LinkButton>
              </>
            ) : null}
            {can(staff, "bookings.manage") && s.status === "scheduled" ? (
              <LinkButton href={`/admin/bookings/new`} variant="primary">
                New booking
              </LinkButton>
            ) : null}
          </>
        }
      />
      {duplicated ? (
        <div className="mb-5">
          <Notice tone="positive">Session duplicated. You’re viewing the new copy.</Notice>
        </div>
      ) : null}
      {s.notes ? (
        <div className="mb-5">
          <Notice tone={s.status === "scheduled" ? "info" : "warning"}>{s.notes}</Notice>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card title="Capacity">
            <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
              <Capacity used={o.used} capacity={a.effectiveCapacity} remaining={a.remaining} />
              <Pill tone={ps.state === "full" ? "critical" : ps.state === "limited" ? "warning" : ps.state === "available" ? "positive" : "muted"} icon={ps.state === "available" ? "check" : ps.state === "full" ? "x" : "alert"}>
                Families see: {publicLabel}
              </Pill>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-[0.84rem] sm:grid-cols-4">
              {[
                ["Confirmed", o.booked],
                ["Held in checkout", o.held],
                ["Club Yalla members", o.members],
                ["Reserved by staff", o.reserved],
                ["Capacity", s.capacity],
                ["Effective capacity", a.effectiveCapacity],
                ["Hard capacity", s.hardCapacity ?? "—"],
                ["Remaining", a.remaining],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-lg bg-ink/[0.03] px-3 py-2">
                  <dt className="text-[0.7rem] tracking-[0.04em] text-ink-soft uppercase">{k}</dt>
                  <dd className="mt-0.5 font-serif text-[1.3rem] tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            {d.pool ? (
              <p className="mt-4 text-[0.82rem] text-ink-soft">
                Shares the <span className="font-medium text-ink">{d.pool.name}</span> ({d.pool.capacity} places) with overlapping sessions · {a.poolRemaining ?? 0} place(s) left in the shared space. Remaining spots are the lower of this session’s and the shared space’s.
              </p>
            ) : null}
            {d.overrides.length ? (
              <div className="mt-4">
                <p className="text-[0.72rem] font-medium tracking-[0.04em] text-ink-soft uppercase">Recorded overrides</p>
                <ul className="mt-1 space-y-1 text-[0.82rem]">
                  {d.overrides.map(({ o: ov, staffName, reference }) => (
                    <li key={ov.id}>
                      +{ov.extraSpots} by {staffName ?? "staff"} on {fmtDateTime(ov.createdAt)} — {ov.reason}
                      {reference ? ` (${reference})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card title={`Attending · ${confirmed.length + d.members.length}`} padded={false}>
            {confirmed.length + held.length + d.members.length === 0 ? (
              <div className="p-5">
                <Empty title="No one is booked yet" />
              </div>
            ) : (
              <Table head={["Child", "Age on day", "Family", "Through", "Status"]} dense>
                {d.members.map(({ m, c }) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/admin/children/${c.id}`} className="text-ink hover:text-blue">
                        {c.preferredName || c.firstName} {c.lastName}
                      </Link>
                    </td>
                    <td className="tabular-nums">{ageLabel(c.birthDate, s.localDate)}</td>
                    <td>{d.memberFamilies.get(m.familyId)}</td>
                    <td>
                      <Link href={`/admin/memberships/${m.id}`} className="text-blue hover:underline">
                        Club Yalla
                      </Link>
                      <span className="block text-[0.72rem] text-ink-soft">{m.weekdays.map((w) => WEEKDAY[w]).join(" ")} · {m.dayLength}</span>
                    </td>
                    <td>
                      <Status kind="membership" value={m.status} />
                    </td>
                  </tr>
                ))}
                {[...confirmed, ...held].map(({ item, b, child, familyName }) => (
                  <tr key={item.id}>
                    <td>
                      {child ? (
                        <Link href={`/admin/children/${child.id}`} className="text-ink hover:text-blue">
                          {child.preferredName || child.firstName} {child.lastName}
                        </Link>
                      ) : (
                        "Family booking"
                      )}
                    </td>
                    <td className="tabular-nums">{child ? ageLabel(child.birthDate, s.localDate) : "—"}</td>
                    <td>{familyName}</td>
                    <td>
                      {showBookings ? (
                        <Link href={`/admin/bookings/${b.id}`} className="text-blue hover:underline">
                          {b.reference}
                        </Link>
                      ) : (
                        b.reference
                      )}
                    </td>
                    <td>
                      <Status kind="item" value={item.status} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
            {cancelled.length ? <p className="border-t border-ink/8 px-5 py-3 text-[0.78rem] text-ink-soft">{cancelled.length} cancelled booking item(s) are not counted.</p> : null}
          </Card>

          <Card title={`Waitlist · ${d.waitlist.length}`} actions={<Link href="/admin/waitlist" className="text-blue">Waitlist →</Link>} padded={false}>
            {d.waitlist.length === 0 ? (
              <p className="p-5 text-[0.85rem] text-ink-soft">No one is waiting for this session.</p>
            ) : (
              <ul className="divide-y divide-ink/6">
                {d.waitlist.map(({ w, familyName }) => (
                  <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[0.85rem]">
                    <span>
                      {familyName} · {w.partySize} {w.partySize === 1 ? "child" : "children"}
                      <span className="block text-[0.74rem] text-ink-soft">Joined {fmtDateTime(w.createdAt)}</span>
                    </span>
                    <Status kind="waitlist" value={w.status} suffix={w.offerExpiresAt && w.status === "offered" ? `until ${fmtDateTime(w.offerExpiresAt)}` : undefined} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <DL
              cols={1}
              items={[
                { label: "Program", value: <Link href={`/admin/programs/${p.id}`} className="text-blue hover:underline">{p.name}</Link> },
                { label: "Cohort", value: d.cohort?.name },
                { label: "Location", value: d.location?.name },
                { label: "Arrival instructions", value: p.arrivalInstructions ?? d.location?.arrivalInstructions },
                { label: "Price", value: s.priceCents != null ? <Money cents={s.priceCents} /> : "From the program’s price table" },
                {
                  label: "Series",
                  value: d.series ? `${d.series.title ?? "Weekly schedule"} · ${d.series.weekdays.map((w) => WEEKDAY[w]).join(", ")} · ${fmtDate(d.series.starts_on, "d MMM")}–${fmtDate(d.series.ends_on, "d MMM yyyy")}${s.isException ? " · edited individually" : ""}` : "One-off session",
                },
                { label: "Booking window", value: s.bookingOpensAt || s.bookingClosesAt ? `${s.bookingOpensAt ? `Opens ${fmtDateTime(s.bookingOpensAt)}` : ""} ${s.bookingClosesAt ? `Closes ${fmtDateTime(s.bookingClosesAt)}` : ""}` : `Program rules · ${p.minNoticeHours}h minimum notice` },
              ]}
            />
          </Card>

          {schedule ? (
            <Card title="Manage session">
              <div className="space-y-2">
                <Disclosure label="Edit time, capacity, reserved spots or price" defaultOpen={false}>
                  <SessionEditor sessionId={s.id} inSeries={!!s.seriesId} current={current} preview={previewChangeAction} apply={applyChangeAction} mode="edit" />
                </Disclosure>
                <Disclosure label="Duplicate to another date">
                  <ActionForm action={duplicateAction} submit={{ label: "Duplicate session", variant: "secondary" }}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <TextField name="toDate" label="New date" type="date" defaultValue={addDaysISO(s.localDate, 7)} required />
                    <p className="text-[0.75rem] text-ink-soft">Copies time, capacity, cohort, shared space and price. Bookings are not copied.</p>
                  </ActionForm>
                </Disclosure>
                {s.status === "scheduled" ? (
                  <>
                    <Disclosure label="Close session (e.g. staff training)">
                      <SessionEditor sessionId={s.id} inSeries={!!s.seriesId} current={current} preview={previewChangeAction} apply={applyChangeAction} mode="close" />
                    </Disclosure>
                    <Disclosure label="Cancel session">
                      <SessionEditor sessionId={s.id} inSeries={!!s.seriesId} current={current} preview={previewChangeAction} apply={applyChangeAction} mode="cancel" />
                    </Disclosure>
                  </>
                ) : (
                  <Disclosure label="Reopen session">
                    <ActionForm action={applyChangeAction} submit={{ label: "Reopen for booking", variant: "secondary" }}>
                      <input type="hidden" name="sessionId" value={s.id} />
                      <input type="hidden" name="scope" value="this" />
                      <input type="hidden" name="status" value="scheduled" />
                      <input type="hidden" name="confirmAffected" value="on" />
                      <p className="text-[0.8rem] text-ink-soft">Makes this one session bookable again.</p>
                    </ActionForm>
                  </Disclosure>
                )}
              </div>
              <p className="mt-3 text-[0.75rem] text-ink-soft">
                Changes are previewed first. Bookings, charges and notifications are never changed silently. Times are Pacific (America/Los_Angeles).
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
