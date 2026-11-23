import { ActionForm, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { Card, Empty, Pill } from "@/components/admin/ui";
import { addOpsAction, opsStatusAction, removeOpsAction } from "@/app/admin/(app)/flex-club/actions";
import type { opsRequests } from "@/lib/db/schema";
import { OPS_STEPS, URGENCY, type OpsKind } from "@/lib/ops/ops-requests";
import { fmtDateTime } from "@/lib/time";

type Row = typeof opsRequests.$inferSelect;

const COPY: Record<OpsKind, { add: string; title: string; titleHint: string; extra?: { name: "quantity"; label: string; placeholder: string }; where: string; wherePlaceholder: string; notes: string; empty: string }> = {
  supply: {
    add: "Add a supply",
    title: "What’s needed",
    titleHint: "e.g. Diapers, size 4",
    extra: { name: "quantity", label: "How many", placeholder: "e.g. 2 boxes" },
    where: "For",
    wherePlaceholder: "e.g. Sprouts, kitchen",
    notes: "Notes",
    empty: "Nothing on the supplies list. Add anything the cohorts are running low on.",
  },
  maintenance: {
    add: "Report something to fix",
    title: "What needs fixing",
    titleHint: "e.g. Sink in the Saplings room drips",
    where: "Where",
    wherePlaceholder: "e.g. Saplings room, play garden",
    notes: "Details",
    empty: "Nothing to fix right now.",
  },
};

function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return m <= 1 ? "just now" : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  const days = Math.round(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const urgencyPill = (u: string) =>
  u === "urgent" ? (
    <Pill tone="critical" icon="alert">
      Urgent
    </Pill>
  ) : u === "soon" ? (
    <Pill tone="warning" icon="clock">
      This week
    </Pill>
  ) : null;

export function OpsList({ kind, open, closed }: { kind: OpsKind; open: Row[]; closed: Row[] }) {
  const c = COPY[kind];
  const steps = OPS_STEPS[kind];
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
      <div className="space-y-6 xl:order-2">
        <Card title={c.add}>
          <ActionForm action={addOpsAction} resetOnSuccess submit={{ label: kind === "supply" ? "Add to supplies" : "Add to maintenance", pending: "Adding…" }}>
            <input type="hidden" name="kind" value={kind} />
            <TextField name="title" label={c.title} placeholder={c.titleHint} required />
            <div className="grid gap-4 sm:grid-cols-2">
              {c.extra ? <TextField name={c.extra.name} label={c.extra.label} placeholder={c.extra.placeholder} /> : null}
              <TextField name="location" label={c.where} placeholder={c.wherePlaceholder} />
              <SelectField name="urgency" label="How soon" defaultValue="normal" options={URGENCY.map((u) => ({ value: u.key, label: u.label }))} />
            </div>
            <TextArea name="notes" label={c.notes} rows={2} placeholder={kind === "supply" ? "Brand, link or where to buy (optional)" : "What happened, anything to watch out for (optional)"} />
          </ActionForm>
        </Card>
      </div>

      <div className="space-y-6 xl:order-1">
        <Card title={`${kind === "supply" ? "Supplies needed" : "Maintenance needed"} · ${open.length}`} padded={false}>
          {open.length === 0 ? (
            <div className="p-5">
              <Empty title="All clear">{c.empty}</Empty>
            </div>
          ) : (
            <ul className="divide-y divide-ink/6">
              {open.map((r) => {
                const at = steps.findIndex((s) => s.key === r.status);
                const step = steps[at];
                const next = steps[at + 1];
                return (
                  <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-[0.95rem] font-medium text-ink">{r.title}</span>
                        {urgencyPill(r.urgency)}
                        <Pill tone={at === 0 ? "neutral" : "info"}>{step?.label ?? r.status}</Pill>
                      </p>
                      {r.quantity || r.location ? (
                        <p className="mt-0.5 text-[0.84rem] text-ink">
                          {[r.quantity, r.location ? `${kind === "supply" ? "for" : "in"} ${r.location}` : null].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                      {r.notes ? <p className="mt-1 text-[0.82rem] whitespace-pre-line text-ink-soft">{r.notes}</p> : null}
                      <p className="mt-1 text-[0.74rem] text-ink-soft" title={fmtDateTime(r.createdAt)}>
                        Added by {r.createdByName} · {ago(r.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {next && step?.next ? (
                        <ActionForm action={opsStatusAction} className="" submit={{ label: step.next, variant: at === steps.length - 2 ? "primary" : "secondary" }}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value={next.key} />
                        </ActionForm>
                      ) : null}
                      <ActionForm
                        action={removeOpsAction}
                        className=""
                        submit={{ label: "Remove", variant: "ghost" }}
                        confirm={{ title: `Remove “${r.title}”?`, body: "Use this for things added by mistake. To finish an item, move it along instead.", confirmLabel: "Remove", danger: true }}
                      >
                        <input type="hidden" name="id" value={r.id} />
                      </ActionForm>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {closed.length ? (
          <details className="group rounded-2xl bg-white shadow-[0_0_0_1px_rgba(41,44,69,0.08)]">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[0.9rem] text-ink select-none">
              {kind === "supply" ? "Received recently" : "Fixed recently"} · {closed.length}
              <span className="text-ink-soft transition-transform group-open:rotate-90">›</span>
            </summary>
            <ul className="divide-y divide-ink/6 border-t border-ink/6">
              {closed.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block text-[0.88rem] text-ink-soft line-through decoration-ink/30">{r.title}</span>
                    <span className="text-[0.74rem] text-ink-soft">
                      {steps[steps.length - 1].label} {r.closedAt ? ago(r.closedAt) : ""}
                      {r.closedByName ? ` by ${r.closedByName}` : ""}
                    </span>
                  </span>
                  <ActionForm action={opsStatusAction} className="" submit={{ label: "Reopen", variant: "ghost" }}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value={steps[0].key} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}
