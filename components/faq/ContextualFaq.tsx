import Link from "next/link";
import { FAQ_PAGES, type FaqPage } from "@/content/faq";
import { faqsForPage } from "@/lib/faq";
import { FaqAccordion } from "./FaqAccordion";
import { FaqAnswer } from "./FaqAnswer";

/** "A few good questions." The FAQs chosen for a page, from the same entries as the FAQ page. */
export async function ContextualFaq({ page, limit = 6, className = "py-20 lg:py-28", bare = false }: { page: FaqPage; limit?: number; className?: string; bare?: boolean }) {
  const items = await faqsForPage(page, limit);
  if (!items.length) return null;
  const category = FAQ_PAGES.find((p) => p.key === page)!.category;
  const accordion = <FaqAccordion size={bare ? "md" : "lg"} items={items.map((f) => ({ id: f.id, question: f.question, body: <FaqAnswer faq={f} /> }))} />;
  if (bare) return accordion;
  return (
    <section className={className} aria-labelledby={`faq-${page}-title`}>
      <div className="shell grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="eyebrow text-ink-soft">FAQ</p>
          <h2 id={`faq-${page}-title`} className="display mt-5 text-[clamp(2rem,1.6rem+1.4vw,2.8rem)]">
            A few good <em>questions.</em>
          </h2>
        </div>
        <div className="lg:col-span-8">
          {accordion}
          <p className="mt-8 text-ink-soft">
            More questions?{" "}
            <Link href={`/faq?category=${category}`} className="text-ink underline decoration-blue/40 underline-offset-4 hover:text-blue hover:decoration-blue">
              Explore all FAQs
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
