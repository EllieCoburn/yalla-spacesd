"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ActionForm, Checkbox } from "@/components/admin/forms";
import { btn, inputCls, Notice } from "@/components/admin/ui";
import type { ActionState } from "@/lib/admin/action";

type Preview = {
  scope: string;
  changes: Record<string, string>;
  clears: { hardCapacity: boolean; price: boolean };
  sessions: { date: string; booked: number; capacity: number }[];
  affected: { reference: string; bookingId: string; family: string; children: string[]; date: string }[];
  blockers: string[];
  consequences: string[];
};

type Current = { startTime: string; endTime: string; capacity: number; hardCapacity: number | null; reservedSpots: number; price: string; status: string; notes: string };

const SCOPES = [
  { value: "this", label: "This session only" },
  { value: "following", label: "This and following sessions" },
  { value: "all", label: "All upcoming sessions in the series" },
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[0.8rem] font-medium text-ink">
      {label}
      {children}
      {hint ? <span className="text-[0.72rem] font-normal text-ink-soft">{hint}</span> : null}
    </label>
  );
}

/**
 * Edit a session (or its series). Step 1 previews who is affected and what happens; step 2 applies
 * with explicit confirmation. Families are notified only if the box is ticked.
 */
export function SessionEditor({
  sessionId,
  inSeries,
  current,
  preview,
  apply,
  mode,
}: {
  sessionId: string;
  inSeries: boolean;
  current: Current;
  preview: (prev: ActionState, form: FormData) => Promise<ActionState>;
  apply: (prev: ActionState, form: FormData) => Promise<ActionState>;
  mode: "edit" | "close" | "cancel";
}) {
  const [state, previewAction, pending] = useActionState(preview, undefined);
  const [values, setValues] = useState<Record<string, string>>({});
  const p = state?.ok ? (state.data as Preview) : null;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const val = (k: string, fallback: string | number | null) => values[k] ?? state?.values?.[k] ?? (fallback == null ? "" : String(fallback));

  return (
    <div className="space-y-4">
      <form action={previewAction} className="space-y-4">
        <input type="hidden" name="sessionId" value={sessionId} />
        {inSeries ? (
          <Field label="Apply to">
            <select name="scope" value={val("scope", "this")} onChange={set("scope")} className={inputCls}>
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <input type="hidden" name="scope" value="this" />
        )}
        {mode === "edit" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start time">
              <input type="time" name="startTime" value={val("startTime", current.startTime)} onChange={set("startTime")} className={inputCls} />
            </Field>
            <Field label="End time">
              <input type="time" name="endTime" value={val("endTime", current.endTime)} onChange={set("endTime")} className={inputCls} />
            </Field>
            <Field label="Capacity">
              <input type="number" min={1} name="capacity" value={val("capacity", current.capacity)} onChange={set("capacity")} className={inputCls} />
            </Field>
            <Field label="Hard capacity" hint="Licensing/staffing ceiling. Leave blank for none.">
              <input type="number" min={1} name="hardCapacity" value={val("hardCapacity", current.hardCapacity)} onChange={set("hardCapacity")} className={inputCls} />
            </Field>
            <Field label="Reserved spots" hint="Held back by staff; not bookable.">
              <input type="number" min={0} name="reservedSpots" value={val("reservedSpots", current.reservedSpots)} onChange={set("reservedSpots")} className={inputCls} />
            </Field>
            <Field label="Session price ($)" hint="Blank uses the program’s price table. Applies to new bookings only.">
              <input inputMode="decimal" name="price" value={val("price", current.price)} onChange={set("price")} className={inputCls} />
            </Field>
            {current.hardCapacity != null && val("hardCapacity", current.hardCapacity) === "" ? <input type="hidden" name="hardCapacityMode" value="clear" /> : null}
            {current.price !== "" && val("price", current.price) === "" ? <input type="hidden" name="priceMode" value="clear" /> : null}
          </div>
        ) : (
          <>
            <input type="hidden" name="status" value={mode === "close" ? "closed" : "cancelled"} />
            <Field label="Note shown to staff">
              <input name="notes" value={val("notes", current.notes)} onChange={set("notes")} placeholder={mode === "close" ? "e.g. Staff training" : "e.g. Water outage"} className={inputCls} required />
            </Field>
          </>
        )}
        <button className={btn.secondary} disabled={pending}>
          {pending ? "Checking…" : "Preview changes"}
        </button>
      </form>

      {state && !state.ok ? <Notice tone="critical">{state.error}</Notice> : null}

      {p ? (
        <div className="space-y-3 rounded-lg border border-ink/12 bg-mist/30 p-4 text-[0.85rem]">
          <p className="font-medium text-ink">
            {p.sessions.length} session{p.sessions.length === 1 ? "" : "s"} will change ({SCOPES.find((s) => s.value === p.scope)?.label.toLowerCase()}).
          </p>
          <ul className="max-h-32 overflow-y-auto text-[0.8rem] text-ink-soft">
            {p.sessions.map((s) => (
              <li key={s.date}>
                {s.date} · {s.booked}/{s.capacity} taken
              </li>
            ))}
          </ul>
          {p.blockers.length ? (
            <Notice tone="critical" title="Can’t apply yet">
              <ul className="list-disc pl-4">
                {p.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {p.affected.length ? (
            <div>
              <p className="font-medium text-ink">Affected families ({p.affected.length})</p>
              <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
                {p.affected.map((a) => (
                  <li key={a.reference + a.date}>
                    <Link href={`/admin/bookings/${a.bookingId}`} className="text-blue hover:underline">
                      {a.reference}
                    </Link>{" "}
                    · {a.family}
                    {a.children.length ? ` (${a.children.join(", ")})` : ""} · {a.date}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-ink-soft">No booked families are affected.</p>
          )}
          {p.consequences.map((c) => (
            <p key={c} className="text-ink">
              {c}
            </p>
          ))}
          {!p.blockers.length ? (
            <ActionForm
              action={apply}
              submit={{ label: mode === "cancel" ? "Cancel session(s)" : mode === "close" ? "Close session(s)" : "Apply changes", variant: mode === "edit" ? "primary" : "danger", pending: "Applying…" }}
            >
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="scope" value={p.scope} />
              {Object.entries(p.changes).map(([k, v]) => (k === "priceCents" ? null : <input key={k} type="hidden" name={k === "hardCapacity" ? "hardCapacity" : k} value={v} />))}
              {p.changes.priceCents !== undefined && p.changes.priceCents !== "" ? <input type="hidden" name="price" value={(Number(p.changes.priceCents) / 100).toFixed(2)} /> : null}
              {p.clears.hardCapacity ? <input type="hidden" name="hardCapacityMode" value="clear" /> : null}
              {p.clears.price ? <input type="hidden" name="priceMode" value="clear" /> : null}
              {p.affected.length ? (
                <>
                  <Checkbox name="confirmAffected" label={`I’ve reviewed the ${p.affected.length} affected booking(s)`} hint="Bookings, charges and refunds are not changed automatically." />
                  <Checkbox name="notify" label="Notify affected families by email" hint="Captured in Messages while in test mode." />
                </>
              ) : null}
            </ActionForm>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
