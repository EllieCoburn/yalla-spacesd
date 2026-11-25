"use server";

import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { trustedBaseUrl } from "@/lib/base-url";
import { addEntry, endNap, removeEntry, setSessionTeam, type NewEntry } from "@/lib/ops/day-feed";

/** Everything here is checked again in lib/ops/day-feed.ts: the person's session, the child and the 6pm–11:59pm window. */
export const addFeedEntryAction = adminAction(null, async ({ db, staff, str, form }) => {
  const kind = str("kind");
  let entry: NewEntry;
  if (kind === "photo") {
    const file = form.get("photo");
    if (!(file instanceof File) || !file.size) throw new OpsError("invalid", "Choose a photo.");
    entry = { kind, photo: Buffer.from(await file.arrayBuffer()), caption: str("caption"), time: str("time") };
  } else if (kind === "food") entry = { kind, meal: str("meal"), amount: str("amount") || null, items: str("items"), note: str("note"), time: str("time") };
  else if (kind === "nap") entry = { kind, start: str("start"), end: str("end") || null, note: str("note") };
  else if (kind === "potty") entry = { kind, type: str("type"), result: str("result"), note: str("note"), time: str("time") };
  else if (kind === "message") entry = { kind, body: str("body") };
  else throw new OpsError("invalid", "Choose what to add.");
  let baseUrl = "";
  try {
    baseUrl = trustedBaseUrl();
  } catch {}
  const saved = await addEntry(db, staff, { sessionId: str("sessionId"), childId: str("childId"), entry, baseUrl });
  return kind === "message" ? "Sent. The family gets an email and sees it on their Family Portal." : saved.kind === "photo" ? "Photo added." : "Added.";
});

export const endNapAction = adminAction(null, async ({ db, staff, str }) => {
  await endNap(db, staff, str("entryId"), str("time") || null);
  return "Nap ended.";
});

export const removeFeedEntryAction = adminAction(null, async ({ db, staff, str }) => {
  await removeEntry(db, staff, str("entryId"));
  return "Removed from the feed.";
});

export const setSessionTeamAction = adminAction("feed.manage", async ({ db, actor, str, all }) => {
  const n = await setSessionTeam(db, actor, str("sessionId"), all("staffId"));
  return n ? `Team saved. They can open these children’s profiles from 6pm the evening before.` : "Team cleared.";
});
