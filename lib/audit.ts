import { auditLog } from "@/lib/db/schema";
import type { Executor } from "@/lib/db";

export type Actor =
  | { type: "staff"; id: string; name: string; permissions?: readonly string[] }
  | { type: "family"; id: string; name: string }
  | { type: "system"; id?: string; name: string }
  | { type: "webhook"; id?: string; name: string };

export const SYSTEM: Actor = { type: "system", name: "System" };

/** Fields whose values never go into the audit trail — only the fact that they changed. */
const SENSITIVE = new Set([
  "allergies",
  "medicalNotes",
  "careNotes",
  "staffNotes",
  "restrictionNote",
  "passwordHash",
  "mfaSecretEnc",
  "data",
  "signatureText",
  "body",
]);

export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const a = before[k],
      b = after[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out[k] = SENSITIVE.has(k) ? "changed" : { from: a ?? null, to: b ?? null };
  }
  return out;
}

export async function audit(
  db: Executor,
  actor: Actor,
  entry: { action: string; entityType: string; entityId?: string | null; summary: string; changes?: Record<string, unknown> | null; ip?: string | null },
) {
  await db.insert(auditLog).values({
    actorType: actor.type,
    actorId: "id" in actor ? (actor.id ?? null) : null,
    actorName: actor.name,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    changes: entry.changes && Object.keys(entry.changes).length ? entry.changes : null,
    ip: entry.ip ?? null,
  });
}

/** A user-facing, expected failure (validation, capacity, permissions). */
export class OpsError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "OpsError";
  }
}
