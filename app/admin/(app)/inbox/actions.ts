"use server";

import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { headers } from "next/headers";
import { setEnquiryStatus } from "@/lib/ops/enquiries";
import { inviteToPortal } from "@/lib/family-auth";
import { trustedBaseUrl } from "@/lib/base-url";
import { enquiries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const enquiryStatusAction = adminAction("families.view", async ({ db, actor, str }) => {
  const status = str("status");
  if (!["new", "handled", "archived"].includes(status)) throw new OpsError("invalid", "Choose a status.");
  await setEnquiryStatus(db, actor, { id: str("id"), status: status as "new" | "handled" | "archived", note: str("note") });
  return status === "handled" ? "Marked as handled." : status === "archived" ? "Archived." : "Moved back to New.";
});

/** Waitlist sign-ups: send the waitlist email (welcome + Family Portal setup for a family new to Yalla). */
export const waitlistWelcomeAction = adminAction("families.manage", async ({ db, str }) => {
  const [e] = await db.select().from(enquiries).where(eq(enquiries.id, str("id")));
  if (!e?.familyId) throw new OpsError("not_found", "This sign-up isn’t linked to a family.");
  const { sendWaitlistWelcome } = await import("@/lib/ops/public-booking");
  const r = await sendWaitlistWelcome(db, { familyId: e.familyId, baseUrl: trustedBaseUrl((await headers()).get("host")) });
  return r.welcome
    ? `Waitlist welcome sent to ${r.email}, with their spot and a link to set up their Family Portal account (works once, for 30 days).`
    : `Waitlist email sent to ${r.email}. They already have a Family Portal account, so it’s the short “you’re on the waitlist” note.`;
});

/** Send this person an invitation to create a Family Portal account (staff decide when). */
export const inviteFromEnquiryAction = adminAction("families.manage", async ({ db, actor, str }) => {
  const [e] = await db.select().from(enquiries).where(eq(enquiries.id, str("id")));
  if (!e) throw new OpsError("not_found", "Message not found.");
  const r = await inviteToPortal(db, actor, { email: e.email, name: e.name, enquiryId: e.id }, trustedBaseUrl((await headers()).get("host")));
  return `Invitation sent to ${r.email}. It works once, for 14 days.${r.devLink ? ` (Test mode link: ${r.devLink})` : ""}`;
});
