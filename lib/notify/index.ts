/**
 * Transactional communications.
 *
 * Every message is written to the `messages` table (the communication history). Delivery:
 * - NOTIFICATIONS_MODE=test (default): nothing leaves the app. Messages are "captured" and
 *   visible in Admin → Communications.
 * - NOTIFICATIONS_MODE=live with POSTMARK_SERVER_TOKEN + NOTIFICATIONS_FROM: emails are delivered.
 * Marketing preferences never block essential service messages, and marketing is never sent here.
 */
import { firstVisitDetails, welcomeLetter, type WelcomeChild } from "@/lib/ops/flex-welcome";
import { FLEX_GROUPS } from "@/lib/booking/flex";
import { campDayDetails, campWelcomeLetter, type CampChild } from "@/lib/ops/camp-welcome";
import { CAMP_GROUPS } from "@/content/camp-what-to-bring";
import { and, eq, inArray } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { guardians, messages, messageTemplates } from "@/lib/db/schema";
import { emailHtml, plainText } from "./html";
import { families } from "@/lib/db/schema";
import { getPolicy } from "@/lib/ops/settings";
import { trustedBaseUrl } from "@/lib/base-url";

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
  | "family_sign_in"
  | "family_confirm_email"
  | "family_invite"
  | "booking_welcome_team"
  | "booking_confirmed_team"
  | "space_confirmation"
  | "playpass_welcome"
  | "playpass_renewal"
  | "playpass_payment_failed"
  | "playpass_change"
  | "staff_membership_update"
  | "yalla_cancellation"
  | "late_fee"
  | "staff_new_enquiry"
  | "enquiry_received"
  | "tour_received"
  | "application_received"
  | "event_received"
  | "family_welcome"
  | "staff_family_joined"
  | "staff_new_booking"
  | "staff_booking_cancelled"
  | "flex_welcome"
  | "camp_welcome"
  | "waitlist_update"
  | "flex_thank_you"
  | "cohort_drop_in"
  | "cohort_drop_in_cancelled";

export const DEFAULT_TEMPLATES: Record<TemplateKey, { name: string; subject: string; body: string; essential: boolean; audience: "family" | "billing" | "staff" }> = {
  playpass_welcome: {
    name: "Play Pass welcome",
    subject: "Welcome to your {{plan}} Play Pass",
    body: "Hi {{guardian_first_name}},\n\nWelcome to Yalla Play Passes. Your {{plan}} Play Pass is active.\n\nPaid today: {{amount}}\nAdded to your Play Pass: {{added}}\nAvailable to spend: {{balance}}\n\nFrom {{next_renewal}}, your Play Pass renews on the 1st of each month: {{monthly_price}}, with {{monthly_allocation}} to spend on Yalla experiences.\n\nYour balance is applied automatically when you book eligible experiences, for any of your children. You can see your balance, upgrade, pause or give notice to cancel under My Play Pass in the Family Portal.\n\nWe can’t wait to play,\nTeam Yalla",
    essential: true,
    audience: "billing",
  },
  playpass_renewal: {
    name: "Play Pass monthly renewal",
    subject: "Your {{plan}} Play Pass has renewed",
    body: "Hi {{guardian_first_name}},\n\nYour {{plan}} Play Pass renewed today.\n\nPaid: {{amount}}\nAdded to your Play Pass: {{added}}\nAvailable to spend: {{balance}}\n\nNext renewal: {{next_renewal}}.\n\nTeam Yalla",
    essential: true,
    audience: "billing",
  },
  playpass_payment_failed: {
    name: "Play Pass payment failed",
    subject: "We couldn’t process your Play Pass payment",
    body: "Hi {{guardian_first_name}},\n\nYour Play Pass payment of {{amount}} didn’t go through ({{reason}}). We’ll try again automatically over the next few days.\n\nTo update your card, open My Play Pass in the Family Portal and choose “Update payment method”. Your current balance is unaffected.\n\nTeam Yalla",
    essential: true,
    audience: "billing",
  },
  staff_membership_update: {
    name: "Membership update (to the membership team)",
    subject: "Play Pass: {{event}} · {{family_name}} family",
    body: "{{event}} for the {{family_name}} family.\n\nWhat the family was told:\n\n{{details}}\n\n{{link}}",
    essential: true,
    audience: "staff",
  },
  playpass_change: {
    name: "Play Pass change",
    subject: "Your Play Pass has been updated",
    body: "Hi {{guardian_first_name}},\n\n{{change_summary}}\n\nYou can review your Play Pass anytime under My Play Pass in the Family Portal.\n\nTeam Yalla",
    essential: true,
    audience: "billing",
  },
  space_confirmation: {
    name: "Workspace reservation confirmation",
    subject: "Your space is all yours: {{workspace}}",
    body: "Hi {{guardian_first_name}},\n\nYour workspace reservation {{reference}} is confirmed.\n\n{{workspace}}\n{{when}}\n{{amount}}\n\nYou can view or change it under Book a Space in the Family Portal.\n\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  booking_confirmation: {
    name: "Booking confirmation",
    subject: "You’re booked: {{program}} on {{date}}",
    body: "# You’re all set!\n\nHi {{guardian_first_name}},\n\nYour booking is confirmed, and we can’t wait to see you. Here are your details.\n\n{{booking_summary}}\n\n{{portal_link}}\n\nNeed to make a change? You can view or cancel your booking in your Family Portal.\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  booking_reminder: {
    name: "Upcoming session reminder",
    subject: "See you tomorrow: {{program}} on {{date}}",
    body: "Hi {{guardian_first_name}},\n\nA reminder about your booking tomorrow ({{reference}}):\n\n{{booking_details}}\n\n{{arrival_instructions}}\n\n{{upgrade_note}}\n\nWe can’t wait to see you.\n\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  booking_change: {
    name: "Booking change",
    subject: "Your booking {{reference}} has changed",
    body: "Hi {{guardian_first_name}},\n\nWe’ve updated your booking {{reference}}.\n\n{{change_summary}}\n\n{{booking_details}}\n\nQuestions? Just reply to this email.\n\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  yalla_cancellation: {
    name: "Yalla cancelled a reservation",
    subject: "We’ve had to cancel your reservation. Choose how you’d like your {{amount}} back",
    body: "Hi {{guardian_first_name}},\n\nWe’re sorry: we’ve had to cancel the following reservation.\n\n{{booking_details}}\nReason: {{reason}}\n\nYou paid {{amount}}. Please choose how you’d like it back in your Family Portal, under Yalla Wallet:\n\n- Yalla Wallet credit of {{credit_amount}} (the full amount plus {{bonus_percent}}% as a thank-you for your flexibility), usable on any Yalla booking for 24 months, or\n- A full refund of {{amount}} to your original payment method. We process refunds within 7 business days; when the funds appear depends on your bank or card issuer.\n\nThank you for understanding,\nTeam Yalla",
    essential: true,
    audience: "billing",
  },
  staff_new_booking: {
    name: "New booking (to staff)",
    subject: "New booking: {{summary}}",
    body: "# New booking\n\n{{details}}\n\n{{link}}",
    essential: true,
    audience: "staff",
  },
  staff_booking_cancelled: {
    name: "Booking cancelled (to staff)",
    subject: "Cancelled: {{summary}}",
    body: "# Booking cancelled\n\n{{details}}\n\n{{link}}",
    essential: true,
    audience: "staff",
  },
  flex_welcome: {
    name: "Yalla Flex first-day welcome (to families)",
    subject: "Welcome to Yalla Flex! See you {{when}}",
    body: "Hi {{guardian_first_name}},\n\n{{welcome_letter}}\n\nWarmly,\nTeam Yalla\n\n{{first_visit_details}}",
    essential: true,
    audience: "family",
  },
  camp_welcome: {
    name: "Camp Yalla first-day welcome (to families)",
    subject: "Welcome to Camp Yalla! See you {{when}}",
    body: "Hi {{guardian_first_name}},\n\n{{camp_letter}}\n\nWarmly,\nTeam Yalla\n\n{{camp_details}}",
    essential: true,
    audience: "family",
  },
  flex_thank_you: {
    name: "Yalla Flex first-day thank-you, with a return-visit code (to families)",
    subject: "Thank you for spending the day with us",
    body: "Hi {{guardian_first_name}},\n\nThank you for spending the day with us at Yalla! It was lovely getting to know {{child_names}}, and we hope you got to settle in and enjoy some time in the coworking space.\n\nWe’d love to have you both back for another day of work and play. As a little thank-you for joining us, use this code at checkout for 10% off your next Yalla Flex session.\n\n%% {{coupon_code}} | {{coupon_link}}\n\n{{book_link}}\n\nIf there’s anything you’d like us to know about how your first visit felt for either of you, just reply. We’d love to hear from you.\n\nWarmly,\nTeam Yalla",
    essential: false,
    audience: "family",
  },
  cohort_drop_in: {
    name: "Flex drop-in coming (to the cohort’s team)",
    subject: "Drop-in {{when}}: {{child_name}} · {{cohort}}",
    body: "Hi {{team}},\n\n{{details}}\n\nSee all upcoming drop-ins to {{cohort}}:\n{{link}}",
    essential: true,
    audience: "staff",
  },
  cohort_drop_in_cancelled: {
    name: "Flex drop-in cancelled (to the cohort’s team)",
    subject: "Change of plans: {{child_name}} won’t drop in {{when}}",
    body: "Hi {{team}},\n\n{{details}}\n\nSee all upcoming drop-ins to {{cohort}}:\n{{link}}",
    essential: true,
    audience: "staff",
  },
  staff_new_enquiry: {
    name: "New website message (to staff)",
    subject: "New {{kind}} from {{name}}",
    body: "A new {{kind}} just came in through the website.\n\n{{details}}\n\nOpen it in the Inbox: {{link}}\n\nReply to the family directly at their email address above.",
    essential: true,
    audience: "staff",
  },
  family_welcome: {
    name: "Welcome to the Family Portal (to families)",
    subject: "Welcome to Yalla, {{guardian_first_name}}!",
    body: "# Welcome to the Yalla family!\n\nHi {{guardian_first_name}},\n\nThank you for creating your Yalla Family Portal account. We’re so glad you’re here.\n\nThe Family Portal is your home base for everything Yalla. Here’s how to get started:\n\n## Getting started\n\n• **Complete your onboarding packet.** Every child must have a completed onboarding packet, submitted through the Family Portal, before their first day. You’ll find it under Forms.\n• **Keep your children’s details up to date.** Allergies, care notes and the people allowed to pick up live under Children.\n• **Book care.** Browse available days, camps and Happenings, and reserve the experiences that work for your family.\n• **Manage your Yalla Wallet and Play Pass.** See your balance, credits and plan in one place.\n• **Find helpful resources.** Parking, our illness policy and more are in the Resource Hub at the bottom of the portal.\n\n{{portal_link}}\n\n## What to expect from Yalla\n\n• A confirmation and receipt by email whenever you book or pay\n• A reminder before each of your child’s sessions\n• A note from us if anything is still needed before your child’s first day\n• A team that’s always happy to help at hello@yallaspacesd.com or 619.775.4008\n\nWe can’t wait to welcome you in person.\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  staff_family_joined: {
    name: "A family joined the portal (to staff)",
    subject: "The {{family_name}} family has joined the Yalla portal",
    body: "A new family just joined the Family Portal.\n\n{{details}}\n\n{{link}}",
    essential: true,
    audience: "staff",
  },
  tour_received: {
    name: "Tour request received (to families)",
    subject: "Thank you for your tour request",
    body: "# We can’t wait to meet you!\n\nHi {{name}},\n\nThank you for your interest in Yalla! We’ve received your tour request, and a member of our team will be reaching out soon to coordinate a time for you to visit.\n\nWe’re looking forward to showing you around, introducing you to our spaces and programs, and answering any questions you may have.\n\n## Your tour request details\n\n{{details}}\n\n## Get to know Yalla\n\nIn the meantime, feel free to explore our programs and get a better sense of what makes Yalla special.\n\n{{explore}}\n\nHave a question before your visit? You’re always welcome to connect with our team directly at hello@yallaspacesd.com.\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  application_received: {
    name: "Club Yalla application received (to families)",
    subject: "We received your Club Yalla application",
    body: "Hi {{name}},\n\nThank you for applying to Club Yalla. We’ve received your application, and someone from our team will be in touch soon about next steps.\n\nHere’s what you sent us:\n\n{{details}}\n\n{{explore}}\n\nIf anything is urgent, call us at 619.775.4008.\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  event_received: {
    name: "Event enquiry received (to families)",
    subject: "Thank you for thinking of Yalla",
    body: "Hi {{name}},\n\nThank you for thinking of Yalla{{for_occasion}}. We’ve received your event enquiry, and someone from our team will be in touch soon.\n\nHere’s what you sent us:\n\n{{details}}\n\n{{explore}}\n\nIf anything is urgent, call us at 619.775.4008.\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  enquiry_received: {
    name: "We received your message (general, to families)",
    subject: "We received your {{kind}}",
    body: "Hi {{name}},\n\nThank you for reaching out to Yalla. We’ve received your {{kind}}, and someone from our team will be in touch soon.\n\nHere’s what you sent us:\n\n{{details}}\n\nIf anything is urgent, call us at 619.775.4008.\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  late_fee: {
    name: "Late departure fee",
    subject: "A late departure fee for {{child_name}}",
    body: "Hi {{guardian_first_name}},\n\n{{child_name}} was collected {{minutes_late}} minutes after the end of their session on {{date}} (after our five-minute grace period). As set out in our policies, a late fee of {{amount}} applies and has been added to your account.\n\nYou can see and pay it in your Family Portal under Payments. Questions? Just reply to this email.\n\nTeam Yalla",
    essential: true,
    audience: "billing",
  },
  booking_cancellation: {
    name: "Booking cancellation",
    subject: "Your booking {{reference}} is cancelled",
    body: "# Your booking is cancelled\n\nHi {{guardian_first_name}},\n\nThis confirms we’ve cancelled the following booking for you.\n\n{{booking_summary}}\n\n{{refund_summary}}\n\nWe’d love to see you again soon. Find another day or experience that works for your family:\n\n{{book_link}}\n\nYou can [review our cancellation policy]({{policy_link}}) anytime.\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  forms_missing: {
    name: "Missing paperwork reminder",
    subject: "A few forms are needed for {{child_name}}",
    body: "Hi {{guardian_first_name}},\n\nBefore {{child_name}}’s next visit, please complete:\n\n{{missing_forms}}\n\nYou can complete these in the Family Portal.\n\nThank you,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  payment_receipt: {
    name: "Payment receipt",
    subject: "Your Yalla receipt: {{service}}",
    body: "Hi {{guardian_first_name}},\n\nThank you! We’ve received your payment of {{amount}} for {{service}}. Here’s everything it covers.\n\n{{receipt}}\n\nInvoice: {{invoice_number}}\nPaid: {{paid_at}}\n\n## Need to book additional offerings?\n\nYalla Flex days, camps and Happenings are added as they open, and you can book more anytime.\n\n{{book_link}}\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "billing",
  },

  payment_failed: {
    name: "Failed payment notice",
    subject: "We couldn’t process your payment for {{invoice_number}}",
    body: "Hi {{guardian_first_name}},\n\nYour payment of {{amount}} for invoice {{invoice_number}} didn’t go through ({{reason}}). Your spot is held until {{hold_until}}.\n\nPlease try again from the link in the Family Portal.\n\nTeam Yalla",
    essential: true,
    audience: "billing",
  },
  waitlist_offer: {
    name: "Waitlist offer",
    subject: "A spot is open for {{child_names}}: {{program}} on {{date}}",
    body: "Hi {{guardian_first_name}},\n\nGood news! A spot just opened for {{child_names}}, so you’ve come off the waitlist.\n\n{{booking_details}}\n\n{{waitlist_note}}\n\n{{offer_link}}\n\nNothing is charged until you check out. If this day no longer works, no need to do anything.\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  waitlist_update: {
    name: "Waitlist update: spot booked by another family",
    subject: "An update on the Yalla Flex waitlist for {{date}}",
    body: "Hi {{guardian_first_name}},\n\n{{update}}\n\n{{book_link}}\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  membership_update: {
    name: "Membership update",
    subject: "Club Yalla membership update for {{child_name}}",
    body: "Hi {{guardian_first_name}},\n\n{{membership_summary}}\n\nQuestions? Just reply to this email.\n\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  payment_request: {
    name: "Payment request",
    subject: "Payment for invoice {{invoice_number}}",
    body: "Hi {{guardian_first_name}},\n\nInvoice {{invoice_number}} has a balance of {{amount}}.\n\n{{line_items}}\n\nYou can pay securely here:\n{{payment_link}}\n\nThank you,\nTeam Yalla",
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
  family_confirm_email: {
    name: "Welcome and confirm your email (after a first booking)",
    subject: "Your Yalla Family Portal is ready",
    body: "# Welcome to Yalla!\n\nHi {{guardian_first_name}},\n\nThank you for choosing Yalla! {{purchase_summary}} (your receipt is in a separate email), and your Family Portal is ready. In it you’ll find your bookings, any forms we still need before your child’s first day, and all of our family resources.\n\nPlease confirm this is your email address. The button below confirms it and opens your portal, where you can choose a password so you can sign in anytime.\n\n{{link}}\n\nThis link works once, for 7 days. Nothing you’ve purchased depends on it. After that, you can always sign in with a link from yallaspacesd.com/portal.\n\nIf this wasn’t you, please reply to let us know.\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  booking_welcome_team: {
    name: "Booking made by the team (family new to the portal)",
    subject: "Welcome to Yalla! Your booking is confirmed",
    body: "# Welcome to the Yalla family!\n\nHi {{guardian_first_name}},\n\nTeam Yalla has confirmed your booking.\n\n{{booking_summary}}\n\nYour Family Portal is ready for you. Set up your account to see your upcoming bookings, complete the forms we need before your child’s first day, and explore our Family Handbook and family resources.\n\n{{link}}\n\nThis link is just for you and works once, for 30 days. If it expires, reply to this email and we’ll gladly send a new one.\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  booking_confirmed_team: {
    name: "Booking made by the team (family already in the portal)",
    subject: "You’re booked: {{program}} on {{date}}",
    body: "# You’re all set!\n\nHi {{guardian_first_name}},\n\nGood news: Team Yalla has booked this for you, and it’s confirmed.\n\n{{booking_summary}}\n\n{{portal_link}}\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  family_invite: {
    name: "Invitation to create a Family Portal account",
    subject: "Your invitation to the Yalla Family Portal",
    body: "# You’re invited to the Yalla Family Portal\n\nHi {{name}},\n\nWe’d love to welcome your family to Yalla. Use the button below to create your Family Portal account. You’ll add your children and choose a password, and then you’ll find booking, forms and all of our family resources in one place.\n\n{{held_note}}{{link}}\n\nThis invitation is just for you and works once, for 14 days. If it expires, reply to this email and we’ll send a new one.\n\nWarmly,\nTeam Yalla",
    essential: true,
    audience: "family",
  },
  family_sign_in: {
    name: "Family Portal sign-in link",
    subject: "Your Yalla Family Portal sign-in link",
    body: "Hi {{guardian_first_name}},\n\nUse this link within 20 minutes to sign in to the Family Portal:\n{{link}}\n\nIf you didn’t ask for this, you can ignore this email.\n\nTeam Yalla",
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

/**
 * The copy of an email kept in the message log never includes working sign-in, password-reset or
 * invitation links: anyone who can read the log (staff with communications access, or anyone with
 * database access) could otherwise use them to take over an account. Only the email itself carries them.
 */
export const REDACTED_LINK = "[private link removed]";
export function redactSecrets(text: string) {
  return text.replace(/https?:\/\/[^\s)\]]*[?&](?:token|key|k|signup|invite)=[^\s)\]]*/gi, REDACTED_LINK);
}

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
/** Membership emails: families' replies go to the membership inbox, and the team gets a copy notice. */
const MEMBERSHIP_REPLY_TO = new Set<string>(["playpass_welcome", "playpass_renewal", "playpass_payment_failed", "playpass_change", "application_received"]);
const MEMBERSHIP_TEAM_COPY: Partial<Record<string, string>> = {
  playpass_welcome: "New member",
  playpass_change: "Membership change",
  playpass_payment_failed: "Payment didn’t go through",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Addresses for membership matters: Club Yalla applications and Play Pass (Settings → Notifications). */
export async function membershipRecipients(db: Executor) {
  const raw = String(await getPolicy(db, "notifications.membershipEmails"));
  return [...new Set(raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];
}

async function replyToFor(db: Executor, key: string) {
  return MEMBERSHIP_REPLY_TO.has(key) ? (await membershipRecipients(db))[0] : undefined;
}

export async function deliver(to: string, subject: string, body: string, html?: string, replyTo?: string): Promise<{ ok: boolean; ref?: string; error?: string }> {
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN ?? "", Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ From: process.env.NOTIFICATIONS_FROM, To: to, Subject: subject, TextBody: body, ...(html ? { HtmlBody: html } : {}), ...(replyTo ? { ReplyTo: replyTo } : {}), MessageStream: "outbound" }),
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
  const replyTo = await replyToFor(db, input.key);
  let firstBody: string | null = null;
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
        body: redactSecrets(body),
        mode,
        status: mode === "test" ? "captured" : "queued",
        relatedType: input.related?.type,
        relatedId: input.related?.id,
        createdBy: input.createdBy,
      })
      .returning({ id: messages.id });
    ids.push(m.id);
    firstBody ??= body;
    if (mode === "live") {
      const r = await deliver(g.email, subject, plainText(body), emailHtml({ key: input.key, subject, body, audience: t.audience }), replyTo);
      await db
        .update(messages)
        .set({ status: r.ok ? "sent" : "failed", providerRef: r.ref, error: r.error, sentAt: r.ok ? new Date() : null })
        .where(eq(messages.id, m.id));
    }
  }
  // The membership team hears about Play Pass sign-ups, changes and failed payments as they happen.
  const event = MEMBERSHIP_TEAM_COPY[input.key];
  if (event && firstBody) {
    const [f] = await db.select({ name: families.name }).from(families).where(eq(families.id, input.familyId));
    let link = "";
    try {
      link = `${trustedBaseUrl()}/admin/families/${input.familyId}`;
    } catch {}
    const familyName = (f?.name ?? "").replace(/ family$/i, "") || "A";
    const { teamRecipients } = await import("@/lib/ops/team-notices");
    for (const to of await teamRecipients(db, "playpass"))
      await notifyStaff(db, { key: "staff_membership_update", to, vars: { event, family_name: familyName, details: redactSecrets(firstBody.replace(/^# .*$/m, "").trim()), link }, relatedId: input.familyId }).catch((e) =>
        console.error("[membership notice failed]", (e as Error).message?.slice(0, 120)),
      );
  }
  return ids;
}

export async function notifyStaff(db: Executor, input: { key: TemplateKey; to: string; vars: Record<string, string>; relatedId?: string; relatedType?: string; replyTo?: string }) {
  const t = await templateFor(db, input.key);
  const subject = render(t.subject, input.vars);
  const body = render(t.body, input.vars);
  const mode = notificationsMode();
  const [m] = await db
    .insert(messages)
    .values({ templateKey: input.key, toAddress: input.to, subject, body: redactSecrets(body), mode, status: mode === "test" ? "captured" : "queued", relatedType: input.relatedType ?? "staff", relatedId: input.relatedId })
    .returning({ id: messages.id });
  if (mode === "live") {
    const r = await deliver(input.to, subject, plainText(body), emailHtml({ key: input.key, subject, body, audience: t.audience }), input.replyTo ?? (await replyToFor(db, input.key)));
    await db.update(messages).set({ status: r.ok ? "sent" : "failed", providerRef: r.ref, error: r.error, sentAt: r.ok ? new Date() : null }).where(eq(messages.id, m.id));
  }
  return { id: m.id, mode, body: redactSecrets(body) };
}

/** Variables each template can use, with sample values for previews. */
export const TEMPLATE_VARIABLES: Record<TemplateKey, string[]> = {
  booking_confirmation: ["guardian_first_name", "reference", "program", "date", "booking_summary", "booking_details", "location", "arrival_instructions", "portal_link"],
  booking_reminder: ["guardian_first_name", "reference", "program", "date", "booking_details", "arrival_instructions", "upgrade_note"],
  booking_change: ["guardian_first_name", "reference", "change_summary", "booking_details"],
  booking_cancellation: ["guardian_first_name", "reference", "booking_summary", "refund_summary", "book_link", "policy_link", "booking_details", "refund_note"],
  forms_missing: ["guardian_first_name", "child_name", "missing_forms"],
  payment_receipt: ["guardian_first_name", "service", "invoice_number", "amount", "paid_at", "receipt", "line_items", "balance", "book_link"],
  payment_failed: ["guardian_first_name", "invoice_number", "amount", "reason", "hold_until"],
  payment_request: ["guardian_first_name", "invoice_number", "amount", "line_items", "payment_link"],
  waitlist_offer: ["guardian_first_name", "program", "date", "child_names", "booking_details", "waitlist_note", "offer_expires", "offer_link"],
  waitlist_update: ["guardian_first_name", "date", "update", "book_link"],
  membership_update: ["guardian_first_name", "child_name", "membership_summary"],
  staff_password_reset: ["name", "link"],
  staff_invite: ["name", "invited_by", "role", "link"],
  family_sign_in: ["guardian_first_name", "link"],
  family_confirm_email: ["guardian_first_name", "purchase_summary", "link"],
  family_invite: ["name", "link", "held_note"],
  booking_welcome_team: ["guardian_first_name", "reference", "program", "date", "booking_summary", "booking_details", "location", "arrival_instructions", "link"],
  booking_confirmed_team: ["guardian_first_name", "reference", "program", "date", "booking_summary", "booking_details", "location", "arrival_instructions", "portal_link"],
  space_confirmation: ["guardian_first_name", "reference", "workspace", "when", "amount"],
  playpass_welcome: ["guardian_first_name", "plan", "amount", "added", "balance", "monthly_price", "monthly_allocation", "next_renewal"],
  playpass_renewal: ["guardian_first_name", "plan", "amount", "added", "balance", "next_renewal"],
  playpass_payment_failed: ["guardian_first_name", "amount", "reason"],
  playpass_change: ["guardian_first_name", "change_summary"],
  staff_membership_update: ["event", "family_name", "details", "link"],
  yalla_cancellation: ["guardian_first_name", "booking_details", "reason", "amount", "credit_amount", "bonus_percent"],
  late_fee: ["guardian_first_name", "child_name", "minutes_late", "date", "amount"],
  staff_new_enquiry: ["kind", "kind_label", "name", "details", "link"],
  enquiry_received: ["name", "kind", "details"],
  tour_received: ["name", "details", "interests", "explore"],
  family_welcome: ["guardian_first_name", "portal_link"],
  staff_family_joined: ["family_name", "details", "link"],
  staff_new_booking: ["summary", "details", "reference", "link"],
  staff_booking_cancelled: ["summary", "details", "reference", "link"],
  flex_welcome: ["guardian_first_name", "when", "welcome_letter", "first_visit_details"],
  camp_welcome: ["guardian_first_name", "when", "camp_letter", "camp_details"],
  flex_thank_you: ["guardian_first_name", "child_names", "coupon_code", "coupon_link", "book_link"],
  cohort_drop_in: ["team", "cohort", "child_name", "when", "details", "link"],
  cohort_drop_in_cancelled: ["team", "cohort", "child_name", "when", "details", "link"],
  application_received: ["name", "details", "explore"],
  event_received: ["name", "details", "occasion", "for_occasion", "preferred_date", "explore"],
};

const SAMPLE_CAMPER: CampChild = { childId: "sample", name: "Ava", group: CAMP_GROUPS[1], arrives: "9:00am", pickup: "3:00pm" };
const SAMPLE_CHILD: WelcomeChild = { childId: "sample", name: "Ava", cohort: FLEX_GROUPS[3], half: false, arrives: "8:30am", pickup: "4:30pm" };

export const SAMPLE_VARIABLES: Record<string, string> = {
  booking_summary: ">> Camp Yalla · 4 – 6 years\nWednesday, November 25, 2026 · 9:00am–3:00pm\n\nWho’s coming: Robin Sample\nExtras: Early Bird (8:00 – 9:00am)\n\nTotal: $180.00\nPaid by card: $180.00\n\nWhere: Yalla Bankers Hill\nReference: YL-SAMPLE",
  refund_summary: "!! $180.00 | has been returned to your Yalla Wallet. Use it toward any Yalla booking within 24 months.",
  book_link: "https://www.yallaspacesd.com/book",
  policy_link: "https://www.yallaspacesd.com/policies#cancellation-refund",
  purchase_summary: "Your booking is confirmed",
  plan: "Gather",
  interests: "Club Yalla, Yalla Flex",
  family_name: "Smith",
  portal_link: "https://www.yallaspacesd.com/portal/home",
  occasion: "Birthday party",
  for_occasion: " for your birthday party",
  preferred_date: "Sat 12 Dec",
  explore: "• [A Day at Club Yalla](https://www.yallaspacesd.com/club-yalla)\n• [Yalla Flex](https://www.yallaspacesd.com/programs/yalla-flex)",
  details: "Name: Jordan Rivera\nEmail: jordan@example.com\nPhone: 619 555 0100\nChild’s age: 14 months",
  added: "$200",
  monthly_price: "$180",
  monthly_allocation: "$200",
  next_renewal: "Tuesday 1 December",
  guardian_first_name: "Jordan",
  name: "Sam Staff",
  reference: "YL-SAMPLE",
  program: "Yalla Flex",
  date: "Mon 2 Nov 2026",
  booking_details: "• Yalla Flex · Mon 2 Nov 8:30am–4:30pm · Ava",
  location: "Yalla Bankers Hill",
  arrival_instructions: "When you arrive, please check in at the kiosk in our lobby.",
  change_summary: "Moved to Tue 3 Nov.",
  refund_note: "If a refund or credit applies, we’ll confirm it separately.",
  child_name: "Ava",
  child_names: "Ava",
  coupon_code: "BACKTOPLAY10",
  waitlist_note: "~~ There is currently more than one family on the waitlist for this spot. You have 15 minutes to check out before the next family is given the opportunity to book it.",
  update: "The Yalla Flex spot for Ava on Wednesday, November 25 was booked by another family on the waitlist, so we’ve placed you back on the waitlist for that day. If another spot opens, we’ll email you right away.",
  coupon_link: "https://www.yallaspacesd.com/coupon/BACKTOPLAY10",
  welcome_letter: welcomeLetter([SAMPLE_CHILD]),
  first_visit_details: firstVisitDetails([SAMPLE_CHILD], "https://www.yallaspacesd.com"),
  camp_letter: campWelcomeLetter([SAMPLE_CAMPER], "tomorrow"),
  camp_details: campDayDetails([SAMPLE_CAMPER], "https://www.yallaspacesd.com", { when: "tomorrow", date: "2026-11-25", code: "4817" }),
  upgrade_note: "## Make the most of tomorrow\n\nNeed a private space? Private offices and desks to rent, and complimentary time in our phone booth. [See what’s available](https://www.yallaspacesd.com/portal/spaces)\n\nBringing a second grown-up, or want to add extras? [Add them in your Family Portal](https://www.yallaspacesd.com/portal/home)",
  team: "Wildflower team",
  cohort: "Wildflowers",
  when: "tomorrow",
  missing_forms: "• Health & immunization record",
  invoice_number: "INV-1001-AB",
  amount: "$150.00",
  paid_at: "Mon 2 Nov 2026, 9:00am",
  line_items: "Yalla Flex · Mon 2 Nov",
  service: "Camp Yalla · Wed, Nov 25",
  receipt: "$$ Camp Yalla · Wed 25 Nov 9:00am–3:00pm · Robin | $160.00\n$$ Early Bird (8:00 – 9:00am) · Camp Yalla · Wed 25 Nov · Robin | $20.00\n$$ Camp Yalla · Wed 25 Nov 9:00am–3:00pm · Sam | $160.00\n$$= Subtotal | $340.00\n$$- Sibling discount (10%) · Sam | −$16.00\n$$- Coupon CLUBYALLAFAM (50% off) | −$162.00\n$$= Total | $162.00\n$$- Paid by card | −$162.00\n$$= Remaining balance | $0.00",
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
