import Link from "next/link";
import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, Checkbox, Disclosure, MoneyField, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { Card, DL, Money, Notice, PageHeader, Pill, Status, Table } from "@/components/admin/ui";
import { membershipDetail } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { cohorts } from "@/lib/db/schema";
import { WEEKDAY } from "@/lib/ops/memberships";
import { getPolicy, listPolicies } from "@/lib/ops/settings";
import { ageLabel, fmtDate, fmtDateTime, todayLA } from "@/lib/time";
import { addExceptionAction, applyDueChangesAction, planChangeAction, updateMembershipAction } from "../actions";

const KIND_LABEL: Record<string, string> = { absence: "Absence", closure: "Closure", pause: "Pause day", makeup: "Makeup day" };

export default async function MembershipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const staff = await requirePermission("memberships.view");
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const d = await membershipDetail(db, id);
  if (!d) notFound();
  const manage = can(staff, "memberships.manage");
  const money = can(staff, "billing.view");
  const today = todayLA();
  const [cohortRows, policies, releasePolicy, pausePolicy] = await Promise.all([
    db.select().from(cohorts).orderBy(asc(cohorts.sortOrder)),
    listPolicies(db),
    getPolicy(db, "membership.absenceReleasesSpot"),
    getPolicy(db, "membership.pause"),
  ]);
  const decisions = policies.filter((p) => p.group === "Club Yalla" && p.needsDecision);
  const { m, c, f, co } = d;
  const due = d.changes.filter((x) => x.status === "planned" && x.effectiveOn <= today);
  const fmtChange = (ch: Record<string, unknown>) =>
    [
      ch.weekdays ? `Days: ${(ch.weekdays as number[]).map((w) => WEEKDAY[w]).join(", ")}` : null,
      ch.dayLength ? `Hours: ${ch.dayLength === "half" ? "half day" : "full day"}` : null,
      ch.cohortId ? `Cohort: ${cohortRows.find((x) => x.id === ch.cohortId)?.name ?? "—"}` : null,
      ch.priceCents != null && money ? `Price: $${((ch.priceCents as number) / 100).toFixed(2)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/memberships", label: "Club Yalla" }}
        title={
          <>
            {c.preferredName || c.firstName} {c.lastName} · {co.name}
          </>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Status kind="membership" value={m.status} />
            <Link href={`/admin/families/${f.id}`} className="text-blue hover:underline">
              {f.name}
            </Link>
            <span>· {ageLabel(c.birthDate, today)}</span>
          </span>
        }
      />
      {sp.created ? (
        <div className="mb-5">
          <Notice tone="positive" title="Membership started">The child’s place is now reserved on every matching session. Monthly charges are scheduled, not yet invoiced.</Notice>
        </div>
      ) : null}
      {decisions.length ? (
        <div className="mb-5">
          <Notice tone="warning" title="Club Yalla policies awaiting your decision">
            {decisions.map((x) => x.label).join(" · ")}. <Link href="/admin/settings?tab=policies" className="underline">Set them in Settings</Link>.
          </Notice>
        </div>
      ) : null}
      {due.length && manage ? (
        <div className="mb-5">
          <Notice tone="info" title={`${due.length} planned change${due.length === 1 ? " is" : "s are"} due`}>
            <ActionForm action={applyDueChangesAction} submit={{ label: "Apply due changes now", variant: "secondary" }}>
              <span className="text-[0.82rem]">Applying ends this membership the day before and continues it with the new schedule, keeping history.</span>
            </ActionForm>
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card title="Schedule">
            <DL
              cols={3}
              items={[
                { label: "Days", value: m.weekdays.map((w) => WEEKDAY[w]).join(", ") },
                { label: "Care hours", value: m.dayLength === "half" ? "Half day · 8:30am–12:00pm" : "Full day · 8:30am–4:30pm" },
                { label: "Early Bird", value: m.earlyBird ? "Yes · from 8:00am" : "No" },
                { label: "Cohort", value: `${co.name}${co.ratio ? ` · ${co.ratio}` : ""}` },
                { label: "Starts", value: fmtDate(m.startsOn) },
                { label: "Ends", value: m.endsOn ? fmtDate(m.endsOn) : "Ongoing" },
                ...(money ? [{ label: "Price", value: <><Money cents={m.priceCents} /> {m.billingFrequency}</> }] : []),
                { label: "Notes", value: m.notes ?? "—", full: true },
              ]}
            />
            <p className="mt-4 text-[0.78rem] text-ink-soft">
              Membership status, attendance and billing are tracked separately. Marking an absence never cancels the membership or changes an invoice.
            </p>
          </Card>

          {manage ? (
            <Card title="Edit membership">
              <ActionForm action={updateMembershipAction} submit={{ label: "Save" }}>
                <input type="hidden" name="membershipId" value={m.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <MoneyField name="price" label="Price" required defaultValue={m.priceCents} />
                  <SelectField name="billingFrequency" label="Billing frequency" defaultValue={m.billingFrequency} options={[{ value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }, { value: "term", label: "Per term" }]} />
                  <TextField name="endsOn" label="End date" type="date" defaultValue={m.endsOn} />
                  <SelectField
                    name="status"
                    label="Status"
                    defaultValue={m.status}
                    hint={pausePolicy === "not_offered" ? "Pausing is disabled until a pause policy is set." : undefined}
                    options={[
                      { value: "upcoming", label: "Upcoming" },
                      { value: "active", label: "Active" },
                      { value: "paused", label: "Paused" },
                      { value: "ended", label: "Ended" },
                    ]}
                  />
                </div>
                <Checkbox name="earlyBird" label="Early Bird care (8:00–8:30am)" defaultChecked={m.earlyBird} />
                <TextArea name="notes" label="Internal notes" rows={2} defaultValue={m.notes} />
                <p className="text-[0.75rem] text-ink-soft">To change days, hours, cohort or price from a future date, plan a change below so history is preserved.</p>
              </ActionForm>
            </Card>
          ) : null}

          <Card title="Planned schedule changes">
            {d.changes.length === 0 ? <p className="text-[0.85rem] text-ink-soft">None planned.</p> : null}
            <ul className="divide-y divide-ink/6">
              {d.changes.map((ch) => (
                <li key={ch.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <span className="block text-[0.86rem] text-ink">From {fmtDate(ch.effectiveOn)}</span>
                    <span className="text-[0.78rem] text-ink-soft">
                      {fmtChange(ch.changes as Record<string, unknown>)} · by {ch.createdBy ?? "—"}
                    </span>
                  </span>
                  <Pill tone={ch.status === "applied" ? "positive" : ch.status === "planned" ? "info" : "muted"} icon={ch.status === "applied" ? "check" : ch.status === "planned" ? "clock" : "x"}>
                    {ch.status === "applied" ? "Applied" : ch.status === "planned" ? "Planned" : "Cancelled"}
                  </Pill>
                </li>
              ))}
            </ul>
            {manage && ["active", "upcoming", "paused"].includes(m.status) ? (
              <div className="mt-3">
                <Disclosure label="Plan a change">
                  <ActionForm action={planChangeAction} submit={{ label: "Plan change" }} resetOnSuccess>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <TextField name="effectiveOn" label="Takes effect on" type="date" required />
                    <fieldset>
                      <legend className="mb-1.5 text-[0.8rem] font-medium text-ink">New weekdays (leave empty to keep {m.weekdays.map((w) => WEEKDAY[w]).join(", ")})</legend>
                      <div className="flex flex-wrap gap-1.5">
                        {[1, 2, 3, 4, 5].map((dd) => (
                          <label key={dd} className="cursor-pointer">
                            <input type="checkbox" name="weekdays" value={dd} className="peer sr-only" />
                            <span className="inline-flex h-9 w-12 items-center justify-center rounded-lg border border-ink/15 text-[0.82rem] peer-checked:border-ink peer-checked:bg-ink peer-checked:text-chalk peer-focus-visible:ring-2 peer-focus-visible:ring-blue/40">
                              {WEEKDAY[dd]}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <SelectField name="dayLength" label="Care hours" options={[{ value: "", label: "Keep current" }, { value: "full", label: "Full day" }, { value: "half", label: "Half day" }]} />
                      <SelectField name="cohortId" label="Cohort" options={[{ value: "", label: "Keep current" }, ...cohortRows.map((x) => ({ value: x.id, label: x.name }))]} />
                      <MoneyField name="price" label="New price" hint="Leave blank to keep" />
                    </div>
                    <p className="text-[0.75rem] text-ink-soft">New days or cohort are checked for space before the change is saved.</p>
                  </ActionForm>
                </Disclosure>
              </div>
            ) : null}
          </Card>

          <Card title="Attendance exceptions">
            <p className="mb-3 text-[0.8rem] text-ink-soft">
              Absences keep the membership, invoice and spot unchanged.{" "}
              {releasePolicy ? "Your policy releases an absent member’s spot for drop-in booking when recorded in advance." : "Under your current policy the spot stays reserved (not resold)."}
            </p>
            {d.exceptions.length === 0 ? <p className="text-[0.85rem] text-ink-soft">No exceptions recorded.</p> : null}
            <ul className="divide-y divide-ink/6">
              {d.exceptions.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-[0.85rem] text-ink">
                    {fmtDate(e.date)} · {KIND_LABEL[e.kind] ?? e.kind}
                    {e.note ? <span className="text-ink-soft"> · {e.note}</span> : null}
                    <span className="block text-[0.72rem] text-ink-soft">by {e.createdBy ?? "—"}</span>
                  </span>
                  {e.releasesSpot ? <Pill tone="info" icon="arrow">Spot released</Pill> : <Pill tone="muted" icon="minus">Spot held</Pill>}
                </li>
              ))}
            </ul>
            {manage ? (
              <div className="mt-3">
                <Disclosure label="Record an exception">
                  <ActionForm action={addExceptionAction} submit={{ label: "Record" }} resetOnSuccess>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField name="date" label="Date" type="date" required />
                      <SelectField
                        name="kind"
                        label="Type"
                        options={[
                          { value: "absence", label: "Absence" },
                          { value: "closure", label: "Closure" },
                          { value: "pause", label: "Pause day" },
                          { value: "makeup", label: "Makeup day" },
                        ]}
                      />
                    </div>
                    <TextField name="note" label="Note" />
                  </ActionForm>
                </Disclosure>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          {money ? (
            <Card title="Scheduled charges" actions={<Link href="/admin/billing/scheduled" className="text-blue">Billing →</Link>} padded={false}>
              {d.charges.length === 0 ? (
                <p className="px-5 py-4 text-[0.85rem] text-ink-soft">No charges scheduled.</p>
              ) : (
                <Table head={["Due", "Description", "Amount", "Status"]} dense>
                  {d.charges.map((ch) => (
                    <tr key={ch.id}>
                      <td className="whitespace-nowrap">{fmtDate(ch.scheduledFor, "d MMM yyyy")}</td>
                      <td>{ch.description}</td>
                      <td>
                        <Money cents={ch.amountCents} />
                      </td>
                      <td>
                        {ch.invoiceId ? (
                          <Link href={`/admin/billing/invoices/${ch.invoiceId}`} className="text-blue hover:underline">
                            Invoiced
                          </Link>
                        ) : (
                          <Pill tone={ch.status === "skipped" ? "muted" : "info"} icon={ch.status === "skipped" ? "minus" : "clock"}>
                            {ch.status === "skipped" ? "Skipped" : "Scheduled"}
                          </Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
              <p className="border-t border-ink/8 px-5 py-2 text-[0.74rem] text-ink-soft">Scheduled charges become invoices when billing runs. They are not money collected.</p>
            </Card>
          ) : null}

          {d.related.length ? (
            <Card title="Other memberships for this child" padded={false}>
              <ul className="divide-y divide-ink/6">
                {d.related.map((r) => (
                  <li key={r.m.id}>
                    <Link href={`/admin/memberships/${r.m.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 hover:bg-mist/30">
                      <span className="text-[0.84rem] text-ink">
                        {r.co.name} · {r.m.weekdays.map((w) => WEEKDAY[w]).join(", ")}
                        <span className="block text-[0.74rem] text-ink-soft">
                          {fmtDate(r.m.startsOn, "d MMM yyyy")}–{r.m.endsOn ? fmtDate(r.m.endsOn, "d MMM yyyy") : "ongoing"}
                        </span>
                      </span>
                      <Status kind="membership" value={r.m.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="History" padded={false}>
            {d.history.length === 0 ? (
              <p className="px-5 py-4 text-[0.85rem] text-ink-soft">No history yet.</p>
            ) : (
              <ul className="divide-y divide-ink/6">
                {d.history.map((h) => (
                  <li key={h.id} className="px-5 py-2.5">
                    <p className="text-[0.82rem] text-ink">{h.summary}</p>
                    <p className="text-[0.72rem] text-ink-soft">
                      {h.actorName} · {fmtDateTime(h.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
