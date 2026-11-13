"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { adminAction } from "@/lib/admin/action";
import { audit, OpsError } from "@/lib/audit";
import { DEFAULT_FAQS, FAQ_CATEGORIES, FAQ_PAGES, type FaqStatus } from "@/content/faq";
import { policyById } from "@/content/policies";
import { faqEntries } from "@/lib/db/schema";
import { allFaqs } from "@/lib/faq";

const STATUSES: FaqStatus[] = ["published", "draft", "archived"];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/** Every page that shows FAQs picks up a change at once. */
const refreshSite = () => revalidatePath("/", "layout");

/** Saves a question (new or edited). Saving a starting entry stores the edited copy in its place. */
export const saveFaqAction = adminAction("content.manage", async ({ db, actor, str, num, all }) => {
  const isNew = !str("id");
  const question = str("question");
  if (!question) throw new OpsError("invalid", "Add the question.");
  const category = str("category");
  if (!FAQ_CATEGORIES.some((c) => c.key === category)) throw new OpsError("invalid", "Choose a category.");
  const status = str("status") as FaqStatus;
  if (!STATUSES.includes(status)) throw new OpsError("invalid", "Choose whether it’s published.");
  const existing = (await allFaqs()).find((f) => f.id === str("id"));
  const policy = existing?.policy && policyById(existing.policy) ? existing.policy : null;
  const answer = str("answer");
  if (status === "published" && !policy && !answer) throw new OpsError("invalid", "Add an answer before publishing, or save it as a draft.");
  const pages: Record<string, number> = {};
  for (const p of FAQ_PAGES) {
    const v = num(`page_${p.key}`);
    if (v != null && Number.isFinite(v)) pages[p.key] = v;
  }
  let id = str("id");
  if (isNew) {
    const taken = new Set((await allFaqs()).map((f) => f.id));
    const base = slug(question) || "question";
    id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  }
  const row = {
    question,
    answer: policy ? "" : answer,
    policy,
    category,
    alsoIn: all("alsoIn").filter((c) => c !== category && FAQ_CATEGORIES.some((x) => x.key === c)),
    pages,
    sortOrder: num("order") ?? existing?.order ?? 999,
    status,
    needs: str("needs") || null,
    updatedBy: actor.name,
  };
  await db
    .insert(faqEntries)
    .values({ id, ...row })
    .onConflictDoUpdate({ target: faqEntries.id, set: { ...row, updatedAt: new Date() } });
  await audit(db, actor, { action: isNew ? "faq.create" : "faq.update", entityType: "faq", entityId: id, summary: `${isNew ? "Added" : "Saved"} FAQ “${question}” (${status})` });
  refreshSite();
  if (isNew) redirect(`/admin/faqs/${id}?saved=1`);
  return status === "published" ? "Saved and live everywhere it appears." : status === "draft" ? "Saved as a draft. It isn’t shown on the site." : "Archived. It isn’t shown on the site.";
});

/** Undo staff edits to a starting entry, going back to its original wording. */
export const resetFaqAction = adminAction("content.manage", async ({ db, actor, str }) => {
  const id = str("id");
  if (!DEFAULT_FAQS.some((f) => f.id === id)) throw new OpsError("invalid", "Only original questions can be reset. Archive this one instead.");
  await db.delete(faqEntries).where(eq(faqEntries.id, id));
  await audit(db, actor, { action: "faq.reset", entityType: "faq", entityId: id, summary: `Reset FAQ “${id}” to its original wording` });
  refreshSite();
  return "Back to the original wording.";
});
