import "server-only";
import { DEFAULT_FAQS, FAQ_CATEGORIES, type Faq, type FaqCategory, type FaqPage, type FaqStatus } from "@/content/faq";
import { getDb, isDbConfigured } from "@/lib/db";
import { faqEntries } from "@/lib/db/schema";

/**
 * Every FAQ: the starting entries in content/faq.ts with staff edits (faq_entries) laid over them by
 * id. If the database isn't reachable the site still shows the starting entries.
 */
export async function allFaqs(): Promise<(Faq & { edited: boolean; custom: boolean })[]> {
  const byId = new Map(DEFAULT_FAQS.map((f) => [f.id, { ...f, edited: false, custom: false }]));
  if (isDbConfigured()) {
    try {
      const rows = await getDb().select().from(faqEntries);
      for (const r of rows) {
        byId.set(r.id, {
          id: r.id,
          question: r.question,
          answer: r.answer,
          policy: r.policy ?? undefined,
          category: r.category as FaqCategory,
          alsoIn: r.alsoIn as FaqCategory[],
          pages: r.pages as Faq["pages"],
          order: r.sortOrder,
          status: r.status as FaqStatus,
          needs: r.needs ?? undefined,
          edited: true,
          custom: !DEFAULT_FAQS.some((d) => d.id === r.id),
        });
      }
    } catch (e) {
      console.error("[faq] Couldn't load saved FAQ edits; showing the defaults.", (e as Error).message?.slice(0, 120));
    }
  }
  return [...byId.values()];
}

const published = (list: Faq[]) => list.filter((f) => f.status === "published");

/** Published FAQs grouped by FAQ-page category, in order. */
export async function faqsByCategory() {
  const list = published(await allFaqs());
  return FAQ_CATEGORIES.map((c) => ({
    ...c,
    items: list.filter((f) => f.category === c.key || f.alsoIn?.includes(c.key)).sort((a, b) => (a.category === c.key ? a.order : 1000 + a.order) - (b.category === c.key ? b.order : 1000 + b.order)),
  }));
}

/** Published FAQs chosen for a page, in that page's order. */
export async function faqsForPage(page: FaqPage, limit = 6) {
  return published(await allFaqs())
    .filter((f) => f.pages?.[page] != null)
    .sort((a, b) => a.pages![page]! - b.pages![page]!)
    .slice(0, limit);
}
