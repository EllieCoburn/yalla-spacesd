"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { expireOffers, joinWaitlist, makeOffer, removeEntry } from "@/lib/ops/waitlist";
import { fmtDateTime } from "@/lib/time";

async function baseUrl() {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const offerAction = adminAction("waitlist.manage", async ({ db, actor, str, num }) => {
  const hours = num("windowHours");
  if (hours != null && (!Number.isInteger(hours) || hours < 1 || hours > 168)) throw new OpsError("invalid", "The acceptance window must be 1–168 hours.");
  const booking = await makeOffer(db, actor, { entryId: str("entryId"), windowHours: hours ?? undefined, baseUrl: await baseUrl() });
  // The row's form disappears once the entry is offered, so confirm on the page itself.
  redirect(`/admin/waitlist?offered=${encodeURIComponent(booking.reference)}&until=${encodeURIComponent(fmtDateTime(booking.holdExpiresAt!))}`);
});

export const removeAction = adminAction("waitlist.manage", async ({ db, actor, str }) => {
  const status = str("status") === "declined" ? "declined" : "removed";
  await removeEntry(db, actor, str("entryId"), status, str("note") || undefined);
  return status === "declined" ? "Marked as declined. Any held offer was released." : "Removed from the waitlist. Any held offer was released.";
});

export const joinAction = adminAction("waitlist.manage", async ({ db, actor, str, all }) => {
  const childIds = all("childIds").filter(Boolean);
  if (!str("familyId")) throw new OpsError("invalid", "Choose a family.");
  if (!str("sessionId")) throw new OpsError("invalid", "Choose a session.");
  await joinWaitlist(db, actor, { familyId: str("familyId"), sessionId: str("sessionId"), childIds, notes: str("notes") || undefined });
  return "Added to the waitlist.";
});

export const expireAction = adminAction("waitlist.manage", async ({ db }) => {
  const lapsed = await expireOffers(db);
  return lapsed.length ? `${lapsed.length} lapsed offer(s) marked expired; their spots are available again.` : "No lapsed offers.";
});
