/**
 * Messages from the public website (tour requests, Club Yalla applications, event enquiries and
 * waitlist sign-ups). Each is saved to Admin → Inbox first, then emailed to the addresses in
 * Settings → Notifications, and the family gets a short note saying it arrived. Saving never
 * depends on email working.
 */
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB, Executor } from "@/lib/db";
import { enquiries } from "@/lib/db/schema";
import { notifyStaff } from "@/lib/notify";
import { getPolicy } from "./settings";

export const ENQUIRY_KINDS = {
  tour: { label: "Tour request", plural: "Tour requests", staffNoun: "tour request", familyNoun: "tour request" },
  application: { label: "Club Yalla application", plural: "Club Yalla applications", staffNoun: "Club Yalla application", familyNoun: "Club Yalla application" },
  event: { label: "Event enquiry", plural: "Event enquiries", staffNoun: "event enquiry", familyNoun: "event enquiry" },
  waitlist: { label: "Waitlist sign-up", plural: "Waitlist sign-ups", staffNoun: "waitlist sign-up", familyNoun: "waitlist request" },
} as const;
export type EnquiryKind = keyof typeof ENQUIRY_KINDS;

/** Each website pathway gets its own confirmation email (editable in Admin → Communications). */
const FAMILY_TEMPLATE: Partial<Record<EnquiryKind, "tour_received" | "application_received" | "event_received">> = {
  tour: "tour_received",
  application: "application_received",
  event: "event_received",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Addresses that receive new website messages (Settings → Notifications). */
export async function staffRecipients(db: Executor) {
  const raw = String(await getPolicy(db, "notifications.staffEmails"));
  return [...new Set(raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
}

export async function submitEnquiry(
  db: DB,
  input: { kind: EnquiryKind; name: string; email: string; phone?: string; details: { label: string; value: string }[]; familyId?: string | null; ip?: string | null; baseUrl: string; confirmToFamily?: boolean; vars?: Record<string, string> },
) {
  const name = input.name.trim().slice(0, 200);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!name) throw new OpsError("invalid", "Please add your name.");
  if (!EMAIL.test(email)) throw new OpsError("invalid", "Please check your email address.");
  const details = input.details
    .map((d) => ({ label: d.label.slice(0, 120), value: String(d.value ?? "").trim().slice(0, 4000) }))
    .filter((d) => d.value);

  // A gentle limit on repeat submissions from the same person or connection.
  const since = new Date(Date.now() - 3600_000);
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enquiries)
    .where(and(gte(enquiries.createdAt, since), input.ip ? or(eq(enquiries.email, email), eq(enquiries.ip, input.ip)) : eq(enquiries.email, email)));
  if (recent.n >= 8) throw new OpsError("throttled", "We’ve received several messages from you in the last hour. We’ll be in touch soon, or call us at 619.775.4008.");

  const [e] = await db
    .insert(enquiries)
    .values({ kind: input.kind, name, email, phone: input.phone?.trim().slice(0, 40) || null, details, familyId: input.familyId ?? null, ip: input.ip ?? null })
    .returning();

  const kind = ENQUIRY_KINDS[input.kind];
  const summary = [`Name: ${name}`, `Email: ${email}`, e.phone ? `Phone: ${e.phone}` : null, ...details.map((d) => `${d.label}: ${d.value}`)].filter(Boolean).join("\n");
  // Email problems are recorded in Admin → Messages; the message itself is already saved.
  for (const to of await staffRecipients(db)) {
    await notifyStaff(db, { key: "staff_new_enquiry", to, vars: { kind: kind.staffNoun, kind_label: kind.label, name, details: summary, link: `${input.baseUrl}/admin/inbox?open=${e.id}` }, relatedId: e.id }).catch((err) =>
      console.error("[enquiry email failed]", (err as Error).message?.slice(0, 120)),
    );
  }
  if (input.confirmToFamily !== false)
    await notifyStaff(db, { key: FAMILY_TEMPLATE[input.kind] ?? "enquiry_received", to: email, vars: { name: name.split(" ")[0], kind: kind.familyNoun, details: summary, ...input.vars }, relatedId: e.id }).catch(() => undefined);
  return e;
}

export async function inboxList(db: Executor, opts: { status?: string; kind?: string } = {}) {
  const status = opts.status === "handled" ? ["handled"] : opts.status === "archived" ? ["archived"] : opts.status === "all" ? ["new", "handled", "archived"] : ["new"];
  return db
    .select()
    .from(enquiries)
    .where(and(inArray(enquiries.status, status), opts.kind && opts.kind in ENQUIRY_KINDS ? eq(enquiries.kind, opts.kind) : undefined))
    .orderBy(desc(enquiries.createdAt))
    .limit(200);
}

export async function newEnquiryCount(db: Executor) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(enquiries).where(eq(enquiries.status, "new"));
  return r?.n ?? 0;
}

export async function setEnquiryStatus(db: Executor, actor: Actor, input: { id: string; status: "new" | "handled" | "archived"; note?: string }) {
  const [e] = await db
    .update(enquiries)
    .set({ status: input.status, note: input.note?.trim() || undefined, handledBy: input.status === "new" ? null : actor.name, handledAt: input.status === "new" ? null : new Date() })
    .where(eq(enquiries.id, input.id))
    .returning();
  if (!e) throw new OpsError("not_found", "Message not found.");
  await audit(db, actor, { action: "inbox.status", entityType: "enquiry", entityId: e.id, summary: `${ENQUIRY_KINDS[e.kind as EnquiryKind]?.label ?? e.kind} from ${e.name} marked ${input.status}` });
  return e;
}
