"use server";

import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { setEnquiryStatus } from "@/lib/ops/enquiries";

export const enquiryStatusAction = adminAction("families.view", async ({ db, actor, str }) => {
  const status = str("status");
  if (!["new", "handled", "archived"].includes(status)) throw new OpsError("invalid", "Choose a status.");
  await setEnquiryStatus(db, actor, { id: str("id"), status: status as "new" | "handled" | "archived", note: str("note") });
  return status === "handled" ? "Marked as handled." : status === "archived" ? "Archived." : "Moved back to New.";
});
