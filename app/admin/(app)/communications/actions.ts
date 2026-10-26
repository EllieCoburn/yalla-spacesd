"use server";

import { adminAction } from "@/lib/admin/action";
import { audit, OpsError } from "@/lib/audit";
import { DEFAULT_TEMPLATES, notifyFamily, saveTemplate, TEMPLATE_VARIABLES, type TemplateKey } from "@/lib/notify";
import { messageTemplates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const isKey = (k: string): k is TemplateKey => k in DEFAULT_TEMPLATES;

export const saveTemplateAction = adminAction("communications.manage", async ({ db, actor, str }) => {
  const key = str("key");
  if (!isKey(key)) throw new OpsError("invalid", "Unknown template.");
  const subject = str("subject");
  const body = String(str("body"));
  if (!subject) throw new OpsError("invalid", "The subject can’t be empty.");
  if (body.length < 10) throw new OpsError("invalid", "The message body is too short.");
  const unknown = [...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g), ...subject.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]).filter((v) => !TEMPLATE_VARIABLES[key].includes(v));
  if (unknown.length) throw new OpsError("invalid", `These variables aren’t available for this template: ${[...new Set(unknown)].map((u) => `{{${u}}}`).join(", ")}.`);
  // Essential booking details must stay in the messages that carry them.
  const essentials: Partial<Record<TemplateKey, string[]>> = {
    booking_confirmation: ["reference", "booking_details"],
    booking_change: ["reference"],
    booking_cancellation: ["booking_details"],
    payment_receipt: ["invoice_number", "amount"],
    payment_request: ["payment_link", "amount"],
    waitlist_offer: ["offer_link", "offer_expires"],
    staff_password_reset: ["link"],
    staff_invite: ["link"],
  };
  const missing = (essentials[key] ?? []).filter((v) => !body.includes(`{{${v}}}`) && !subject.includes(`{{${v}}}`));
  if (missing.length) throw new OpsError("invalid", `Keep these details in the message so families get accurate information: ${missing.map((m) => `{{${m}}}`).join(", ")}.`);
  await saveTemplate(db, actor, key, subject, body);
  await audit(db, actor, { action: "communications.template", entityType: "template", entityId: key, summary: `Edited “${DEFAULT_TEMPLATES[key].name}” template` });
  return "Template saved.";
});

export const resetTemplateAction = adminAction("communications.manage", async ({ db, actor, str }) => {
  const key = str("key");
  if (!isKey(key)) throw new OpsError("invalid", "Unknown template.");
  await db.delete(messageTemplates).where(eq(messageTemplates.key, key));
  await audit(db, actor, { action: "communications.template", entityType: "template", entityId: key, summary: `Restored the default “${DEFAULT_TEMPLATES[key].name}” template` });
  return "Default restored.";
});

export const sendManualAction = adminAction("communications.manage", async ({ db, actor, str }) => {
  const key = str("template");
  if (!isKey(key) || DEFAULT_TEMPLATES[key].audience === "staff") throw new OpsError("invalid", "Choose a family template.");
  if (!str("familyId")) throw new OpsError("invalid", "Choose a family.");
  const vars: Record<string, string> = {};
  for (const v of TEMPLATE_VARIABLES[key]) if (v !== "guardian_first_name") vars[v] = str(`var_${v}`);
  const empty = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k);
  if (empty.length) throw new OpsError("invalid", `Fill in: ${empty.map((e) => e.replace(/_/g, " ")).join(", ")}.`);
  const ids = await notifyFamily(db, { key, familyId: str("familyId"), vars, related: { type: "family", id: str("familyId") }, createdBy: actor.name });
  if (!ids.length) throw new OpsError("no_recipients", "No guardian in this family can receive this message.");
  await audit(db, actor, { action: "communications.send", entityType: "family", entityId: str("familyId"), summary: `Sent “${DEFAULT_TEMPLATES[key].name}” to ${ids.length} guardian(s)` });
  return `Message ${ids.length > 1 ? `to ${ids.length} guardians ` : ""}recorded.`;
});
