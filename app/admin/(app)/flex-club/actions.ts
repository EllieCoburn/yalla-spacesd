"use server";

import { adminAction } from "@/lib/admin/action";
import { addOpsRequest, removeOpsRequest, setOpsStatus, type OpsKind } from "@/lib/ops/ops-requests";

const kindOf = (v: string): OpsKind => (v === "maintenance" ? "maintenance" : "supply");

export const addOpsAction = adminAction("ops.lists", async ({ db, actor, str }) => {
  const kind = kindOf(str("kind"));
  await addOpsRequest(db, actor, { kind, title: str("title"), quantity: str("quantity"), location: str("location"), notes: str("notes"), urgency: str("urgency") });
  return kind === "supply" ? "Added to supplies." : "Added to maintenance.";
});

export const opsStatusAction = adminAction("ops.lists", async ({ db, actor, str }) => {
  await setOpsStatus(db, actor, str("id"), str("status"));
});

export const removeOpsAction = adminAction("ops.lists", async ({ db, actor, str }) => {
  await removeOpsRequest(db, actor, str("id"));
});
