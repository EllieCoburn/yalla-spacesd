"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { absentAction, checkInAction, checkOutAction, undoAction } from "@/app/admin/(app)/roster/actions";
import type { ActionState } from "@/lib/admin/action";
import type { RosterChild } from "@/lib/ops/attendance";
import { Pill, Status, inputCls } from "@/components/admin/ui";

type Act = (prev: ActionState, form: FormData) => Promise<ActionState>;

function Big({ children, variant = "primary", disabled }: { children: string; variant?: "primary" | "secondary" | "quiet"; disabled?: boolean }) {
  const { pending } = useFormStatus();
  const cls =
    variant === "primary"
      ? "bg-ink text-chalk hover:bg-blue"
      : variant === "secondary"
        ? "border border-ink/20 bg-white text-ink hover:border-ink/50"
        : "text-ink-soft hover:bg-ink/5 hover:text-ink";
  return (
    <button disabled={pending || disabled} className={`inline-flex min-h-12 min-w-[7.5rem] items-center justify-center rounded-xl px-4 text-[0.92rem] font-medium transition-colors disabled:opacity-50 ${cls}`}>
      {pending ? "Saving…" : children}
    </button>
  );
}

function Mini({ action, sessionId, childId, children }: { action: Act; sessionId: string; childId: string; children: (state: ActionState) => React.ReactNode }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="childId" value={childId} />
      {children(state)}
    </form>
  );
}

const time = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }) : "");

export function RosterCard({ c, sessionId, canManage, showBookings }: { c: RosterChild; sessionId: string; canManage: boolean; showBookings: boolean }) {
  const [mode, setMode] = useState<"idle" | "checkout" | "absent">("idle");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const status = c.attendance?.status ?? (c.expected ? "expected" : "absent");
  const allergies = c.care?.allergies;
  // Informational forms (e.g. photo preferences) don't affect attendance, so they stay off the roster.
  const paperwork = c.paperwork?.filter((p) => p.enforcement !== "informational") ?? [];
  const restricted = c.pickups?.filter((p) => p.isRestricted) ?? [];
  const allowed = c.pickups?.filter((p) => !p.isRestricted) ?? [];

  const report = (s: ActionState) => {
    if (s && (s.error || s.message)) {
      const next = { ok: !!s.ok, text: (s.error ?? s.message)! };
      if (!msg || msg.text !== next.text) queueMicrotask(() => setMsg(next));
      if (s.ok && mode !== "idle") queueMicrotask(() => setMode("idle"));
    }
    return null;
  };

  return (
    <li className={`rounded-2xl border bg-[#fffefb] p-4 sm:p-5 ${restricted.length ? "border-[#8a2333]/40" : "border-ink/10"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[1.1rem] font-semibold text-ink">
            {c.preferredName ? `${c.preferredName} ` : ""}
            <span className={c.preferredName ? "font-normal text-ink-soft" : ""}>{c.preferredName ? `(${c.name})` : c.name}</span>
          </h3>
          <p className="mt-0.5 text-[0.82rem] text-ink-soft">
            {c.age}
            {c.cohort ? ` · ${c.cohort}` : ""} ·{" "}
            {c.source === "membership" ? (
              "Club Yalla member"
            ) : showBookings && c.bookingId ? (
              <Link href={`/admin/bookings/${c.bookingId}`} className="underline-offset-2 hover:underline">
                Booking {c.bookingReference}
              </Link>
            ) : (
              `Booking ${c.bookingReference ?? ""}`
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Status kind="attendance" value={status} />
          <span className="text-[0.75rem] text-ink-soft tabular-nums">
            {c.attendance?.checkedInAt ? `In ${time(c.attendance.checkedInAt)}` : ""}
            {c.attendance?.checkedOutAt ? ` · Out ${time(c.attendance.checkedOutAt)}` : ""}
          </span>
          {c.attendance?.collectedByName ? <span className="text-[0.75rem] text-ink-soft">Collected by {c.attendance.collectedByName}</span> : null}
        </div>
      </div>

      {/* Alerts */}
      {allergies || c.care?.medicalNotes || restricted.length ? (
        <div className="mt-3 space-y-2">
          {allergies ? (
            <p className="flex items-start gap-2 rounded-lg bg-[#f6e3e5] px-3 py-2 text-[0.88rem] font-medium text-[#8a2333]" role="note">
              <span aria-hidden>⚠</span> Allergy: {allergies}
            </p>
          ) : null}
          {c.care?.medicalNotes ? (
            <p className="rounded-lg bg-[#f8eedd] px-3 py-2 text-[0.85rem] text-[#8a5212]">
              <span className="font-medium">Medical:</span> {c.care.medicalNotes}
            </p>
          ) : null}
          {restricted.map((r) => (
            <p key={r.id} className="rounded-lg border-2 border-[#8a2333] px-3 py-2 text-[0.85rem] text-[#8a2333]" role="alert">
              <span className="font-bold">DO NOT RELEASE to {r.name}</span>
              {r.restrictionNote ? ` — ${r.restrictionNote}` : ""}
            </p>
          ))}
        </div>
      ) : null}
      {c.care?.careNotes ? <p className="mt-2 text-[0.85rem] text-ink-soft">Care notes: {c.care.careNotes}</p> : null}
      {paperwork.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[0.78rem] text-ink-soft">Paperwork:</span>
          {paperwork.map((p) => (
            <Pill key={p.templateId + (p.childId ?? "")} tone={p.enforcement === "blocks_booking" ? "critical" : "warning"} icon="alert">
              {p.title} · {p.state === "missing" ? "missing" : p.state.replace("_", " ")}
            </Pill>
          ))}
        </div>
      ) : null}
      {c.notExpectedReason && status !== "checked_in" && status !== "checked_out" ? <p className="mt-2 text-[0.85rem] text-ink-soft">Not expected: {c.notExpectedReason}</p> : null}
      {c.attendance?.notes ? <p className="mt-2 text-[0.85rem] text-ink-soft">Note: {c.attendance.notes}</p> : null}

      {/* Departure contacts */}
      {(allowed.length || c.contacts?.length) && mode !== "checkout" ? (
        <details className="mt-3 text-[0.85rem]">
          <summary className="cursor-pointer text-ink-soft hover:text-ink">Departure & contacts</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {allowed.length ? (
              <div>
                <p className="text-[0.72rem] font-medium tracking-[0.04em] text-ink-soft uppercase">Authorized to collect</p>
                <ul className="mt-1 space-y-0.5">
                  {allowed.map((p) => (
                    <li key={p.id}>
                      {p.name} <span className="text-ink-soft">· {p.relationship}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {c.contacts?.length ? (
              <div>
                <p className="text-[0.72rem] font-medium tracking-[0.04em] text-ink-soft uppercase">Contacts</p>
                <ul className="mt-1 space-y-0.5">
                  {c.contacts.map((p, i) => (
                    <li key={i}>
                      {p.name} <span className="text-ink-soft">· {p.relationship}</span>{" "}
                      {p.phone ? (
                        <a className="text-blue" href={`tel:${p.phone}`}>
                          {p.phone}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={`mt-3 rounded-lg px-3 py-2 text-[0.85rem] ${msg.ok ? "bg-[#e6f0ea] text-[#2c6447]" : "bg-[#f6e3e5] font-medium text-[#8a2333]"}`}>
          {msg.text}
        </p>
      ) : null}

      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {mode === "checkout" ? (
            <Mini action={checkOutAction} sessionId={sessionId} childId={c.childId}>
              {(s) => (
                <div className="w-full space-y-2">
                  {report(s)}
                  <label className="block text-[0.8rem] font-medium text-ink" htmlFor={`pk-${c.childId}`}>
                    Who is collecting {c.preferredName || c.name.split(" ")[0]}?
                  </label>
                  <select id={`pk-${c.childId}`} name="pickupId" required className={`${inputCls} min-h-12 text-[0.95rem]`} defaultValue="">
                    <option value="" disabled>
                      Choose an authorized adult…
                    </option>
                    {allowed.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.relationship})
                      </option>
                    ))}
                    {restricted.map((p) => (
                      <option key={p.id} value={p.id}>
                        ⚠ {p.name} — NOT authorized
                      </option>
                    ))}
                  </select>
                  {!c.pickups ? <p className="text-[0.8rem] text-ink-soft">You can’t see departure details. Ask a colleague with care access to check this child out.</p> : null}
                  <input name="note" placeholder="Note (optional)" className={`${inputCls} min-h-12`} />
                  <div className="flex gap-2">
                    <Big>Confirm check-out</Big>
                    <button type="button" className="min-h-12 rounded-xl px-4 text-[0.9rem] text-ink-soft hover:bg-ink/5" onClick={() => setMode("idle")}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Mini>
          ) : mode === "absent" ? (
            <Mini action={absentAction} sessionId={sessionId} childId={c.childId}>
              {(s) => (
                <div className="w-full space-y-2">
                  {report(s)}
                  <input name="note" placeholder="Reason or note (optional)" className={`${inputCls} min-h-12`} />
                  <p className="text-[0.78rem] text-ink-soft">Recording an absence doesn’t cancel the booking or membership or change billing.</p>
                  <div className="flex gap-2">
                    <Big variant="secondary">Mark absent</Big>
                    <button type="button" className="min-h-12 rounded-xl px-4 text-[0.9rem] text-ink-soft hover:bg-ink/5" onClick={() => setMode("idle")}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Mini>
          ) : (
            <>
              {status === "expected" || status === "absent" ? (
                <Mini action={checkInAction} sessionId={sessionId} childId={c.childId}>
                  {(s) => (
                    <>
                      {report(s)}
                      <Big>Check in</Big>
                    </>
                  )}
                </Mini>
              ) : null}
              {status === "checked_in" ? (
                <button onClick={() => setMode("checkout")} className="inline-flex min-h-12 min-w-[7.5rem] items-center justify-center rounded-xl bg-ink px-4 text-[0.92rem] font-medium text-chalk hover:bg-blue">
                  Check out
                </button>
              ) : null}
              {status === "expected" ? (
                <button onClick={() => setMode("absent")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-ink/20 bg-white px-4 text-[0.92rem] text-ink hover:border-ink/50">
                  Absent
                </button>
              ) : null}
              {status !== "expected" ? (
                <Mini action={undoAction} sessionId={sessionId} childId={c.childId}>
                  {(s) => (
                    <>
                      {report(s)}
                      <Big variant="quiet">Undo</Big>
                    </>
                  )}
                </Mini>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
