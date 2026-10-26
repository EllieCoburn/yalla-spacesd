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
  return process.env.NOTIFICATIONS_MODE === "live" && process.env.RESEND_API_KEY && process.env.NOTIFICATIONS_FROM ? "live" : "test";
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

async function deliver(to: string, subject: string, body: string): Promise<{ ok: boolean; ref?: string; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.NOTIFICATIONS_FROM, to, subject, text: body }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    return res.ok ? { ok: true, ref: json.id } : { ok: false, error: json.message ?? `HTTP ${res.status}` };
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
