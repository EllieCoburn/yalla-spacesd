"use server";

import { eq } from "drizzle-orm";
import { adminAction } from "@/lib/admin/action";
import { audit, OpsError } from "@/lib/audit";
import { sessions } from "@/lib/db/schema";

/** One session's Play Pass setting: follow its program, or accept / refuse on its own. */
export const sessionPlayPassAction = adminAction("playpass.manage", async ({ db, actor, str }) => {
  const mode = str("mode");
  const value = mode === "yes" ? true : mode === "no" ? false : null;
  const [s] = await db.update(sessions).set({ playPassEligible: value, updatedAt: new Date() }).where(eq(sessions.id, str("sessionId"))).returning();
  if (!s) throw new OpsError("not_found", "Session not found.");
  await audit(db, actor, { action: "playpass.eligibility", entityType: "session", entityId: s.id, summary: `Play Pass for ${s.localDate} session: ${value == null ? "follows the program" : value ? "accepted" : "not accepted"}` });
  return "Saved.";
});
