"use server";

import { redirect } from "next/navigation";
import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { requestMeta } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { markAbsent, undoAttendance } from "@/lib/ops/attendance";
import {
  addBookingNote,
  addChildToBooking,
  cancelBooking,
  confirmAdminBooking,
  createHold,
  decideRequest,
  moveItem,
  previewMove,
  resendConfirmation,
  startCheckout,
  type ItemRequest,
} from "@/lib/ops/bookings";
import { fmtDate } from "@/lib/time";

async function baseUrl() {
  const meta = await requestMeta();
  const proto = meta.host?.startsWith("localhost") || meta.host?.startsWith("127.") ? "http" : "https";
  return process.env.PUBLIC_BASE_URL ?? `${proto}://${meta.host}`;
}

export const createBookingAction = adminAction("bookings.manage", async ({ db, actor, staff, str, all, bool }) => {
  const familyId = str("familyId");
  const childIds = all("childIds").filter(Boolean);
  const sessionIds = all("sessionIds").filter(Boolean);
  const mode = str("mode") || "invoice";
  if (!familyId) throw new OpsError("invalid", "Choose a family.");
  if (!sessionIds.length) throw new OpsError("invalid", "Choose at least one session.");
  const items: ItemRequest[] = sessionIds.flatMap((sessionId): ItemRequest[] => (childIds.length ? childIds.map((childId) => ({ sessionId, childId })) : [{ sessionId, childId: null }]));
  const wantsOverride = bool("override");
  if (wantsOverride && !can(staff, "capacity.override")) throw new OpsError("forbidden", "You don’t have permission to override capacity.");
  const hold = await createHold(db, actor, {
    familyId,
    items,
    source: "admin",
    override: wantsOverride ? { reason: str("overrideReason") } : null,
    acknowledgePaperwork: bool("ackPaperwork"),
  });
  if (mode === "link") {
    await startCheckout(db, actor, hold.booking.id, { base: await baseUrl() });
  } else {
    await confirmAdminBooking(db, actor, hold.booking.id, { createInvoice: mode === "invoice", notify: bool("notify") });
  }
  redirect(`/admin/bookings/${hold.booking.id}?created=1`);
});

export const previewMoveAction = adminAction("bookings.manage", async ({ db, str }) => {
  const p = await previewMove(db, str("itemId"), str("targetSessionId"));
  return {
    data: {
      targetSessionId: p.target.id,
      label: `${p.program.name} · ${fmtDate(p.target.localDate)}`,
      remaining: p.remaining,
      problems: p.problems.map((x) => x.message),
      current: p.currentPriceCents,
      next: p.newPriceCents,
      difference: p.differenceCents,
      note: p.financialNote,
    },
  };
});

export const moveAction = adminAction("bookings.manage", async ({ db, actor, str, bool }) => {
  const res = await moveItem(db, actor, { itemId: str("itemId"), targetSessionId: str("targetSessionId"), notify: bool("notify") });
  redirect(`/admin/bookings/${res.booking.id}?done=moved`);
});

export const cancelAction = adminAction("bookings.manage", async ({ db, actor, str, all, bool }) => {
  const itemIds = all("itemIds").filter(Boolean);
  await cancelBooking(db, actor, { bookingId: str("bookingId"), itemIds: itemIds.length ? itemIds : undefined, reason: str("reason"), notify: bool("notify") });
  redirect(`/admin/bookings/${str("bookingId")}?done=cancelled`);
});

export const addChildAction = adminAction("bookings.manage", async ({ db, actor, staff, str, bool }) => {
  const override = bool("override");
  if (override && !can(staff, "capacity.override")) throw new OpsError("forbidden", "You don’t have permission to override capacity.");
  await addChildToBooking(db, actor, { bookingId: str("bookingId"), sessionId: str("sessionId"), childId: str("childId"), override: override ? { reason: str("overrideReason") } : null });
  redirect(`/admin/bookings/${str("bookingId")}?done=child_added`);
});

export const absenceAction = adminAction("bookings.manage", async ({ db, actor, str }) => {
  await markAbsent(db, actor, { sessionId: str("sessionId"), childId: str("childId"), note: str("note") || undefined });
  return "Absence recorded. The booking and its payment are unchanged.";
});

export const undoAbsenceAction = adminAction("bookings.manage", async ({ db, actor, str }) => {
  await undoAttendance(db, actor, { sessionId: str("sessionId"), childId: str("childId") });
  return "Attendance reset to expected.";
});

export const resendAction = adminAction("bookings.manage", async ({ db, actor, str }) => {
  await resendConfirmation(db, actor, str("bookingId"));
  return "Confirmation queued. In test mode it’s captured in Messages, not emailed.";
});

export const noteAction = adminAction("bookings.manage", async ({ db, actor, str }) => {
  await addBookingNote(db, actor, str("bookingId"), str("body"));
  return "Note added.";
});

export const decideAction = adminAction("bookings.manage", async ({ db, actor, str }) => {
  const approve = str("decision") === "approve";
  await decideRequest(db, actor, str("bookingId"), approve, str("note") || undefined);
  return approve ? "Approved. The family can now complete payment; send them a payment link." : "Declined and cancelled.";
});

export const paymentLinkAction = adminAction("bookings.manage", async ({ db, actor, str }) => {
  const res = await startCheckout(db, actor, str("bookingId"), { base: await baseUrl() });
  return res.free ? "Nothing was due, so the booking is confirmed." : `Payment link ready: ${res.url}`;
});

export const confirmNowAction = adminAction("bookings.manage", async ({ db, actor, str, bool }) => {
  const res = await confirmAdminBooking(db, actor, str("bookingId"), { createInvoice: bool("invoice"), notify: bool("notify") });
  if (res.status === "needs_attention") throw new OpsError("capacity", "The spots are no longer available. Move the booking or authorize an override.");
  return `Booking ${res.status === "confirmed" ? "confirmed" : res.status}.${bool("invoice") ? ` An invoice was created for the amount due.` : ""}`;
});

