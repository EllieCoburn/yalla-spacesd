"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { addExtrasAction, type ExtrasState } from "@/app/(site)/portal/extras/actions";
import type { DayExtras } from "@/lib/ops/booking-extras";

const usd = (c: number) => "$" + (c / 100).toFixed(c % 100 ? 2 : 0);

function Pay({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending || total === 0} className="h-12 rounded-full bg-ink px-7 text-[0.9rem] text-chalk transition-colors hover:bg-blue disabled:opacity-40">
      {pending ? "One moment…" : total ? "Add and pay " + usd(total) : "Choose an extra"}
    </button>
  );
}

/** The extras a family can add to one day they've booked, with a running total. */
export function ExtrasForm({ date, days }: { date: string; days: DayExtras[] }) {
  const [state, action] = useActionState<ExtrasState, FormData>(addExtrasAction, undefined);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const total = Object.values(picked).reduce((s, n) => s + n, 0);
  const toggle = (v: string, cents: number, on: boolean) =>
    setPicked((p) => {
      const next = { ...p };
      if (on) next[v] = cents;
      else delete next[v];
      return next;
    });
  const row = (v: string, cents: number, label: string, time: string, prompt?: string) => (
    <label key={v} className={"flex cursor-pointer items-start gap-3 border p-4 transition-colors " + (picked[v] != null ? "border-blue bg-blue/[0.05]" : "border-line hover:border-ink/40")}>
      <input type="checkbox" name="pick" value={v} checked={picked[v] != null} onChange={(e) => toggle(v, cents, e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-blue)]" />
      <span className="flex-1">
        {prompt ? <span className="block text-[0.78rem] text-ink-soft">{prompt}</span> : null}
        <span className="block">{label}</span>
        <span className="text-[0.82rem] text-ink-soft">{time}</span>
      </span>
      <span className="text-ink">+{usd(cents)}</span>
    </label>
  );
  const any = days.some((d) => d.family.some((f) => !f.added) || d.children.some((c) => c.offers.length));
  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="date" value={date} />
      {days.map((d) => (
        <section key={d.sessionId} className="border border-line bg-paper p-6">
          <p className="display text-[1.4rem]">{d.title}</p>
          <p className="text-[0.85rem] text-ink-soft">
            {d.time} · {d.children.map((c) => c.name).join(", ")}
          </p>
          <div className="mt-5 space-y-3">
            {d.family.map((f) =>
              f.added ? (
                <p key={f.offer.key} className="text-[0.9rem] text-ink-soft">
                  ✓ {f.offer.label} is already added.
                </p>
              ) : (
                row(f.itemId + "|" + f.offer.key, f.offer.priceCents, f.offer.label, f.offer.time, f.offer.prompt)
              ),
            )}
            {d.children.map((c) => c.offers.map((o) => row(c.itemId + "|" + o.key, o.priceCents, o.label + " for " + c.name, o.time)))}
            {!d.family.some((f) => !f.added) && !d.children.some((c) => c.offers.length) ? (
              <p className="text-[0.9rem] text-ink-soft">There are no extras to add for this session.</p>
            ) : null}
          </div>
        </section>
      ))}
      {state?.error ? (
        <p role="alert" className="border-l-2 border-oxblood/50 pl-3 text-[0.9rem] text-oxblood">
          {state.error}
        </p>
      ) : null}
      {any ? (
        <div className="flex flex-wrap items-center gap-4">
          <Pay total={total} />
          <p className="text-[0.82rem] text-ink-soft">You’ll pay by card. Extras are added to your booking as soon as payment goes through.</p>
        </div>
      ) : null}
    </form>
  );
}
