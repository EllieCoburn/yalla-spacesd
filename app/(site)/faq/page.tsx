import type { Metadata } from "next";
import { FaqAnswer } from "@/components/faq/FaqAnswer";
import { FaqExplorer } from "@/components/faq/FaqExplorer";
import { CtaBand } from "@/components/site/PageParts";
import { Eyebrow } from "@/components/ui/primitives";
import { FAQ_CATEGORIES } from "@/content/faq";
import { faqsByCategory } from "@/lib/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Everything you need to know about joining, booking, and making the most of Yalla.",
};

export const dynamic = "force-dynamic";

export default async function FaqPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  const sp = await searchParams;
  const sections = await faqsByCategory();
  // A link to a question opens its category with that question expanded.
  const asked = sp.q ? (sections.find((s) => s.items.some((f) => f.id === sp.q && f.category === s.key)) ?? sections.find((s) => s.items.some((f) => f.id === sp.q))) : null;
  const initial = asked?.key ?? (FAQ_CATEGORIES.some((c) => c.key === sp.category) ? sp.category! : FAQ_CATEGORIES[0].key);

  return (
    <>
      <section className="pt-32 pb-14 lg:pt-44 lg:pb-16">
        <div className="shell">
          <Eyebrow>Here to help</Eyebrow>
          <h1 className="display mt-7 text-[clamp(2.8rem,1.6rem+4.4vw,5.6rem)]">
            Good questions, <em>good answers.</em>
          </h1>
          <p className="lede mt-8 max-w-2xl text-ink-soft">Everything you need to know about joining, booking, and making the most of Yalla.</p>
        </div>
      </section>

      <section className="border-t border-line pt-12 pb-24 lg:pt-16 lg:pb-32">
        <div className="shell">
          <FaqExplorer
            initial={initial}
            openId={asked ? sp.q! : null}
            sections={sections.map((s) => ({
              key: s.key,
              label: s.label,
              description: s.description,
              items: s.items.map((f) => ({ id: f.id, question: f.question, body: <FaqAnswer faq={f} /> })),
            }))}
          />
        </div>
      </section>

      <CtaBand
        title={
          <>
            Still curious? <em>Come visit.</em>
          </>
        }
        primary={{ href: "/book-a-tour", label: "Book a tour" }}
        secondary={{ href: "/book", label: "Explore Yalla" }}
      />
    </>
  );
}
