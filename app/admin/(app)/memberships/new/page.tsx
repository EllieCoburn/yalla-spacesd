import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ActionForm, MoneyField, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { btn, Card, inputCls, Money, Notice, PageHeader, Pill } from "@/components/admin/ui";
import { clubPriceTable } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { children, cohorts, families } from "@/lib/db/schema";
import { membershipCapacityCheck, WEEKDAY } from "@/lib/ops/memberships";
import { listPolicies } from "@/lib/ops/settings";
import { ageLabel, fmtDate, todayLA } from "@/lib/time";
import { createMembershipAction } from "../actions";

export const metadata = { title: "Start a membership" };

type SP = { family?: string; child?: string; cohort?: string; days?: string | string[]; dayLength?: string; start?: string; end?: string; earlyBird?: string };

export default async function NewMembershipPage({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requirePermission("memberships.manage");
  const sp = await searchParams;
  const db = getDb();
  const today = todayLA();
  const [famRows, cohortRows, { club, prices }] = await Promise.all([
    db.select().from(families).where(eq(families.status, "active")).orderBy(asc(families.name)),
    db.select().from(cohorts).where(eq(cohorts.active, true)).orderBy(asc(cohorts.sortOrder)),
    clubPriceTable(db),
  ]);
  if (!club) return <Notice tone="warning" title="No Club Yalla program">Create a program of type “membership” first.</Notice>;
  const family = famRows.find((f) => f.id === sp.family);
  const kids = family ? await db.select().from(children).where(and(eq(children.familyId, family.id), eq(children.status, "active"))).orderBy(asc(children.birthDate)) : [];
  const child = kids.find((k) => k.id === sp.child) ?? (kids.length === 1 ? kids[0] : undefined);
  const cohortId = sp.cohort || child?.cohortId || "";
  const days = (Array.isArray(sp.days) ? sp.days : sp.days ? [sp.days] : []).map(Number).filter((n) => n >= 0 && n <= 6);
  const dayLength = sp.dayLength === "half" ? "half" : "full";
  const start = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : "";
  const end = sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.end) ? sp.end : "";
  const ready = family && child && cohortId && days.length && start;
  const check = ready ? await membershipCapacityCheck(db, { programId: club.id, cohortId, weekdays: days, startsOn: start, endsOn: end || null }) : null;
  const suggested = prices.find((p) => p.cohortId === cohortId && p.daysPerWeek === days.length && p.dayLength === dayLength);
  const decisions = (await listPolicies(db)).filter((p) => p.group === "Club Yalla" && p.needsDecision);
  const cohort = cohortRows.find((c) => c.id === cohortId);

  return (
    <>
      <PageHeader title="Start a Club Yalla membership" back={{ href: "/admin/memberships", label: "Club Yalla" }} subtitle="Choose the family and schedule, check availability, then confirm the price." />
      {decisions.length ? (
        <div className="mb-5">
          <Notice tone="warning" title="Policies still need your decision">
            {decisions.map((d) => d.label).join(" · ")}. Until they’re set in Settings → Policies, conservative defaults apply (no makeup days, no proration, no pauses, absences keep the spot held).
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card title="1 · Family & schedule">
          <form action="/admin/memberships/new" className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-[0.8rem] font-medium text-ink">Family</span>
              <select name="family" defaultValue={family?.id ?? ""} className={inputCls} required>
                <option value="">Choose a family…</option>
                {famRows.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            {family ? (
              kids.length === 0 ? (
                <Notice tone="warning">
                  This family has no children on record.{" "}
                  <Link href={`/admin/families/${family.id}`} className="underline">
                    Add a child first
                  </Link>
                  .
                </Notice>
              ) : (
                <>
                  <label className="block space-y-1.5">
                    <span className="text-[0.8rem] font-medium text-ink">Child</span>
                    <select name="child" defaultValue={child?.id ?? ""} className={inputCls} required>
                      <option value="">Choose…</option>
                      {kids.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.preferredName || k.firstName} {k.lastName} · {ageLabel(k.birthDate, today)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[0.8rem] font-medium text-ink">Cohort</span>
                    <select name="cohort" defaultValue={cohortId} className={inputCls} required>
                      <option value="">Choose…</option>
                      {cohortRows.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.ratio ?? ""} · max {c.maxSize ?? "—"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset>
                    <legend className="mb-1.5 text-[0.8rem] font-medium text-ink">Recurring weekdays</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 2, 3, 4, 5].map((d) => (
                        <label key={d} className="cursor-pointer">
                          <input type="checkbox" name="days" value={d} defaultChecked={days.includes(d)} className="peer sr-only" />
                          <span className="inline-flex h-9 w-12 items-center justify-center rounded-lg border border-ink/15 text-[0.82rem] peer-checked:border-ink peer-checked:bg-ink peer-checked:text-chalk peer-focus-visible:ring-2 peer-focus-visible:ring-blue/40">
                            {WEEKDAY[d]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-[0.8rem] font-medium text-ink">Care hours</span>
                      <select name="dayLength" defaultValue={dayLength} className={inputCls}>
                        <option value="full">Full day · 8:30am–4:30pm</option>
                        <option value="half">Half day · 8:30am–12:00pm</option>
                      </select>
                    </label>
                    <label className="flex items-end gap-2 pb-2 text-[0.85rem]">
                      <input type="checkbox" name="earlyBird" defaultChecked={sp.earlyBird === "on"} className="h-4 w-4 rounded border-ink/30" />
                      Early Bird care from 8:00am
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[0.8rem] font-medium text-ink">Start date</span>
                      <input type="date" name="start" defaultValue={start} min={today} className={inputCls} required />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[0.8rem] font-medium text-ink">End date (optional)</span>
                      <input type="date" name="end" defaultValue={end} className={inputCls} />
                    </label>
                  </div>
                </>
              )
            ) : null}
            <button className={btn.secondary}>{family ? "Check availability & price" : "Continue"}</button>
          </form>
        </Card>

        <div className="space-y-6">
          {check && child && cohort ? (
            <Card title="2 · Availability">
              <p className="text-[0.88rem] text-ink">
                {check.sessions} matching {cohort.name} sessions scheduled from {fmtDate(start, "d MMM")} to {fmtDate(check.horizon, "d MMM yyyy")}.
              </p>
              {check.full.length ? (
                <div className="mt-3">
                  <Notice tone="critical" title={`The cohort is full on ${check.full.length} date${check.full.length === 1 ? "" : "s"}`}>
                    {check.full.slice(0, 8).map((d) => fmtDate(d, "EEE d MMM")).join(", ")}
                    {check.full.length > 8 ? ` and ${check.full.length - 8} more` : ""}. Choose different days, a later start, or another cohort.
                  </Notice>
                </div>
              ) : check.sessions === 0 ? (
                <div className="mt-3">
                  <Notice tone="warning" title="No sessions are scheduled yet">The membership will reserve spots once Club Yalla sessions exist for this cohort. Add them in the schedule.</Notice>
                </div>
              ) : (
                <div className="mt-3">
                  <Pill tone="positive" icon="check">Room on every scheduled date</Pill>
                </div>
              )}
            </Card>
          ) : null}

          {check && child && family ? (
            <Card title="3 · Price & confirm">
              {suggested ? (
                <p className="mb-3 text-[0.85rem] text-ink-soft">
                  Rate sheet: {suggested.label} — <Money cents={suggested.amountCents} /> per month.
                </p>
              ) : (
                <p className="mb-3 text-[0.85rem] text-[#8a5212]">No rate-sheet price for this cohort, number of days and day length. Enter the agreed price.</p>
              )}
              <ActionForm action={createMembershipAction} submit={{ label: "Start membership" }}>
                <input type="hidden" name="familyId" value={family.id} />
                <input type="hidden" name="childId" value={child.id} />
                <input type="hidden" name="programId" value={club.id} />
                <input type="hidden" name="cohortId" value={cohortId} />
                <input type="hidden" name="dayLength" value={dayLength} />
                <input type="hidden" name="startsOn" value={start} />
                <input type="hidden" name="endsOn" value={end} />
                {sp.earlyBird === "on" ? <input type="hidden" name="earlyBird" value="on" /> : null}
                {days.map((d) => (
                  <input key={d} type="hidden" name="weekdays" value={d} />
                ))}
                <MoneyField name="price" label="Membership price" required defaultValue={suggested?.amountCents ?? null} hint={can(staff, "billing.view") ? "Per billing period." : undefined} />
                <SelectField
                  name="billingFrequency"
                  label="Billing frequency"
                  options={[
                    { value: "monthly", label: "Monthly" },
                    { value: "weekly", label: "Weekly (charges scheduled manually until a policy is set)" },
                    { value: "term", label: "Per term (charges scheduled manually until a policy is set)" },
                  ]}
                />
                <TextArea name="notes" label="Internal notes" rows={2} />
                <TextField name="confirmText" label="Summary" defaultValue={`${child.preferredName || child.firstName} · ${days.map((d) => WEEKDAY[d]).join(", ")} · ${dayLength} day from ${fmtDate(start)}`} disabled />
                <p className="text-[0.75rem] text-ink-soft">Capacity is re-checked when you confirm. Monthly charges are scheduled (not invoiced) for the first three months.</p>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
