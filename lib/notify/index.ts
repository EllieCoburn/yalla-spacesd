/**
 * Transactional communications.
 *
 * Every message is written to the `messages` table (the communication history). Delivery:
 * - NOTIFICATIONS_MODE=test (default): nothing leaves the app. Messages are "captured" and
 *   visible in Admin → Communications.
 * - NOTIFICATIONS_MODE=live with RESEND_API_KEY + NOTIFICATIONS_FROM: emails are delivered.
 * Marketing preferences never block essential service messages, and marketing is never sent here.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { guardians, messages, messageTemplates } from "@/lib/db/schema";

export type TemplateKey =
  | "booking_confirmation"
  | "booking_reminder"
  | "booking_change"
  | "booking_cancellation"
  | "forms_missing"
  | "payment_receipt"
  | "payment_failed"
  | "waitlist_offer"
  | "membership_update"
  | "payment_request"
  | "staff_password_reset"
  | "staff_invite"
  | "family_sign_in";

export const DEFAULT_TEMPLATES: Record<TemplateKey, { name: string; subject: string; body: string; essential: boolean; audience: "family" | "billing" | "staff" }> = {
  booking_confirmation: {
    name: "Booking confirmation",
    subject: "You’re booked: {{program}} on {{date}}",
    body: "Hi {{guardian_first_name}},\n\nYour booking {{reference}} is confirmed.\n\n{{booking_details}}\n\nLocation: {{location}}\n{{arrival_instructions}}\n\nYou can view or change your booking in the Family Portal.\n\nWarmly,\nYalla",
    essential: true,
    audience: "family",
  },
  booking_reminder: {
    name: "Upcoming session reminder",
    subject: "See you soon: {{program}} on {{date}}",
    body: "Hi {{guardian_first_name}},\n\nA reminder about your upcoming booking {{reference}}:\n\n{{booking_details}}\n\n{{arrival_instructions}}\n\nYalla",
    essential: true,
    audience: "family",
  },
  booking_change: {
    name: "Booking change",
    subject: "Your booking {{reference}} has changed",
    body: "Hi {{guardian_first_name}},\n\nWe’ve updated your booking {{reference}}.\n\n{{change_summary}}\n\n{{booking_details}}\n\nQuestions? Just reply to this email.\n\nYalla",
    essential: true,
    audience: "family",
  },
  booking_cancellation: {
    name: "Booking cancellation",
    subject: "Booking {{reference}} cancelled",
    body: "Hi {{guardian_first_name}},\n\nThis confirms that the following has been cancelled:\n\n{{booking_details}}\n\n{{refund_note}}\n\nYalla",
    essential: true,
    audience: "family",
  },
  forms_missing: {
    name: "Missing paperwork reminder",
    subject: "A few forms are needed for {{child_name}}",
    body: "Hi {{guardian_first_name}},\n\nBefore {{child_name}}’s next visit, please complete:\n\n{{missing_forms}}\n\nYou can complete these in the Family Portal.\n\nThank you,\nYalla",
    essential: true,
    audience: "family",
  },
  payment_receipt: {
    name: "Payment receipt",
    subject: "Receipt for invoice {{invoice_number}}",
    body: "Hi {{guardian_first_name}},\n\nThank you — we received {{amount}} on {{paid_at}} for invoice {{invoice_number}}.\n\n{{line_items}}\n\nRemaining balance: {{balance}}\n\nYalla",
    essential: true,
    audience: "billing",
  },
  payment_failed: {
    name: "Failed payment notice",
    subject: "We couldn’t process your payment for {{invoice_number}}",
    body: "Hi {{guardian_first_name}},\n\nYour payment of {{amount}} for invoice {{invoice_number}} didn’t go through ({{reason}}). Your spot is held until {{hold_until}}.\n\nPlease try again from the link in the Family Portal.\n\nYalla",
    essential: true,
    audience: "billing",
  },
  waitlist_offer: {
    name: "Waitlist offer",
    subject: "A spot opened up: {{program}} on {{date}}",
    body: "Hi {{guardian_first_name}},\n\nGood news — a spot has opened for {{child_names}}:\n\n{{booking_details}}\n\nWe’re holding it for you until {{offer_expires}}. To accept, complete your booking here:\n{{offer_link}}\n\nIf it doesn’t suit, no action is needed and we’ll offer it to the next family.\n\nYalla",
    essential: true,
    audience: "family",
  },
  membership_update: {
    name: "Membership update",
    subject: "Club Yalla membership update for {{child_name}}",
    body: "Hi {{guardian_first_name}},\n\n{{membership_summary}}\n\nQuestions? Just reply to this email.\n\nYalla",
    essential: true,
    audience: "family",
  },
  payment_request: {
    name: "Payment request",
    subject: "Payment for invoice {{invoice_number}}",
    body: "Hi {{guardian_first_name}},\n\nInvoice {{invoice_number}} has a balance of {{amount}}.\n\n{{line_items}}\n\nYou can pay securely here:\n{{payment_link}}\n\nThank you,\nYalla",
    essential: true,
    audience: "billing",
  },
  staff_password_reset: {
    name: "Staff password reset",
    subject: "Reset your Yalla Admin password",
    body: "Hi {{name}},\n\nUse this link within one hour to choose a new password:\n{{link}}\n\nIf you didn’t ask for this, you can ignore this email.",
    essential: true,
    audience: "staff",
  },
  family_sign_in: {
    name: "Family Portal sign-in link",
    subject: "Your Yalla Family Portal sign-in link",
    body: "Hi {{guardian_first_name}},\n\nUse this link within 20 minutes to sign in to the Family Portal:\n{{link}}\n\nIf you didn’t ask for this, you can ignore this email.\n\nYalla",
    essential: true,
    audience: "family",
  },
  staff_invite: {
    name: "Staff invitation",
    subject: "You’re invited to Yalla Admin",
    body: "Hi {{name}},\n\n{{invited_by}} invited you to Yalla Admin as {{role}}. Set your password within 7 days:\n{{link}}",
    essential: true,
    audience: "staff",
  },
};

export function notificationsMode(): "test" | "live" {
  return process.env.NOTIFICATIONS_MODE === "live" && process.env.POSTMARK_SERVER_TOKEN && process.env.NOTIFICATIONS_FROM ? "live" : "test";
}

export function render(text: string, vars: Record<string, string | number | null | undefined>) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

export async function templateFor(db: Executor, key: TemplateKey) {
  const [row] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, key));
  const def = DEFAULT_TEMPLATES[key];
  return { key, name: def.name, subject: row?.subject ?? def.subject, body: row?.body ?? def.body, essential: def.essential, audience: def.audience, customized: !!row };
}

/** Sends one email through Postmark's transactional ("outbound") message stream. */
export async function deliver(to: string, subject: string, body: string): Promise<{ ok: boolean; ref?: string; error?: string }> {
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN ?? "", Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ From: process.env.NOTIFICATIONS_FROM, To: to, Subject: subject, TextBody: body, MessageStream: "outbound" }),
    });
    const json = (await res.json().catch(() => ({}))) as { MessageID?: string; ErrorCode?: number; Message?: string };
    return res.ok && !json.ErrorCode ? { ok: true, ref: json.MessageID } : { ok: false, error: json.Message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Sends to a family's guardians. Billing messages go only to guardians allowed to see billing. */
export async function notifyFamily(
  db: Executor,
  input: {
    key: TemplateKey;
    familyId: string;
    vars: Record<string, string | number | null | undefined>;
    related?: { type: string; id: string };
    guardianIds?: string[];
    createdBy?: string;
  },
) {
  const t = await templateFor(db, input.key);
  let recipients = await db
    .select()
    .from(guardians)
    .where(input.guardianIds?.length ? and(eq(guardians.familyId, input.familyId), inArray(guardians.id, input.guardianIds)) : eq(guardians.familyId, input.familyId));
  recipients = recipients.filter((g) => (t.audience === "billing" ? g.canViewBilling || g.isPrimary : g.isPrimary || g.portalAccess));
  const mode = notificationsMode();
  const ids: string[] = [];
  for (const g of recipients) {
    const vars = { guardian_first_name: g.firstName, ...input.vars };
    const subject = render(t.subject, vars);
    const body = render(t.body, vars);
    const [m] = await db
      .insert(messages)
      .values({
        templateKey: input.key,
        familyId: input.familyId,
        guardianId: g.id,
        toAddress: g.email,
        subject,
        body,
        mode,
        status: mode === "test" ? "captured" : "queued",
        relatedType: input.related?.type,
        relatedId: input.related?.id,
        createdBy: input.createdBy,
      })
      .returning({ id: messages.id });
    ids.push(m.id);
    if (mode === "live") {
      const r = await deliver(g.email, subject, body);
      await db
        .update(messages)
        .set({ status: r.ok ? "sent" : "failed", providerRef: r.ref, error: r.error, sentAt: r.ok ? new Date() : null })
        .where(eq(messages.id, m.id));
    }
  }
  return ids;
}

export async function notifyStaff(db: Executor, input: { key: TemplateKey; to: string; vars: Record<string, string>; relatedId?: string }) {
  const t = await templateFor(db, input.key);
  const subject = render(t.subject, input.vars);
  const body = render(t.body, input.vars);
  const mode = notificationsMode();
  const [m] = await db
    .insert(messages)
    .values({ templateKey: input.key, toAddress: input.to, subject, body, mode, status: mode === "test" ? "captured" : "queued", relatedType: "staff", relatedId: input.relatedId })
    .returning({ id: messages.id });
  if (mode === "live") {
    const r = await deliver(input.to, subject, body);
    await db.update(messages).set({ status: r.ok ? "sent" : "failed", providerRef: r.ref, error: r.error, sentAt: r.ok ? new Date() : null }).where(eq(messages.id, m.id));
  }
  return { id: m.id, mode, body };
}

/** Variables each template can use, with sample values for previews. */
export const TEMPLATE_VARIABLES: Record<TemplateKey, string[]> = {
  booking_confirmation: ["guardian_first_name", "reference", "program", "date", "booking_details", "location", "arrival_instructions"],
  booking_reminder: ["guardian_first_name", "reference", "program", "date", "booking_details", "arrival_instructions"],
  booking_change: ["guardian_first_name", "reference", "change_summary", "booking_details"],
  booking_cancellation: ["guardian_first_name", "reference", "booking_details", "refund_note"],
  forms_missing: ["guardian_first_name", "child_name", "missing_forms"],
  payment_receipt: ["guardian_first_name", "invoice_number", "amount", "paid_at", "line_items", "balance"],
  payment_failed: ["guardian_first_name", "invoice_number", "amount", "reason", "hold_until"],
  payment_request: ["guardian_first_name", "invoice_number", "amount", "line_items", "payment_link"],
  waitlist_offer: ["guardian_first_name", "program", "date", "child_names", "booking_details", "offer_expires", "offer_link"],
  membership_update: ["guardian_first_name", "child_name", "membership_summary"],
  staff_password_reset: ["name", "link"],
  staff_invite: ["name", "invited_by", "role", "link"],
  family_sign_in: ["guardian_first_name", "link"],
};

export const SAMPLE_VARIABLES: Record<string, string> = {
  guardian_first_name: "Jordan",
  name: "Sam Staff",
  reference: "YL-SAMPLE",
  program: "Yalla Flex",
  date: "Mon 2 Nov 2026",
  booking_details: "• Yalla Flex · Mon 2 Nov 8:30am–4:30pm · Ava",
  location: "Yalla Bankers Hill",
  arrival_instructions: "Please check in at the front desk.",
  change_summary: "Moved to Tue 3 Nov.",
  refund_note: "If a refund or credit applies, we’ll confirm it separately.",
  child_name: "Ava",
  child_names: "Ava",
  missing_forms: "• Health & immunization record",
  invoice_number: "INV-1001-AB",
  amount: "$150.00",
  paid_at: "Mon 2 Nov 2026, 9:00am",
  line_items: "Yalla Flex · Mon 2 Nov",
  balance: "$0.00",
  reason: "Card declined",
  hold_until: "Mon 2 Nov 2026, 9:30am",
  payment_link: "https://example.com/pay/sample",
  offer_expires: "Tue 3 Nov 2026, 9:00am",
  offer_link: "https://example.com/book/offer/YL-SAMPLE",
  membership_summary: "Your Club Yalla days change to Mon, Wed, Fri from 1 December.",
  invited_by: "Olivia Owner",
  role: "Operations",
  link: "https://example.com/admin/reset?token=sample",
};

export async function saveTemplate(db: Executor, actor: { name: string }, key: TemplateKey, subject: string, body: string) {
  const def = DEFAULT_TEMPLATES[key];
  if (!def) throw new Error("Unknown template");
  await db
    .insert(messageTemplates)
    .values({ key, name: def.name, subject, body, essential: def.essential, updatedBy: actor.name })
    .onConflictDoUpdate({ target: messageTemplates.key, set: { subject, body, updatedAt: new Date(), updatedBy: actor.name } });
}
