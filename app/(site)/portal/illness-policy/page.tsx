import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Markup } from "@/components/faq/FaqAnswer";
import { policyById } from "@/content/policies";
import { isDbConfigured } from "@/lib/db";
import { PORTAL_OPEN_PREVIEW } from "@/lib/portal-preview";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "Illness policy", robots: { index: false } };
export const dynamic = "force-dynamic";

const anchor = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The illness policy for enrolled families, in the Family Portal. Same wording the public FAQ will use. */
export default async function IllnessPolicy() {
  const g = isDbConfigured() ? await getGuardian() : null;
  if (!g && !PORTAL_OPEN_PREVIEW) redirect("/portal?signin=1&next=/portal/illness-policy");
  const policy = policyById("illness");
  if (!policy) notFound();
  const sections = policy.sections.map((s) => ({ ...s, id: anchor(s.short ?? s.heading ?? "") }));

  return (
    <div className="pt-28 pb-24 lg:pt-36">
      <div className="shell">
        <Link href="/portal/home" className="text-[0.85rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">
          ← Family Portal
        </Link>

        <div className="mt-8 max-w-3xl">
          <p className="eyebrow text-ink-soft">Family Portal · Health &amp; wellness</p>
          <h1 className="display mt-5 text-[clamp(2.4rem,1.8rem+2.4vw,4rem)]">
            Illness <em>policy.</em>
          </h1>
          <p className="mt-6 max-w-xl text-[1.05rem] text-ink-soft">{policy.title}</p>
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-12">
          <nav aria-label="On this page" className="lg:col-span-3">
            <div className="lg:sticky lg:top-32">
              <p className="eyebrow text-[0.6rem] text-ink-soft">On this page</p>
              <ol className="mt-3 divide-y divide-line border-y border-line">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="flex items-baseline gap-3 py-2.5 text-[0.92rem] hover:text-blue">
                      <span className="font-serif text-ink-soft italic">{String(i + 1).padStart(2, "0")}</span>
                      {s.short ?? s.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <div className="space-y-16 lg:col-span-8 lg:col-start-5">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-28 border-t border-line pt-10">
                {s.heading ? (
                  <h2 className={s.note ? "border-l-2 border-blue/50 pl-5 font-serif text-[1.2rem] leading-relaxed text-ink italic" : "display text-[clamp(1.5rem,1.2rem+1vw,2rem)] leading-snug!"}>{s.heading}</h2>
                ) : null}
                <div className="mt-6 space-y-5 text-[1.02rem] leading-relaxed text-ink-soft">
                  {s.paragraphs.map((t, j) => (
                    <Markup key={j} text={t} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
