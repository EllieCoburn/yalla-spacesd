"use client";

import { useMemo, useState } from "react";
import { ActionForm, Checkbox, TextField } from "@/components/admin/forms";
import { Notice, Pill } from "@/components/admin/ui";
import type { ActionState } from "@/lib/admin/action";

export type SessionOption = {
  id: string;
  label: string;
  date: string;
  time: string;
  cohortName: string | null;
  remaining: number;
  hardRoom: number;
  state: string;
  stateLabel: string;
  prices: Record<string, number | null>;
  generalPrice: number | null;
  ages: { childId: string; months: number }[];
};

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function NewBookingForm({
  action,
  familyId,
  program,
  kids,
  sessions,
  canOverride,
  blocking,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  familyId: string;
  program: { id: string; name: string; unit: string; min: number | null; max: number | null; status: string };
  kids: { id: string; name: string; age: string; cohort: string | null }[];
  sessions: SessionOption[];
  canOverride: boolean;
  blocking: string[];
}) {
  const perChild = program.unit === "per_child";
  const [childIds, setChildIds] = useState<string[]>(perChild && kids.length === 1 ? [kids[0].id] : []);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [override, setOverride] = useState(false);

  const selected = sessions.filter((s) => sessionIds.includes(s.id));
  const needed = perChild ? childIds.length : 1;

  const { total, lines, unpriced } = useMemo(() => {
    const lines: { label: string; cents: number | null }[] = [];
    for (const s of selected) {
      if (perChild) for (const c of childIds) lines.push({ label: `${s.date} · ${kids.find((k) => k.id === c)?.name}`, cents: s.prices[c] ?? null });
      else lines.push({ label: s.date, cents: s.generalPrice });
    }
    return { lines, total: lines.reduce((sum, l) => sum + (l.cents ?? 0), 0), unpriced: lines.some((l) => l.cents == null) };
  }, [selected, childIds, perChild, kids]);

  const shortfalls = selected.filter((s) => needed > s.remaining);
  const beyondHard = shortfalls.filter((s) => needed - s.remaining > s.hardRoom);
  const ageProblems = selected.flatMap((s) =>
    s.ages
      .filter((a) => childIds.includes(a.childId) && ((program.min != null && a.months < program.min) || (program.max != null && a.months > program.max)))
      .map((a) => `${kids.find((k) => k.id === a.childId)?.name} will be ${a.months} months old on ${s.date}, outside the ${program.name} age range.`),
  );
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <ActionForm action={action} submit={{ label: "Create booking", pending: "Creating…" }} className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <input type="hidden" name="familyId" value={familyId} />
      {childIds.map((c) => (
        <input key={c} type="hidden" name="childIds" value={c} />
      ))}
      {sessionIds.map((s) => (
        <input key={s} type="hidden" name="sessionIds" value={s} />
      ))}

      <div className="space-y-5">
        {program.status !== "published" ? (
          <Notice tone="warning" title={`${program.name} is ${program.status}`}>
            Staff can still book it, but families won’t see it online.
          </Notice>
        ) : null}
        <fieldset className="rounded-xl border border-ink/10 bg-[#fffefb] p-5">
          <legend className="px-1 text-[0.95rem] font-semibold text-ink">Children</legend>
          {kids.length === 0 ? <p className="text-[0.85rem] text-ink-soft">No children on file.</p> : null}
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {kids.map((k) => (
              <label key={k.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${childIds.includes(k.id) ? "border-ink bg-mist/40" : "border-ink/12 hover:border-ink/30"}`}>
                <input type="checkbox" checked={childIds.includes(k.id)} onChange={() => toggle(childIds, setChildIds, k.id)} className="mt-0.5 h-4 w-4 rounded border-ink/30" />
                <span>
                  <span className="block text-[0.88rem] font-medium text-ink">{k.name}</span>
                  <span className="text-[0.76rem] text-ink-soft">
                    {k.age} today{k.cohort ? ` · ${k.cohort}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {!perChild ? <p className="mt-3 text-[0.78rem] text-ink-soft">{program.name} is booked {program.unit.replace("_", " ")}; selected children are recorded on the booking.</p> : null}
        </fieldset>

        <fieldset className="rounded-xl border border-ink/10 bg-[#fffefb] p-5">
          <legend className="px-1 text-[0.95rem] font-semibold text-ink">Sessions · {program.name}</legend>
          {sessions.length === 0 ? <p className="text-[0.85rem] text-ink-soft">No upcoming sessions in this range.</p> : null}
          <ul className="mt-1 divide-y divide-ink/6">
            {sessions.map((s) => {
              const disabled = s.state === "not_offered";
              const on = sessionIds.includes(s.id);
              return (
                <li key={s.id}>
                  <label className={`flex items-center gap-3 py-2.5 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
                    <input type="checkbox" disabled={disabled} checked={on} onChange={() => toggle(sessionIds, setSessionIds, s.id)} className="h-4 w-4 rounded border-ink/30" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.86rem] text-ink">
                        {s.date} · {s.time}
                      </span>
                      <span className="text-[0.75rem] text-ink-soft">
                        {s.label}
                        {s.cohortName ? ` · ${s.cohortName}` : ""}
                      </span>
                    </span>
                    {s.state === "full" ? (
                      <Pill tone="critical" icon="x">
                        Fully booked
                      </Pill>
                    ) : s.state === "closed" ? (
                      <Pill tone="muted" icon="minus">
                        {s.stateLabel}
                      </Pill>
                    ) : s.state === "not_offered" ? (
                      <Pill tone="muted" icon="x">
                        Not offered
                      </Pill>
                    ) : s.state === "limited" ? (
                      <Pill tone="warning" icon="alert">
                        {s.remaining} left
                      </Pill>
                    ) : (
                      <Pill tone="neutral" icon="dot">
                        {s.remaining} left
                      </Pill>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="rounded-xl border border-ink/10 bg-[#fffefb] p-5" aria-live="polite">
          <h2 className="text-[0.95rem] font-semibold text-ink">Summary</h2>
          {lines.length === 0 ? (
            <p className="mt-2 text-[0.85rem] text-ink-soft">Choose {perChild ? "children and " : ""}sessions to see pricing.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-[0.84rem]">
              {lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-ink">{l.label}</span>
                  <span className="tabular-nums">{l.cents == null ? <span className="text-[#8a2333]">No price</span> : money(l.cents)}</span>
                </li>
              ))}
              <li className="mt-2 flex justify-between border-t border-ink/10 pt-2 font-semibold">
                <span>Total before discounts</span>
                <span className="tabular-nums">{money(total)}</span>
              </li>
            </ul>
          )}
          <p className="mt-2 text-[0.74rem] text-ink-soft">Sibling discounts and tax follow Settings → Policies and appear on the invoice.</p>
        </section>

        {shortfalls.length ? (
          <Notice tone="critical" title="Not enough spots">
            <ul className="list-disc pl-4">
              {shortfalls.map((s) => (
                <li key={s.id}>
                  {s.remaining === 0 ? `${s.date} is fully booked` : `Only ${s.remaining} ${s.remaining === 1 ? "spot remains" : "spots remain"} on ${s.date}`}, and this booking needs {needed}.
                </li>
              ))}
            </ul>
            {beyondHard.length ? <p className="mt-1">This would exceed the hard capacity on {beyondHard.map((s) => s.date).join(", ")}. No override can go past it.</p> : null}
          </Notice>
        ) : null}
        {ageProblems.length ? (
          <Notice tone="warning" title="Age range">
            <ul className="list-disc pl-4">
              {ageProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        {unpriced ? <Notice tone="warning">Some items have no price set. Set pricing on the program, or confirm without an invoice.</Notice> : null}

        {shortfalls.length && canOverride ? (
          <div className="rounded-xl border border-[#8a5212]/30 bg-[#f8eedd]/60 p-4">
            <label className="flex items-start gap-2.5 text-[0.85rem] text-ink">
              <input type="checkbox" name="override" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                Authorize a capacity override
                <span className="block text-[0.75rem] text-ink-soft">Recorded with your name and reason. Never exceeds the session’s hard capacity.</span>
              </span>
            </label>
            {override ? (
              <div className="mt-3">
                <TextField name="overrideReason" label="Reason for override" required />
              </div>
            ) : null}
          </div>
        ) : null}

        {blocking.length ? (
          <div className="rounded-xl border border-[#8a2333]/25 bg-[#f6e3e5]/60 p-4">
            <p className="text-[0.85rem] font-medium text-[#8a2333]">Required before booking: {blocking.join(", ")}</p>
            <div className="mt-2">
              <Checkbox name="ackPaperwork" label="Book anyway — I’ll make sure the paperwork is completed" hint="Online families can’t book until these are done. Your acknowledgement is recorded." />
            </div>
          </div>
        ) : null}

        <fieldset className="rounded-xl border border-ink/10 bg-[#fffefb] p-5">
          <legend className="px-1 text-[0.95rem] font-semibold text-ink">After creating</legend>
          <div className="space-y-2 text-[0.85rem]">
            {[
              { v: "invoice", l: "Confirm now and invoice the family (pay later)" },
              { v: "noinvoice", l: "Confirm now without an invoice" },
              { v: "link", l: "Hold the spots and send a payment link (confirms when paid)" },
            ].map((o, i) => (
              <label key={o.v} className="flex items-start gap-2.5">
                <input type="radio" name="mode" value={o.v} defaultChecked={i === 0} className="mt-0.5" />
                {o.l}
              </label>
            ))}
          </div>
          <div className="mt-3">
            <Checkbox name="notify" label="Email the family a confirmation" hint="In test mode it’s captured in Messages, not sent." defaultChecked />
          </div>
        </fieldset>
      </div>
    </ActionForm>
  );
}
