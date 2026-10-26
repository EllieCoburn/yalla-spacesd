"use client";

import { useState } from "react";
import { ActionForm, Checkbox, MoneyField, SelectField, TextField, WeekdayPicker } from "@/components/admin/forms";
import { btn, inputCls } from "@/components/admin/ui";
import { createSeriesAction, createSessionAction } from "@/app/admin/(app)/schedule/actions";

type Opt = { id: string; name: string };
type ProgramOpt = Opt & { defaultCapacity: number | null; seriesMode: string; locationId: string | null };

export function TimeBlocks({ defaults = [{ start: "08:30", end: "16:30" }] }: { defaults?: { start: string; end: string }[] }) {
  const [rows, setRows] = useState(defaults.map((d, i) => ({ ...d, key: i })));
  return (
    <fieldset>
      <legend className="mb-1.5 block text-[0.8rem] font-medium text-ink">Time blocks (Los Angeles time)</legend>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`start-${r.key}`}>
              Start time {i + 1}
            </label>
            <input id={`start-${r.key}`} type="time" name="startTime" defaultValue={r.start} required className={`${inputCls} w-32`} />
            <span className="text-ink-soft" aria-hidden>
              to
            </span>
            <label className="sr-only" htmlFor={`end-${r.key}`}>
              End time {i + 1}
            </label>
            <input id={`end-${r.key}`} type="time" name="endTime" defaultValue={r.end} required className={`${inputCls} w-32`} />
            {rows.length > 1 ? (
              <button type="button" className={btn.ghost} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove time block ${i + 1}`}>
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button type="button" className={`${btn.link} mt-2 text-[0.82rem]`} onClick={() => setRows((rs) => [...rs, { start: "13:00", end: "16:00", key: Date.now() }])}>
        + Add another time block on the same days
      </button>
      <p className="mt-1 text-[0.75rem] text-ink-soft">Each block becomes its own session (e.g. a morning and an afternoon session).</p>
    </fieldset>
  );
}

const MODES = [
  { key: "weekly", label: "Repeating weekly" },
  { key: "single", label: "Single date" },
  { key: "camp", label: "Multi-day camp" },
] as const;

export function SessionCreator({
  programs,
  locations,
  cohorts,
  pools,
  programId,
  today,
}: {
  programs: ProgramOpt[];
  locations: Opt[];
  cohorts: Opt[];
  pools: Opt[];
  programId?: string;
  today: string;
}) {
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("weekly");
  const [pid, setPid] = useState(programId ?? "");
  const prog = programs.find((p) => p.id === pid);
  const shared = (
    <>
      {programId ? (
        <input type="hidden" name="programId" value={programId} />
      ) : (
        <div className="space-y-1.5">
          <label htmlFor="sc-program" className="block text-[0.8rem] font-medium text-ink">
            Program <span className="text-[#8a2333]">*</span>
          </label>
          <select id="sc-program" name="programId" required value={pid} onChange={(e) => setPid(e.target.value)} className={inputCls}>
            <option value="">Choose a program…</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <TextField name="title" label="Session title (optional)" hint="Shown to families, e.g. “Little Builders week”." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="capacity" label="Capacity" type="number" required defaultValue={prog?.defaultCapacity ?? 10} hint="Spots available to book." key={`cap-${pid}`} />
        <TextField name="hardCapacity" label="Hard capacity (optional)" type="number" hint="Licensing/staffing ceiling. Overrides can never exceed it." />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField name="locationId" label="Location" defaultValue={prog?.locationId ?? ""} options={[{ value: "", label: "Program default" }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} key={`loc-${pid}`} />
        <SelectField name="cohortId" label="Cohort" options={[{ value: "", label: "None" }, ...cohorts.map((c) => ({ value: c.id, label: c.name }))]} />
        <SelectField name="capacityPoolId" label="Shared capacity" options={[{ value: "", label: "Not shared" }, ...pools.map((c) => ({ value: c.id, label: c.name }))]} hint="Limits combined bookings across programs sharing a room or staff." />
      </div>
      <MoneyField name="priceCents" label="Price override (optional)" hint="Leave blank to use the program’s pricing." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="bookingOpensAt" label="Booking opens (optional)" type="datetime-local" />
        <TextField name="bookingClosesAt" label="Booking closes (optional)" type="datetime-local" />
      </div>
    </>
  );

  return (
    <div>
      <div role="tablist" aria-label="Session type" className="mb-4 inline-flex rounded-lg border border-ink/15 bg-white p-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            role="tab"
            type="button"
            aria-selected={mode === m.key}
            onClick={() => setMode(m.key)}
            className={`rounded-md px-3 py-1.5 text-[0.82rem] transition-colors ${mode === m.key ? "bg-ink text-chalk" : "text-ink-soft hover:text-ink"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "single" ? (
        <ActionForm action={createSessionAction} submit={{ label: "Add session" }} key="single">
          <TextField name="localDate" label="Date" type="date" required defaultValue={today} />
          <TimeBlocks />
          {shared}
        </ActionForm>
      ) : (
        <ActionForm action={createSeriesAction} submit={{ label: mode === "camp" ? "Add camp" : "Add schedule" }} key={mode}>
          <WeekdayPicker name="weekdays" defaultValue={[1, 2, 3, 4, 5]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="startsOn" label={mode === "camp" ? "First day" : "Starts on"} type="date" required defaultValue={today} />
            <TextField name="endsOn" label={mode === "camp" ? "Last day" : "Ends on"} type="date" required />
          </div>
          <TimeBlocks defaults={mode === "camp" ? [{ start: "08:30", end: "15:00" }] : undefined} />
          {mode === "camp" ? (
            <Checkbox name="bookAsSeries" label="Families book the whole camp as one series" defaultChecked hint="Turn off to let families choose individual days." />
          ) : (
            <Checkbox name="bookAsSeries" label="Book as a complete series" hint="Families must book every date in this schedule together." />
          )}
          {shared}
        </ActionForm>
      )}
      <p className="mt-3 text-[0.75rem] text-ink-soft">Dates on existing blackout closures are created as closed. Times are interpreted in America/Los_Angeles, so daylight saving is handled automatically.</p>
    </div>
  );
}
