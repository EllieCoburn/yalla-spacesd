import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Checkbox, Disclosure, MoneyField, SelectField, TextField } from "@/components/admin/forms";
import { ProgramForm } from "@/components/admin/programs/ProgramForm";
import { SessionCreator } from "@/components/admin/programs/SessionCreator";
import { Capacity, Card, DL, Empty, Money, Notice, PageHeader, Pill, Status, Table, Tabs } from "@/components/admin/ui";
import { programDetail, referenceData } from "@/lib/admin/queries/programs";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { BOOKING_MODES, BOOKING_UNITS, PARENT_PRESENCE, PRICE_UNITS, PROGRAM_KINDS, programActivity, SERIES_MODES } from "@/lib/ops/programs";
import { addDaysISO, fmtDate, fmtTime, todayLA } from "@/lib/time";
import { WEEKDAY } from "@/lib/ops/memberships";
import {
  addPriceAction,
  addRequirementAction,
  deleteDraftAction,
  removeRequirementAction,
  saveCohortsAction,
  setStatusAction,
  updatePriceAction,
} from "../actions";
import { copySeriesAction } from "../../schedule/actions";

export const metadata = { title: "Program" };

const ENFORCEMENT: Record<string, string> = { blocks_booking: "Required before booking", before_attendance: "Required before attending", informational: "Informational" };
const PRICE_TABLE_UNITS = [
  { value: "session", label: "per session" },
  { value: "month", label: "per month" },
  { value: "series", label: "per series" },
  { value: "event", label: "per event" },
];

export default async function ProgramPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const staff = await requirePermission("programs.view");
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const d = await programDetail(db, id);
  if (!d) notFound();
  const ref = await referenceData(db);
  const activity = await programActivity(db, id);
  const p = d.program;
  const canEdit = can(staff, "programs.manage");
  const canSchedule = can(staff, "schedule.manage");
  const tab = sp.tab ?? "settings";
  const cohortName = new Map(ref.cohorts.map((c) => [c.id, c.name]));
  const usedTemplateIds = new Set(d.requirements.map((r) => r.t.id));
  const today = todayLA();

  const statusActions = canEdit ? (
    <div className="flex flex-wrap gap-2">
      {p.status !== "published" && p.status !== "archived" ? (
        <ActionForm action={setStatusAction} className="" submit={{ label: "Publish", variant: "primary" }} confirm={{ title: `Publish ${p.name}?`, body: "Families will be able to see it and, depending on the booking mode, book it.", confirmLabel: "Publish" }}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="status" value="published" />
        </ActionForm>
      ) : null}
      {p.status === "published" ? (
        <ActionForm action={setStatusAction} className="" submit={{ label: "Pause booking", variant: "secondary" }} confirm={{ title: "Pause new bookings?", body: "Existing bookings stay as they are. Families see “Booking paused”.", confirmLabel: "Pause" }}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="status" value="paused" />
        </ActionForm>
      ) : null}
      {p.status === "archived" ? (
        <ActionForm action={setStatusAction} className="" submit={{ label: "Restore as draft", variant: "secondary" }}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="status" value="draft" />
        </ActionForm>
      ) : (
        <ActionForm
          action={setStatusAction}
          className=""
          submit={{ label: "Archive", variant: "ghost" }}
          confirm={{ title: `Archive ${p.name}?`, body: "It disappears from booking and the schedule. All sessions, bookings, payments and paperwork are kept.", confirmLabel: "Archive", danger: true }}
        >
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="status" value="archived" />
        </ActionForm>
      )}
      {p.status === "draft" && !activity.sessions && !activity.bookingItems ? (
        <ActionForm action={deleteDraftAction} className="" submit={{ label: "Delete draft", variant: "ghost" }} confirm={{ title: "Delete this unused draft?", body: "It has no sessions or bookings. This can’t be undone.", confirmLabel: "Delete", danger: true }}>
          <input type="hidden" name="id" value={p.id} />
        </ActionForm>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {p.name} <Status kind="program" value={p.status} />
          </span>
        }
        subtitle={p.tagline ?? undefined}
        back={{ href: "/admin/programs", label: "Programs" }}
        actions={statusActions}
      />
      {sp.created ? (
        <div className="mb-5">
          <Notice tone="positive" title="Draft created">
            Next: add pricing, required forms and a schedule, then publish.
          </Notice>
        </div>
      ) : null}

      <Tabs
        current={tab}
        tabs={[
          { key: "settings", label: "Settings", href: `/admin/programs/${id}` },
          { key: "pricing", label: "Pricing", href: `/admin/programs/${id}?tab=pricing`, count: d.prices.filter((x) => x.active).length },
          { key: "forms", label: "Required forms", href: `/admin/programs/${id}?tab=forms`, count: d.requirements.length },
          { key: "schedule", label: "Schedule", href: `/admin/programs/${id}?tab=schedule`, count: d.series.length },
        ]}
      />

      {tab === "settings" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
          <Card>
            <ProgramForm
              canEdit={canEdit}
              locations={ref.locations.map((l) => ({ value: l.id, label: l.name }))}
              options={{ kinds: PROGRAM_KINDS, presence: PARENT_PRESENCE, units: BOOKING_UNITS, modes: BOOKING_MODES, seriesModes: SERIES_MODES, priceUnits: PRICE_UNITS }}
              program={p}
            />
          </Card>
          <div className="space-y-6">
            <Card title="Associated cohorts">
              {ref.cohorts.length === 0 ? (
                <p className="text-[0.85rem] text-ink-soft">No cohorts yet. Add them in Settings.</p>
              ) : (
                <ActionForm action={saveCohortsAction} submit={canEdit ? { label: "Save cohorts", variant: "secondary" } : false}>
                  <input type="hidden" name="id" value={p.id} />
                  <fieldset disabled={!canEdit} className="space-y-2">
                    <legend className="sr-only">Cohorts</legend>
                    {ref.cohorts.map((c) => (
                      <label key={c.id} className="flex items-center gap-2.5 text-[0.86rem]">
                        <input type="checkbox" name="cohortId" value={c.id} defaultChecked={d.cohortIds.includes(c.id)} className="h-4 w-4 rounded border-ink/30" />
                        {c.name}
                        <span className="text-[0.75rem] text-ink-soft">
                          {c.ratio ? `${c.ratio} · ` : ""}max {c.maxSize ?? "—"}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </ActionForm>
              )}
            </Card>
            <Card title="At a glance">
              <DL
                cols={1}
                items={[
                  { label: "Upcoming sessions", value: d.series.reduce((s, x) => s + x.counts.upcoming, 0) || d.upcoming.length },
                  { label: "Booking items, all time", value: activity.bookingItems },
                  { label: "Public page", value: p.status === "published" ? <a className="text-blue hover:underline" href={`/programs/${p.slug}`} target="_blank" rel="noreferrer">/programs/{p.slug} ↗</a> : "Not published" },
                ]}
              />
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "pricing" ? (
        <div className="space-y-6">
          <Notice tone="info">The most specific matching price is used: session override → this table (cohort and full/half day) → base price. Changes apply to new bookings only.</Notice>
          <Card title="Price table" padded={false}>
            {d.prices.length === 0 ? (
              <div className="p-5">
                <Empty title="No price table">The base price on the Settings tab is used{p.priceCents != null ? "" : " — and none is set yet"}.</Empty>
              </div>
            ) : (
              <ul className="divide-y divide-ink/6">
                {d.prices.map((pr) => (
                  <li key={pr.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className={`text-[0.88rem] ${pr.active ? "text-ink" : "text-ink-soft line-through"}`}>{pr.label}</p>
                        <p className="text-[0.75rem] text-ink-soft">
                          {[pr.cohortId ? cohortName.get(pr.cohortId) : "Any cohort", pr.dayLength ? `${pr.dayLength} day` : null, pr.daysPerWeek ? `${pr.daysPerWeek} days/week` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">
                          <Money cents={pr.amountCents} /> <span className="text-[0.78rem] font-normal text-ink-soft">/ {pr.unit}</span>
                        </span>
                        {!pr.active ? <Pill tone="muted" icon="minus">Inactive</Pill> : null}
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="mt-2">
                        <Disclosure label="Edit">
                          <ActionForm action={updatePriceAction} submit={{ label: "Save price", variant: "secondary" }}>
                            <input type="hidden" name="priceId" value={pr.id} />
                            <PriceFields cohorts={ref.cohorts} values={pr} />
                            <Checkbox name="active" label="Active" defaultChecked={pr.active} hint="Inactive prices are kept for history but no longer used." />
                          </ActionForm>
                        </Disclosure>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {canEdit ? (
            <Card title="Add a price">
              <ActionForm action={addPriceAction} submit={{ label: "Add price" }} resetOnSuccess>
                <input type="hidden" name="id" value={p.id} />
                <PriceFields cohorts={ref.cohorts} />
              </ActionForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "forms" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Card title="Required for this program" padded={false}>
            {d.requirements.length === 0 ? (
              <div className="p-5">
                <Empty title="No program-specific forms">Forms required for every family still apply. Add waivers that only this program needs.</Empty>
              </div>
            ) : (
              <Table head={["Form", "Type", "When", "Frequency", ""]}>
                {d.requirements.map(({ r, t }) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/forms/${t.id}`} className="font-medium text-ink hover:text-blue">
                        {t.title}
                      </Link>
                      {t.requiresSignature ? <span className="block text-[0.75rem] text-ink-soft">Signature required</span> : null}
                    </td>
                    <td className="capitalize">{t.kind}</td>
                    <td>{ENFORCEMENT[t.enforcement] ?? t.enforcement}</td>
                    <td className="text-ink-soft">{t.frequency === "per_booking" ? "Each booking" : t.frequency === "periodic" ? `Every ${t.validForMonths ?? "?"} months` : "Once"}</td>
                    <td className="text-right">
                      {canEdit ? (
                        <ActionForm action={removeRequirementAction} className="" submit={{ label: "Remove", variant: "ghost" }} confirm={{ title: `Stop requiring “${t.title}” for ${p.name}?`, body: "Completed submissions are kept.", confirmLabel: "Remove" }}>
                          <input type="hidden" name="requirementId" value={r.id} />
                        </ActionForm>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          {canEdit ? (
            <Card title="Add a requirement">
              {ref.templates.filter((t) => !usedTemplateIds.has(t.id)).length === 0 ? (
                <p className="text-[0.85rem] text-ink-soft">
                  Every active form is already required. Create new forms in{" "}
                  <Link className="text-blue hover:underline" href="/admin/forms">
                    Forms & waivers
                  </Link>
                  .
                </p>
              ) : (
                <ActionForm action={addRequirementAction} submit={{ label: "Require form" }}>
                  <input type="hidden" name="id" value={p.id} />
                  <SelectField
                    name="templateId"
                    label="Form or waiver"
                    required
                    options={[
                      { value: "", label: "Choose…" },
                      ...ref.templates.filter((t) => !usedTemplateIds.has(t.id)).map((t) => ({ value: t.id, label: `${t.title} — ${ENFORCEMENT[t.enforcement] ?? t.enforcement}` })),
                    ]}
                    hint="Whether it blocks booking is set on the form itself."
                  />
                </ActionForm>
              )}
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "schedule" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
          <div className="space-y-6">
            <Card title="Schedules" padded={false}>
              {d.series.length === 0 ? (
                <div className="p-5">
                  <Empty title="No schedules yet">Add a repeating schedule, a single date, or a multi-day camp.</Empty>
                </div>
              ) : (
                <ul className="divide-y divide-ink/6">
                  {d.series.map((s) => (
                    <li key={s.id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[0.9rem] font-medium text-ink">{s.title ?? `${s.weekdays.map((w) => WEEKDAY[w]).join(", ")}`}</p>
                          <p className="text-[0.78rem] text-ink-soft">
                            {s.weekdays.map((w) => WEEKDAY[w]).join(", ")} · {s.startTime}–{s.endTime} · {fmtDate(s.startsOn, "d MMM")} – {fmtDate(s.endsOn, "d MMM yyyy")} · capacity {s.capacity}
                            {s.hardCapacity ? ` (hard ${s.hardCapacity})` : ""}
                            {s.cohortId ? ` · ${cohortName.get(s.cohortId)}` : ""}
                            {s.bookAsSeries ? " · booked as a series" : ""}
                          </p>
                          <p className="text-[0.75rem] text-ink-soft">
                            {s.counts.upcoming} upcoming of {s.counts.total} sessions
                          </p>
                        </div>
                        <Link href={`/admin/schedule?program=${p.id}&date=${s.startsOn > today ? s.startsOn : today}`} className="text-[0.8rem] text-blue hover:underline">
                          View on calendar →
                        </Link>
                      </div>
                      {canSchedule ? (
                        <div className="mt-2">
                          <Disclosure label="Copy this schedule to new dates">
                            <ActionForm action={copySeriesAction} submit={{ label: "Copy schedule", variant: "secondary" }}>
                              <input type="hidden" name="seriesId" value={s.id} />
                              <div className="grid gap-4 sm:grid-cols-2">
                                <TextField name="startsOn" label="Starts on" type="date" required defaultValue={addDaysISO(s.endsOn, 1)} />
                                <TextField name="endsOn" label="Ends on" type="date" required />
                              </div>
                            </ActionForm>
                          </Disclosure>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Next sessions" padded={false}>
              {d.upcoming.length === 0 ? (
                <p className="p-5 text-[0.85rem] text-ink-soft">No upcoming sessions.</p>
              ) : (
                <ul className="divide-y divide-ink/6">
                  {d.upcoming.map(({ session: s, availability: a }) => (
                    <li key={s.id}>
                      <Link href={`/admin/sessions/${s.id}`} className="grid items-center gap-3 px-5 py-3 hover:bg-mist/30 sm:grid-cols-[1fr_9rem_7rem]">
                        <span>
                          <span className="block text-[0.88rem] text-ink">{fmtDate(s.localDate, "EEE d MMM")}</span>
                          <span className="text-[0.78rem] text-ink-soft">
                            {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
                            {s.cohortId ? ` · ${cohortName.get(s.cohortId)}` : ""}
                          </span>
                        </span>
                        <Capacity used={a.occupancy.used} capacity={a.effectiveCapacity} remaining={a.remaining} />
                        <span className="sm:text-right">
                          <Status kind="session" value={s.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          {canSchedule ? (
            <Card title="Add sessions">
              <SessionCreator
                programId={p.id}
                today={today}
                programs={[{ id: p.id, name: p.name, defaultCapacity: p.defaultCapacity, seriesMode: p.seriesMode, locationId: p.locationId }]}
                locations={ref.locations}
                cohorts={ref.cohorts}
                pools={ref.pools}
              />
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function PriceFields({ cohorts, values }: { cohorts: { id: string; name: string }[]; values?: { label: string; amountCents: number; unit: string; cohortId: string | null; dayLength: string | null; daysPerWeek: number | null } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <TextField name="label" label="Label" required defaultValue={values?.label} className="sm:col-span-2 lg:col-span-1" />
      <MoneyField name="amount" label="Amount" required defaultValue={values?.amountCents} />
      <SelectField name="unit" label="Charged" defaultValue={values?.unit ?? "session"} options={PRICE_TABLE_UNITS} />
      <SelectField name="cohortId" label="Cohort" defaultValue={values?.cohortId ?? ""} options={[{ value: "", label: "Any cohort" }, ...cohorts.map((c) => ({ value: c.id, label: c.name }))]} />
      <SelectField name="dayLength" label="Day length" defaultValue={values?.dayLength ?? ""} options={[{ value: "", label: "Any" }, { value: "full", label: "Full day" }, { value: "half", label: "Half day" }]} />
      <TextField name="daysPerWeek" label="Days per week" type="number" defaultValue={values?.daysPerWeek} hint="For membership tuition rows." />
    </div>
  );
}
