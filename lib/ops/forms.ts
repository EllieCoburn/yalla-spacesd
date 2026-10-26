/**
 * Forms, waivers and documents.
 *
 * - Published versions are immutable; editing creates a new version with its own content hash.
 * - A submission snapshots the exact text and hash it was signed against, plus signer identity,
 *   relationship, timestamp, IP and user agent.
 * - Built-in signatures are typed-name e-signatures with explicit consent. They are a workflow,
 *   not a legal guarantee: Yalla must supply reviewed waiver language, and may connect a signature
 *   provider later (see docs/ADMIN.md).
 */
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { children, documents, formRequirements, formSubmissions, formTemplates, formVersions, guardians, memberships } from "@/lib/db/schema";
import { sha256 } from "@/lib/auth/crypto";
import { addDaysISO, todayLA } from "@/lib/time";

export type PaperworkState = "complete" | "missing" | "unsigned" | "expired" | "needs_resign";
export const PAPERWORK_LABEL: Record<PaperworkState, string> = {
  complete: "Complete",
  missing: "Missing",
  unsigned: "Awaiting signature",
  expired: "Expired",
  needs_resign: "New version to sign",
};

export type PaperworkItem = {
  templateId: string;
  title: string;
  kind: string;
  enforcement: string;
  perChild: boolean;
  childId: string | null;
  state: PaperworkState;
  submissionId: string | null;
  signedAt: Date | null;
  expiresOn: string | null;
};

type Ctx = { familyId: string; childIds: string[]; programIds?: string[]; sessionIds?: string[]; bookingId?: string; onDate?: string };

/** Templates that apply to a family/children in a given context. */
export async function applicableTemplates(db: Executor, ctx: Ctx) {
  const memberChildIds = ctx.childIds.length
    ? (await db.select({ childId: memberships.childId }).from(memberships).where(and(inArray(memberships.childId, ctx.childIds), inArray(memberships.status, ["active", "upcoming", "paused"])))).map((m) => m.childId)
    : [];
  const conds = [eq(formRequirements.scope, "all"), eq(formRequirements.familyId, ctx.familyId)];
  if (ctx.programIds?.length) conds.push(and(eq(formRequirements.scope, "program"), inArray(formRequirements.programId, ctx.programIds))!);
  if (ctx.childIds.length) conds.push(inArray(formRequirements.childId, ctx.childIds));
  if (ctx.sessionIds?.length) conds.push(inArray(formRequirements.sessionId, ctx.sessionIds));
  if (memberChildIds.length) conds.push(eq(formRequirements.scope, "membership"));
  const rows = await db
    .select({ r: formRequirements, t: formTemplates })
    .from(formRequirements)
    .innerJoin(formTemplates, eq(formTemplates.id, formRequirements.templateId))
    .where(and(eq(formRequirements.active, true), eq(formTemplates.status, "active"), or(...conds)));
  return rows.map((x) => ({
    ...x,
    // Child-scoped and membership-scoped requirements apply only to those children.
    appliesToChild: (childId: string) =>
      x.r.scope === "child" ? x.r.childId === childId : x.r.scope === "membership" ? memberChildIds.includes(childId) : true,
  }));
}

export async function paperworkStatus(db: Executor, ctx: Ctx): Promise<Map<string, PaperworkItem[]>> {
  const onDate = ctx.onDate ?? todayLA();
  const reqs = await applicableTemplates(db, ctx);
  const templateIds = [...new Set(reqs.map((r) => r.t.id))];
  const out = new Map<string, PaperworkItem[]>();
  for (const c of ctx.childIds) out.set(c, []);
  out.set("family", []);
  if (!templateIds.length) return out;

  const subs = await db
    .select()
    .from(formSubmissions)
    .where(and(eq(formSubmissions.familyId, ctx.familyId), inArray(formSubmissions.templateId, templateIds), inArray(formSubmissions.status, ["submitted", "signed"])))
    .orderBy(desc(formSubmissions.createdAt));
  const versions = await db.select().from(formVersions).where(inArray(formVersions.templateId, templateIds));
  const versionById = new Map(versions.map((v) => [v.id, v]));

  const evaluate = (t: (typeof reqs)[number]["t"], childId: string | null): PaperworkItem => {
    const candidates = subs.filter(
      (s) => s.templateId === t.id && (t.perChild ? s.childId === childId : true) && (t.frequency !== "per_booking" || (ctx.bookingId && s.bookingId === ctx.bookingId)),
    );
    const latest = candidates[0];
    let state: PaperworkState = "complete";
    if (!latest) state = "missing";
    else if (t.requiresSignature && latest.status !== "signed") state = "unsigned";
    else if (latest.expiresOn && latest.expiresOn < onDate) state = "expired";
    else if (t.currentVersionId && latest.versionId !== t.currentVersionId) {
      const current = versionById.get(t.currentVersionId);
      if (current?.requiresResign) state = "needs_resign";
    }
    return {
      templateId: t.id,
      title: t.title,
      kind: t.kind,
      enforcement: t.enforcement,
      perChild: t.perChild,
      childId,
      state,
      submissionId: latest?.id ?? null,
      signedAt: latest?.signedAt ?? latest?.createdAt ?? null,
      expiresOn: latest?.expiresOn ?? null,
    };
  };

  const seen = new Set<string>();
  for (const r of reqs) {
    if (r.t.perChild) {
      for (const c of ctx.childIds) {
        if (!r.appliesToChild(c) || seen.has(`${r.t.id}:${c}`)) continue;
        seen.add(`${r.t.id}:${c}`);
        out.get(c)!.push(evaluate(r.t, c));
      }
    } else if (!seen.has(`${r.t.id}:family`)) {
      seen.add(`${r.t.id}:family`);
      out.get("family")!.push(evaluate(r.t, null));
    }
  }
  return out;
}

/** Outstanding items that block booking (enforcement = blocks_booking). */
export async function blockingPaperwork(db: Executor, ctx: Ctx) {
  const status = await paperworkStatus(db, ctx);
  return [...status.values()].flat().filter((i) => i.enforcement === "blocks_booking" && i.state !== "complete");
}

/* ── Templates & versions ── */

export async function createTemplate(
  db: Executor,
  actor: Actor,
  input: { title: string; kind: string; description?: string; perChild: boolean; requiresSignature: boolean; frequency: string; validForMonths?: number | null; enforcement: string; body: string },
) {
  const [t] = await db
    .insert(formTemplates)
    .values({
      title: input.title,
      kind: input.kind,
      description: input.description,
      perChild: input.perChild,
      requiresSignature: input.requiresSignature,
      frequency: input.frequency,
      validForMonths: input.validForMonths ?? null,
      enforcement: input.enforcement,
    })
    .returning();
  const v = await publishVersion(db, actor, t.id, input.body, true, true);
  await audit(db, actor, { action: "forms.create", entityType: "form", entityId: t.id, summary: `Created form “${t.title}”` });
  return { template: t, version: v };
}

/** Creates a new immutable version. Earlier signed copies are untouched. */
export async function publishVersion(db: Executor, actor: Actor, templateId: string, body: string, requiresResign: boolean, silent = false) {
  const [last] = await db.select().from(formVersions).where(eq(formVersions.templateId, templateId)).orderBy(desc(formVersions.version)).limit(1);
  if (last && last.body === body) throw new OpsError("unchanged", "This text is identical to the current version.");
  if (last) await db.update(formVersions).set({ status: "superseded" }).where(eq(formVersions.id, last.id));
  const [v] = await db
    .insert(formVersions)
    .values({ templateId, version: (last?.version ?? 0) + 1, body, contentHash: sha256(body), requiresResign, publishedBy: actor.name })
    .returning();
  await db.update(formTemplates).set({ currentVersionId: v.id, updatedAt: new Date() }).where(eq(formTemplates.id, templateId));
  if (!silent)
    await audit(db, actor, {
      action: "forms.version",
      entityType: "form",
      entityId: templateId,
      summary: `Published version ${v.version}${requiresResign ? " — new signature required" : " — earlier signatures remain valid"}`,
    });
  return v;
}

export async function addRequirement(
  db: Executor,
  actor: Actor,
  input: { templateId: string; scope: string; programId?: string | null; familyId?: string | null; childId?: string | null; sessionId?: string | null },
) {
  const [r] = await db.insert(formRequirements).values(input).returning();
  await audit(db, actor, { action: "forms.requirement", entityType: "form", entityId: input.templateId, summary: `Added requirement (${input.scope})` });
  return r;
}

/** Records a completed/signed form. Staff may record on a family's behalf (e.g. a paper original). */
export async function submitForm(
  db: Executor,
  actor: Actor,
  input: {
    templateId: string;
    familyId: string;
    childId?: string | null;
    bookingId?: string | null;
    signerGuardianId?: string | null;
    signatureText?: string | null;
    consent: boolean;
    data?: Record<string, unknown>;
    documentId?: string | null;
    ip?: string;
    userAgent?: string;
  },
) {
  const [t] = await db.select().from(formTemplates).where(eq(formTemplates.id, input.templateId));
  if (!t?.currentVersionId) throw new OpsError("invalid", "This form has no published version.");
  const [v] = await db.select().from(formVersions).where(eq(formVersions.id, t.currentVersionId));
  if (t.perChild && !input.childId) throw new OpsError("invalid", "Choose which child this form is for.");
  let signer: typeof guardians.$inferSelect | undefined;
  if (input.signerGuardianId) {
    [signer] = await db.select().from(guardians).where(and(eq(guardians.id, input.signerGuardianId), eq(guardians.familyId, input.familyId)));
    if (!signer) throw new OpsError("invalid", "The signer must be a guardian in this family.");
  }
  if (t.requiresSignature) {
    if (!signer) throw new OpsError("invalid", "Choose the guardian who is signing.");
    if (!input.consent) throw new OpsError("invalid", "The signer must agree to sign electronically.");
    if (!input.signatureText?.trim()) throw new OpsError("invalid", "Type the signer’s full name as their signature.");
  }
  const now = new Date();
  const expiresOn = t.validForMonths ? addDaysISO(todayLA(now), Math.round(t.validForMonths * 30.44)) : null;
  // Older submissions for the same requirement are superseded, not altered.
  await db
    .update(formSubmissions)
    .set({ status: "superseded" })
    .where(
      and(
        eq(formSubmissions.templateId, t.id),
        eq(formSubmissions.familyId, input.familyId),
        input.childId ? eq(formSubmissions.childId, input.childId) : isNull(formSubmissions.childId),
        input.bookingId ? eq(formSubmissions.bookingId, input.bookingId) : sql`true`,
        inArray(formSubmissions.status, ["submitted", "signed"]),
      ),
    );
  const [s] = await db
    .insert(formSubmissions)
    .values({
      templateId: t.id,
      versionId: v.id,
      familyId: input.familyId,
      childId: input.childId ?? null,
      bookingId: input.bookingId ?? null,
      status: t.requiresSignature ? "signed" : "submitted",
      data: input.data ?? null,
      versionBody: v.body,
      contentHash: v.contentHash,
      signerGuardianId: signer?.id ?? null,
      signerName: signer ? `${signer.firstName} ${signer.lastName}` : null,
      signerRelationship: signer?.relationship ?? null,
      signatureText: input.signatureText ?? null,
      signedAt: t.requiresSignature ? now : null,
      signerIp: input.ip ?? null,
      signerUserAgent: input.userAgent?.slice(0, 300) ?? null,
      documentId: input.documentId ?? null,
      expiresOn,
      recordedByStaffId: actor.type === "staff" ? actor.id : null,
    })
    .returning();
  await audit(db, actor, {
    action: t.requiresSignature ? "forms.signed" : "forms.submitted",
    entityType: "form_submission",
    entityId: s.id,
    summary: `${t.title} v${v.version} ${t.requiresSignature ? `signed by ${s.signerName}` : "submitted"}${actor.type === "staff" ? ` (recorded by ${actor.name})` : ""}`,
  });
  return s;
}

export async function storeDocument(db: Executor, actor: Actor, input: { familyId?: string | null; childId?: string | null; filename: string; mimeType: string; data: Buffer }) {
  const allowed = ["application/pdf", "image/png", "image/jpeg", "image/heic", "image/webp"];
  if (!allowed.includes(input.mimeType)) throw new OpsError("invalid", "Upload a PDF or an image.");
  if (input.data.length > 8 * 1024 * 1024) throw new OpsError("invalid", "Files must be 8 MB or smaller.");
  const [d] = await db
    .insert(documents)
    .values({ familyId: input.familyId ?? null, childId: input.childId ?? null, filename: input.filename.slice(0, 200), mimeType: input.mimeType, size: input.data.length, data: input.data, uploadedBy: actor.name })
    .returning({ id: documents.id });
  await audit(db, actor, { action: "documents.upload", entityType: "document", entityId: d.id, summary: `Uploaded ${input.filename}` });
  return d.id;
}

/** Children with outstanding paperwork among the given children (for dashboard & reminders). */
export async function outstandingForChildren(db: Executor, childIds: string[], onDate?: string) {
  if (!childIds.length) return [];
  const rows = await db.select({ id: children.id, familyId: children.familyId }).from(children).where(inArray(children.id, childIds));
  const byFamily = new Map<string, string[]>();
  for (const r of rows) byFamily.set(r.familyId, [...(byFamily.get(r.familyId) ?? []), r.id]);
  const out: { familyId: string; childId: string | null; items: PaperworkItem[] }[] = [];
  for (const [familyId, ids] of byFamily) {
    const status = await paperworkStatus(db, { familyId, childIds: ids, onDate });
    for (const [key, items] of status) {
      const open = items.filter((i) => i.state !== "complete" && i.enforcement !== "informational");
      if (open.length) out.push({ familyId, childId: key === "family" ? null : key, items: open });
    }
  }
  return out;
}

/** Requirements are deactivated, not deleted, so the history of what was required stays intact. */
export async function deactivateRequirement(db: Executor, actor: Actor, requirementId: string) {
  const [r] = await db.update(formRequirements).set({ active: false }).where(eq(formRequirements.id, requirementId)).returning();
  if (r) await audit(db, actor, { action: "forms.requirement_remove", entityType: "form", entityId: r.templateId, summary: `Removed requirement (${r.scope})` });
}

export async function updateTemplateSettings(
  db: Executor,
  actor: Actor,
  templateId: string,
  patch: { title?: string; description?: string | null; enforcement?: string; frequency?: string; validForMonths?: number | null; status?: string },
) {
  const [t] = await db.select().from(formTemplates).where(eq(formTemplates.id, templateId));
  if (!t) throw new OpsError("not_found", "Form not found.");
  if (patch.title !== undefined && !patch.title.trim()) throw new OpsError("invalid", "The form needs a title.");
  await db.update(formTemplates).set({ ...patch, updatedAt: new Date() }).where(eq(formTemplates.id, templateId));
  await audit(db, actor, { action: "forms.settings", entityType: "form", entityId: templateId, summary: `Updated settings for “${t.title}”`, changes: patch as Record<string, unknown> });
}
