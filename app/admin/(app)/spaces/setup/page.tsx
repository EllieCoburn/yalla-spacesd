import { ActionForm, Checkbox, Disclosure, MoneyField, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { Card, Money, Notice, PageHeader, Pill, Table } from "@/components/admin/ui";
import { familiesForPicker } from "@/lib/admin/queries/programs";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listEntitlements, listRates } from "@/lib/spaces/admin";
import { BOOKING_TYPE_LABEL, CATEGORY_LABEL, getSpaceConfig, PROVISIONAL, spaceConfigDecided, type BookingType, type Category } from "@/lib/spaces/config";
import { todayLA } from "@/lib/time";
import { asc } from "drizzle-orm";
import { workspaces } from "@/lib/db/schema";
import { addEntitlementAction, addRateAction, archiveEntitlementAction, disableRateAction, saveConfigAction, updateWorkspaceAction } from "../actions";

export const metadata = { title: "Workspaces, rates & policies" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CATEGORIES = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
const TYPES: BookingType[] = ["complimentary", "half_day", "full_day", "week", "hourly"];

export default async function SpacesSetup() {
  await requirePermission("spaces.configure");
  const db = getDb();
  const [ws, rates, cfg, decided, ents, fams] = await Promise.all([
    db.select().from(workspaces).orderBy(asc(workspaces.displayOrder), asc(workspaces.name)),
    listRates(db),
    getSpaceConfig(db),
    spaceConfigDecided(db),
    listEntitlements(db),
    familiesForPicker(db),
  ]);
  const today = todayLA();

  return (
    <>
      <PageHeader back={{ href: "/admin/spaces", label: "Space reservations" }} title="Workspaces, rates & policies" subtitle="Everything families see in Book a Space comes from here." />

      {!decided ? (
        <div className="mb-6">
          <Notice tone="warning" title="Needs your decision">
            These defaults are placeholders until you save the settings below:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {PROVISIONAL.map((p) => (
                <li key={p.key}>{p.label}</li>
              ))}
            </ul>
          </Notice>
        </div>
      ) : null}

      <Card title="Workspaces">
        <div className="space-y-3">
          {ws.map((w) => (
            <Disclosure
              key={w.id}
              label={
                <span className="flex items-center gap-3">
                  {w.name}
                  <span className="text-[0.78rem] font-normal text-ink-soft">{CATEGORY_LABEL[w.category as Category]}</span>
                  {!w.active ? <Pill tone="muted">Inactive</Pill> : null}
                  <span className="text-[0.75rem] font-normal text-ink-soft">{w.bookingTypes.map((t) => BOOKING_TYPE_LABEL[t as BookingType]).join(" · ")}</span>
                </span>
              }
            >
              <ActionForm action={updateWorkspaceAction}>
                <input type="hidden" name="id" value={w.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField name="name" label="Name" required defaultValue={w.name} />
                  <SelectField name="category" label="Category" options={CATEGORIES} defaultValue={w.category} />
                  <TextField name="displayOrder" label="Display order" type="number" defaultValue={w.displayOrder} />
                </div>
                <TextField name="summary" label="Short description" defaultValue={w.summary} hint="Shown on the card. Describe only what’s true of the space." />
                <TextArea name="description" label="Longer description" defaultValue={w.description} rows={2} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextArea name="amenities" label="Amenities" rows={2} defaultValue={w.amenities.join(", ")} hint="Comma-separated. Leave blank until confirmed." />
                  <TextArea name="photos" label="Photos" rows={2} defaultValue={w.photos.join(", ")} hint="Image paths like /photos/jane.webp or https:// links, comma-separated. The first is the cover." />
                </div>
                <fieldset>
                  <legend className="mb-1.5 text-[0.8rem] font-medium text-ink">Ways to book</legend>
                  <div className="flex flex-wrap gap-4">
                    {TYPES.map((t) => (
                      <label key={t} className="flex items-center gap-2 text-[0.85rem]">
                        <input type="checkbox" name="bookingTypes" value={t} defaultChecked={w.bookingTypes.includes(t)} className="h-4 w-4 rounded border-ink/30 text-blue" />
                        {BOOKING_TYPE_LABEL[t]}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-[0.75rem] text-ink-soft">A paid type also needs a price below before families can buy it.</p>
                </fieldset>
                <div className="grid gap-3 sm:grid-cols-4">
                  <TextField name="capacity" label="Capacity" type="number" defaultValue={w.capacity} />
                  <TextField name="minNoticeMinutes" label="Notice (minutes)" type="number" defaultValue={w.minNoticeMinutes} />
                  <TextField name="maxAdvanceDays" label="Book up to (days ahead)" type="number" defaultValue={w.maxAdvanceDays} />
                  <TextField
                    name="hours"
                    label="Custom hours"
                    defaultValue={w.hours ? Object.entries(w.hours as Record<string, [string, string]>).map(([d, [o, c]]) => `${d}=${o}-${c}`).join("; ") : ""}
                    hint="Blank = house hours"
                  />
                </div>
                <div className="flex flex-wrap gap-6">
                  <Checkbox name="complimentaryEligible" label="Complimentary time" hint="Counts toward the family’s daily allowance" defaultChecked={w.complimentaryEligible} />
                  <Checkbox name="active" label="Active" hint="Inactive spaces are hidden from families" defaultChecked={w.active} />
                </div>
              </ActionForm>
            </Disclosure>
          ))}
        </div>
      </Card>

      <Card title="Prices" className="mt-6" padded={false}>
        <Table head={["Applies to", "Booking", "Price", "From", "Until", ""]} dense>
          {rates.map(({ rate: r, workspace }) => (
            <tr key={r.id} className={r.active ? "" : "opacity-50"}>
              <td>{workspace ?? `All ${CATEGORY_LABEL[r.category as Category]?.toLowerCase()}s`}</td>
              <td>
                {BOOKING_TYPE_LABEL[r.bookingType as BookingType]}
                {r.bookingType === "hourly" ? " (per hour)" : ""}
              </td>
              <td>
                <Money cents={r.priceCents} />
              </td>
              <td className="tabular-nums">{r.effectiveFrom}</td>
              <td className="tabular-nums">{r.effectiveUntil ?? (r.active ? "—" : "Off")}</td>
              <td className="text-right">
                {r.active && (!r.effectiveUntil || r.effectiveUntil >= today) ? (
                  <ActionForm action={disableRateAction} submit={{ label: "Turn off", variant: "ghost" }} confirm={{ title: "Turn this price off?", body: "Families won’t be able to buy this booking type until a new price is added. Existing reservations keep their price.", confirmLabel: "Turn off" }}>
                    <input type="hidden" name="rateId" value={r.id} />
                  </ActionForm>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
        <div className="p-5">
          <Disclosure label="Add or change a price">
            <ActionForm action={addRateAction} submit={{ label: "Add price" }} resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-4">
                <SelectField
                  name="scope"
                  label="Applies to"
                  options={[...CATEGORIES.map((c) => ({ value: `category:${c.value}`, label: `All ${c.label.toLowerCase()}s` })), ...ws.map((w) => ({ value: `workspace:${w.id}`, label: `${w.name} only` }))]}
                />
                <SelectField name="bookingType" label="Booking" options={(["half_day", "full_day", "week", "hourly"] as BookingType[]).map((t) => ({ value: t, label: t === "hourly" ? "By the hour (price per hour)" : BOOKING_TYPE_LABEL[t] }))} />
                <MoneyField name="price" label="Price" required />
                <TextField name="effectiveFrom" label="Starts" type="date" defaultValue={today} required />
              </div>
              <p className="text-[0.75rem] text-ink-soft">The current price for the same scope and booking ends the day before. Reservations already made keep their price.</p>
            </ActionForm>
          </Disclosure>
        </div>
      </Card>

      <Card title="House rules" className="mt-6">
        <ActionForm action={saveConfigAction} submit={{ label: "Save settings" }}>
          <fieldset>
            <legend className="mb-2 text-[0.8rem] font-medium">Opening hours (America/Los_Angeles)</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {DAYS.map((name, i) => {
                const h = cfg.hours[String(i)];
                return (
                  <div key={name} className="rounded-lg border border-ink/10 p-2.5">
                    <label className="flex items-center gap-2 text-[0.82rem] font-medium">
                      <input type="checkbox" name="openDays" value={i} defaultChecked={!!h} className="h-4 w-4 rounded border-ink/30 text-blue" />
                      {name}
                    </label>
                    <div className="mt-2 flex gap-2">
                      <input type="time" name={`open_${i}`} defaultValue={h?.[0] ?? "08:30"} aria-label={`${name} opens`} className="w-full rounded border border-ink/15 px-2 py-1 text-[0.82rem]" />
                      <input type="time" name={`close_${i}`} defaultValue={h?.[1] ?? "16:30"} aria-label={`${name} closes`} className="w-full rounded border border-ink/15 px-2 py-1 text-[0.82rem]" />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-[0.75rem] text-ink-soft">Holidays and closures: add them in Schedule → Closures (program-wide closures also close Book a Space), or as a closure on the Space reservations page.</p>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField name="fullStart" label="Full day starts" type="time" defaultValue={cfg.fullDay.start} required />
            <TextField name="fullEnd" label="Full day ends" type="time" defaultValue={cfg.fullDay.end} required />
            <SelectField
              name="slotMinutes"
              label="Start times every"
              defaultValue={cfg.slotMinutes}
              options={[5, 10, 15, 30, 60].map((n) => ({ value: String(n), label: `${n} minutes` }))}
            />
            <TextField name="morningStart" label="Morning half day starts" type="time" defaultValue={cfg.halfDay.morning?.start} hint="Leave both blank to not offer it" />
            <TextField name="morningEnd" label="Morning half day ends" type="time" defaultValue={cfg.halfDay.morning?.end} />
            <span />
            <TextField name="afternoonStart" label="Afternoon half day starts" type="time" defaultValue={cfg.halfDay.afternoon?.start} hint="Leave both blank to not offer it" />
            <TextField name="afternoonEnd" label="Afternoon half day ends" type="time" defaultValue={cfg.halfDay.afternoon?.end} />
            <span />
            <SelectField
              name="weekMode"
              label="A week means"
              defaultValue={cfg.week.mode}
              options={[
                { value: "calendar", label: "Monday–Friday of the chosen week" },
                { value: "rolling", label: "Operating days from the chosen date" },
              ]}
            />
            <TextField name="weekDays" label="Days in a week" type="number" defaultValue={cfg.week.days} />
          </div>
          <fieldset className="rounded-lg border border-ink/10 p-4">
            <legend className="px-1 text-[0.8rem] font-medium">Complimentary time</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField name="dailyMinutes" label="Minutes per family per day" type="number" defaultValue={cfg.complimentary.dailyMinutes} />
              <SelectField
                name="eligibility"
                label="Who gets it"
                defaultValue={cfg.complimentary.eligibility}
                options={[
                  { value: "active_membership", label: "Families with an active Club Yalla membership" },
                  { value: "all_families", label: "Every active family" },
                  { value: "manual", label: "Only families given it below" },
                ]}
              />
              <TextField name="compDurations" label="Durations (minutes)" defaultValue={cfg.complimentary.durations.join(", ")} />
            </div>
            <div className="mt-3">
              <Checkbox name="shared" label="One allowance shared across every complimentary space" hint="Untick to give a separate allowance per space" defaultChecked={cfg.complimentary.shared} />
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField name="hourlyDurations" label="Hourly durations (minutes)" defaultValue={cfg.hourly.durations.join(", ")} hint="Only used where an hourly price exists" />
          </div>
          <fieldset className="rounded-lg border border-ink/10 p-4">
            <legend className="px-1 text-[0.8rem] font-medium">Changes & cancellations</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField name="compCutoff" label="Complimentary: change or cancel until (minutes before start)" type="number" defaultValue={cfg.cancellation.complimentaryCutoffMinutes} />
              <SelectField
                name="paidFamilyCancel"
                label="Paid reservations"
                defaultValue={cfg.cancellation.paidFamilyCancel}
                options={[
                  { value: "contact", label: "Families contact Yalla to change or cancel" },
                  { value: "cancel", label: "Families can cancel online before the cutoff" },
                ]}
              />
              <TextField name="paidCutoff" label="Paid: cancel online until (hours before start)" type="number" defaultValue={cfg.cancellation.paidCutoffHours} />
              <SelectField
                name="paidRefund"
                label="When a paid reservation is cancelled"
                defaultValue={cfg.cancellation.paidRefund}
                hint="Nothing is refunded automatically. This is what staff are prompted to do."
                options={[
                  { value: "staff_decides", label: "Staff decide refund or credit each time" },
                  { value: "credit", label: "Suggest account credit" },
                  { value: "none", label: "No refund or credit suggested" },
                ]}
              />
            </div>
          </fieldset>
        </ActionForm>
      </Card>

      <Card title="Complimentary time exceptions" className="mt-6">
        {ents.length ? (
          <ul className="mb-4 divide-y divide-ink/8 text-[0.85rem]">
            {ents.map(({ e, familyName }) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{familyName}</span> · {e.mode === "grant" ? `Given${e.dailyMinutes != null ? ` ${e.dailyMinutes} min/day` : ""}` : "Removed"}
                  <span className="block text-[0.78rem] text-ink-soft">
                    {e.effectiveFrom ?? "Always"} – {e.effectiveUntil ?? "ongoing"}
                    {e.note ? ` · ${e.note}` : ""}
                  </span>
                </span>
                <ActionForm action={archiveEntitlementAction} submit={{ label: "Remove", variant: "ghost" }}>
                  <input type="hidden" name="id" value={e.id} />
                </ActionForm>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-[0.85rem] text-ink-soft">No exceptions. Eligibility follows the rule above.</p>
        )}
        <Disclosure label="Add an exception">
          <ActionForm action={addEntitlementAction} submit={{ label: "Save exception" }} resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField name="familyId" label="Family" required options={[{ value: "", label: "Choose a family…" }, ...fams.map((f) => ({ value: f.id, label: f.name }))]} />
              <SelectField
                name="mode"
                label="Exception"
                options={[
                  { value: "grant", label: "Give complimentary time" },
                  { value: "revoke", label: "Remove complimentary time" },
                ]}
              />
              <TextField name="dailyMinutes" label="Minutes per day" type="number" hint="Blank = the house allowance" />
              <TextField name="effectiveFrom" label="From" type="date" />
              <TextField name="effectiveUntil" label="Until" type="date" />
              <TextField name="note" label="Note" />
            </div>
          </ActionForm>
        </Disclosure>
      </Card>
    </>
  );
}
