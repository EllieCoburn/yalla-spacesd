import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/primitives";
import { Markup } from "@/components/faq/FaqAnswer";
import { POLICIES } from "@/content/policies";

export const metadata: Metadata = {
  title: "Policies & Terms",
  description: "Yalla’s policies, including cancellations and refunds.",
};

export default function PoliciesPage() {
  const list = POLICIES.filter((p) => p.approved && p.public);
  return (
    <>
      <section className="pt-32 pb-14 lg:pt-44 lg:pb-16">
        <div className="shell">
          <Eyebrow>Policies &amp; Terms</Eyebrow>
          <h1 className="display mt-7 text-[clamp(2.6rem,1.6rem+3.6vw,4.8rem)]">
            The fine print, <em>in plain view.</em>
          </h1>
          <p className="lede mt-8 max-w-2xl text-ink-soft">
            Yalla’s formal policies. For quick, friendly answers about how Yalla works, visit our{" "}
            <Link href="/faq" className="underline decoration-blue/40 underline-offset-4 hover:text-blue">
              FAQ
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="border-t border-line pt-12 pb-24 lg:pt-16 lg:pb-32">
        <div className="shell space-y-20">
          {list.map((p) => (
            <article key={p.id} id={p.id} className="scroll-mt-32 grid gap-10 lg:grid-cols-12">
              <h2 className="display text-[clamp(1.8rem,1.4rem+1.2vw,2.4rem)] lg:col-span-4">{p.title}</h2>
              <div className="max-w-2xl space-y-8 text-[1.02rem] text-ink-soft lg:col-span-8">
                {p.sections.map((s, i) => (
                  <div key={i} className="space-y-3">
                    {s.heading ? <h3 className="eyebrow text-[0.65rem] text-ink">{s.heading}</h3> : null}
                    {s.paragraphs.map((t, j) => (
                      <Markup key={j} text={t} />
                    ))}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
