"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { children, families, formTemplates } from "@/lib/db/schema";
import { notificationsMode, notifyFamily } from "@/lib/notify";
import { addRequirement, createTemplate, deactivateRequirement, paperworkStatus, publishVersion, storeDocument, submitForm, updateTemplateSettings } from "@/lib/ops/forms";
import { PAPERWORK_LABEL } from "@/lib/ops/forms";

const KINDS = ["waiver", "form", "policy", "upload"];
const ENFORCEMENT = ["blocks_booking", "before_attendance", "informational"];
const FREQUENCY = ["once", "periodic", "per_booking"];

export const createTemplateAction = adminAction("forms.manage", async ({ db, actor, str, bool, num }) => {
  if (!str("title")) throw new OpsError("invalid", "Give the form a title.");
  if (!str("body")) throw new OpsError("invalid", "Add the form text (placeholder text is fine until approved language is ready).");
  if (!KINDS.includes(str("kind")) || !ENFORCEMENT.includes(str("enforcement")) || !FREQUENCY.includes(str("frequency"))) throw new OpsError("invalid", "Choose a type, requirement level and frequency.");
  if (str("frequency") === "periodic" && !num("validForMonths")) throw new OpsError("invalid", "Periodic forms need a renewal period in months.");
  const { template } = await createTemplate(db, actor, {
    title: str("title"),
    kind: str("kind"),
    description: str("description") || undefined,
    perChild: str("scopeUnit") !== "family",
    requiresSignature: bool("requiresSignature") || str("kind") === "waiver",
    frequency: str("frequency"),
    validForMonths: str("frequency") === "periodic" ? num("validForMonths") : null,
    enforcement: str("enforcement"),
    body: str("body"),
  });
  redirect(`/admin/forms/${template.id}?created=1`);
});

export const updateTemplateAction = adminAction("forms.manage", async ({ db, actor, str, num }) => {
  if (!ENFORCEMENT.includes(str("enforcement")) || !FREQUENCY.includes(str("frequency"))) throw new OpsError("invalid", "Choose a requirement level and frequency.");
  await updateTemplateSettings(db, actor, str("templateId"), {
    title: str("title"),
    description: str("description") || null,
    enforcement: str("enforcement"),
    frequency: str("frequency"),
    validForMonths: str("frequency") === "periodic" ? num("validForMonths") : null,
    status: str("status") === "archived" ? "archived" : "active",
  });
  return "Settings saved. Signed copies and versions are unchanged.";
});

export const publishVersionAction = adminAction("forms.manage", async ({ db, actor, str, bool }) => {
  if (!str("body")) throw new OpsError("invalid", "The new version needs text.");
  const v = await publishVersion(db, actor, str("templateId"), str("body"), bool("requiresResign"));
  return bool("requiresResign")
    ? `Version ${v.version} published. Families who signed an earlier version now show “New version to sign”.`
    : `Version ${v.version} published. Earlier signatures remain valid.`;
});

export const addRequirementAction = adminAction("forms.manage", async ({ db, actor, str }) => {
  const scope = str("scope");
  if (!["all", "program", "membership", "family", "child", "session"].includes(scope)) throw new OpsError("invalid", "Choose who this form is required for.");
  const input = { templateId: str("templateId"), scope, programId: null as string | null, familyId: null as string | null, childId: null as string | null, sessionId: null as string | null };
  if (scope === "program") {
    if (!str("programId")) throw new OpsError("invalid", "Choose a program.");
    input.programId = str("programId");
  }
  if (scope === "family") {
    if (!str("familyId")) throw new OpsError("invalid", "Choose a family.");
    input.familyId = str("familyId");
  }
  if (scope === "child") {
    if (!str("childId")) throw new OpsError("invalid", "Choose a child.");
    const [c] = await db.select().from(children).where(eq(children.id, str("childId")));
    if (!c) throw new OpsError("invalid", "Child not found.");
    input.childId = c.id;
  }
  if (scope === "session") {
    if (!str("sessionId")) throw new OpsError("invalid", "Choose a session (event).");
    input.sessionId = str("sessionId");
  }
  await addRequirement(db, actor, input);
  return "Requirement added.";
});

export const removeRequirementAction = adminAction("forms.manage", async ({ db, actor, str }) => {
  await deactivateRequirement(db, actor, str("requirementId"));
  return "Requirement removed. Existing submissions are kept.";
});

/** Staff recording a completed form for a family (e.g. a paper original), with optional upload. */
export const recordSubmissionAction = adminAction("forms.manage", async ({ db, actor, str, bool, form }) => {
  const [t] = await db.select().from(formTemplates).where(eq(formTemplates.id, str("templateId")));
  if (!t) throw new OpsError("not_found", "Form not found.");
  const familyId = str("familyId");
  const [fam] = await db.select().from(families).where(eq(families.id, familyId));
  if (!fam) throw new OpsError("invalid", "Choose a family.");
  const childId = str("childId") || null;
  if (childId) {
    const [c] = await db.select().from(children).where(and(eq(children.id, childId), eq(children.familyId, familyId)));
    if (!c) throw new OpsError("invalid", "That child isn’t in this family.");
  }
  let documentId: string | null = null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    documentId = await storeDocument(db, actor, { familyId, childId, filename: file.name, mimeType: file.type || "application/octet-stream", data: Buffer.from(await file.arrayBuffer()) });
  } else if (t.kind === "upload") {
    throw new OpsError("invalid", "Attach the document for this upload requirement.");
  }
  const s = await submitForm(db, actor, {
    templateId: t.id,
    familyId,
    childId,
    signerGuardianId: str("signerGuardianId") || null,
    signatureText: str("signatureText") || null,
    consent: bool("consent"),
    documentId,
    data: str("staffNote") ? { staffNote: str("staffNote") } : undefined,
  });
  redirect(`/admin/forms/submissions/${s.id}?recorded=1`);
});

export const sendReminderAction = adminAction("forms.manage", async ({ db, actor, str }) => {
  const familyId = str("familyId");
  const kids = await db.select().from(children).where(eq(children.familyId, familyId));
  const status = await paperworkStatus(db, { familyId, childIds: kids.map((k) => k.id), programIds: str("programIds") ? str("programIds").split(",") : undefined });
  const lines: string[] = [];
  for (const [key, items] of status) {
    const kid = kids.find((k) => k.id === key);
    for (const i of items.filter((x) => x.state !== "complete" && x.enforcement !== "informational"))
      lines.push(`• ${i.title}${kid ? ` (${kid.preferredName || kid.firstName})` : ""} — ${PAPERWORK_LABEL[i.state].toLowerCase()}`);
  }
  if (!lines.length) throw new OpsError("invalid", "This family has nothing outstanding.");
  const names = [...new Set(lines.map((l) => /\((.+?)\)/.exec(l)?.[1]).filter(Boolean))];
  const ids = await notifyFamily(db, {
    key: "forms_missing",
    familyId,
    vars: { child_name: names.join(" and ") || "your family", missing_forms: lines.join("\n") },
    related: { type: "family", id: familyId },
    createdBy: actor.name,
  });
  return `Reminder ${notificationsMode() === "test" ? "captured (test mode — not sent)" : "sent"} for ${ids.length} guardian${ids.length === 1 ? "" : "s"}.`;
});
