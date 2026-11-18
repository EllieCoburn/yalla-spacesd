"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAction } from "@/lib/admin/action";
import { KIOSK_COOKIE, endKioskSessions, startKioskSession } from "@/lib/ops/checkin";
import { audit } from "@/lib/audit";

/** Opens the check-in screen on this device until midnight, then takes it there. */
export const startKioskAction = adminAction("attendance.manage", async ({ db, actor }) => {
  const { token, expiresAt } = await startKioskSession(db, actor);
  (await cookies()).set(KIOSK_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/kiosk", expires: expiresAt });
  await audit(db, actor, { action: "kiosk.start", entityType: "kiosk", entityId: "lobby", summary: "Opened the lobby check-in kiosk" });
  redirect("/kiosk");
});

export const endKioskAction = adminAction("attendance.manage", async ({ db, actor }) => {
  const n = await endKioskSessions(db);
  await audit(db, actor, { action: "kiosk.end", entityType: "kiosk", entityId: "lobby", summary: `Ended ${n} kiosk session(s)` });
  return n ? "The check-in screen is closed on every device." : "No check-in screen was open.";
});
