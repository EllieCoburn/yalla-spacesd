/**
 * Club Yalla operations lists: supplies to buy and maintenance to fix. Anyone with "ops.lists" adds to
 * them and moves items along; each change is recorded in the audit trail.
 */
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { opsRequests } from "@/lib/db/schema";

export type OpsKind = "supply" | "maintenance";

/** Each list's steps, in order. The last one closes the item. */
export const OPS_STEPS: Record<OpsKind, { key: string; label: string; next?: string }[]> = {
  supply: [
    { key: "needed", label: "Needed", next: "Mark ordered" },
    { key: "ordered", label: "Ordered", next: "Mark received" },
    { key: "received", label: "Received" },
  ],
  maintenance: [
    { key: "reported", label: "Reported", next: "Start work" },
    { key: "in_progress", label: "In progress", next: "Mark fixed" },
    { key: "fixed", label: "Fixed" },
  ],
};

export const URGENCY = [
  { key: "normal", label: "When you can" },
  { key: "soon", label: "This week" },
  { key: "urgent", label: "Urgent" },
] as const;

const first = (k: OpsKind) => OPS_STEPS[k][0].key;
const last = (k: OpsKind) => OPS_STEPS[k][OPS_STEPS[k].length - 1].key;
const actorId = (a: Actor) => ("id" in a ? (a.id ?? null) : null);

export async function addOpsRequest(db: Executor, actor: Actor, input: { kind: OpsKind; title: string; quantity?: string; location?: string; notes?: string; urgency?: string }) {
  const title = input.title.trim();
  if (!title) throw new OpsError("invalid", input.kind === "supply" ? "Add what’s needed." : "Describe what needs fixing.");
  if (title.length > 200) throw new OpsError("invalid", "Keep it under 200 characters; add the rest as notes.");
  const urgency = URGENCY.some((u) => u.key === input.urgency) ? input.urgency! : "normal";
  const [row] = await db
    .insert(opsRequests)
    .values({
      kind: input.kind,
      title,
      quantity: input.quantity?.trim().slice(0, 80) || null,
      location: input.location?.trim().slice(0, 120) || null,
      notes: input.notes?.trim().slice(0, 2000) || null,
      urgency,
      status: first(input.kind),
      createdById: actorId(actor),
      createdByName: actor.name,
    })
    .returning();
  await audit(db, actor, { action: `ops.${input.kind}.add`, entityType: "ops_request", entityId: row.id, summary: `Added to ${input.kind === "supply" ? "supplies" : "maintenance"}: ${title}` });
  return row;
}

/** Moves an item to a step on its list (forward, or back to reopen it). */
export async function setOpsStatus(db: Executor, actor: Actor, id: string, status: string) {
  const [row] = await db.select().from(opsRequests).where(eq(opsRequests.id, id));
  if (!row) throw new OpsError("not_found", "That item is no longer on the list.");
  const kind = row.kind as OpsKind;
  const step = OPS_STEPS[kind].find((s) => s.key === status);
  if (!step) throw new OpsError("invalid", "Unknown step.");
  const closing = status === last(kind);
  await db
    .update(opsRequests)
    .set({ status, updatedAt: new Date(), closedAt: closing ? new Date() : null, closedByName: closing ? actor.name : null })
    .where(eq(opsRequests.id, id));
  await audit(db, actor, { action: `ops.${kind}.status`, entityType: "ops_request", entityId: id, summary: `${row.title}: ${step.label}` });
}

export async function removeOpsRequest(db: Executor, actor: Actor, id: string) {
  const [row] = await db.delete(opsRequests).where(eq(opsRequests.id, id)).returning();
  if (row) await audit(db, actor, { action: `ops.${row.kind}.remove`, entityType: "ops_request", entityId: id, summary: `Removed from ${row.kind === "supply" ? "supplies" : "maintenance"}: ${row.title}` });
}

/** A list: open items (most urgent, then oldest first) and the 30 most recently closed. */
export async function opsList(db: Executor, kind: OpsKind) {
  const done = last(kind);
  const [open, closed] = await Promise.all([
    db
      .select()
      .from(opsRequests)
      .where(and(eq(opsRequests.kind, kind), sql`${opsRequests.status} <> ${done}`))
      .orderBy(sql`case ${opsRequests.urgency} when 'urgent' then 0 when 'soon' then 1 else 2 end`, asc(opsRequests.createdAt)),
    db
      .select()
      .from(opsRequests)
      .where(and(eq(opsRequests.kind, kind), eq(opsRequests.status, done), isNotNull(opsRequests.closedAt)))
      .orderBy(desc(opsRequests.closedAt))
      .limit(30),
  ]);
  return { open, closed };
}

/** Open counts for both lists (for tab badges). */
export async function opsOpenCounts(db: Executor) {
  const rows = await db
    .select({ kind: opsRequests.kind, n: sql<number>`count(*)::int`, urgent: sql<number>`count(*) filter (where ${opsRequests.urgency} = 'urgent')::int` })
    .from(opsRequests)
    .where(and(inArray(opsRequests.kind, ["supply", "maintenance"]), sql`${opsRequests.status} not in ('received', 'fixed')`))
    .groupBy(opsRequests.kind);
  const get = (k: string) => {
    const r = rows.find((x) => x.kind === k);
    return { n: r?.n ?? 0, urgent: r?.urgent ?? 0 };
  };
  return { supply: get("supply"), maintenance: get("maintenance") };
}
