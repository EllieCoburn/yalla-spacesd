import type { Metadata } from "next";
import Link from "next/link";
import { Markup } from "@/components/faq/FaqAnswer";
import { Eyebrow } from "@/components/ui/primitives";
import { POLICIES, POLICIES_EFFECTIVE_DATE, POLICIES_INTRO, POLICY_CHAPTERS } from "@/content/policies";
import { site } from "@/content/site";
import { fmtDate } from "@/lib/time";

export const metadata: Metadata = {
  title: "Policies & Terms",
  description: "Yalla’s policies on reservations, memberships, payments, attendance, health and community life.",
};

const linkCls = "text-ink underline decoration-blue/40 underline-offset-4 hover:text-blue hover:decoration-blue";

export default function PoliciesPage() {
  const chapters = POLICY_CHAPTERS.map((c) => ({ ...c, policies: POLICIES.filter((p) => p.approved && p.public && p.chapter === c.id) })).filter((c) => c.policies.length);

  return (
    <>
      <section className="pt-32 pb-14 lg:pt-44 lg:pb-16">
        <div className="shell">
          <Eyebrow>Policies &amp; Terms</Eyebrow>
          <h1 className="display mt-7 text-[clamp(2.6rem,1.6rem+3.6vw,4.8rem)]">
            The fine print, <em>in plain view.</em>
          </h1>
          <p className="lede mt-8 max-w-2xl text-ink-soft">{POLICIES_INTRO}</p>
          <p className="mt-6 text-[0.95rem] text-ink-soft">
            {POLICIES_EFFECTIVE_DATE ? (
              <>
                <span className="eyebrow mr-3 text-[0.6rem]">Effective</span>
                {fmtDate(POLICIES_EFFECTIVE_DATE, "MMMM d, yyyy")}
                {" · "}
              </>
            ) : null}
            Looking for quick answers?{" "}
            <Link href="/faq" className={linkCls}>
              Visit our FAQ
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="border-t border-line pt-12 pb-24 lg:pt-16 lg:pb-32">
        <div className="shell grid gap-12 lg:grid-cols-12">
          <nav aria-label="Policies" className="lg:col-span-3">
            <div className="lg:sticky lg:top-32">
              <p className="eyebrow text-[0.6rem] text-ink-soft">Contents</p>
              <ol className="mt-3 divide-y divide-line border-y border-line">
                {chapters.map((c, i) => (
                  <li key={c.id}>
                    <a href={`#${c.id}`} className="flex items-baseline gap-3 py-2.5 text-[0.92rem] hover:text-blue">
                      <span className="font-serif text-ink-soft italic">{String(i + 1).padStart(2, "0")}</span>
                      {c.title}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="#questions" className="flex items-baseline gap-3 py-2.5 text-[0.92rem] hover:text-blue">
                    <span className="font-serif text-ink-soft italic">{String(chapters.length + 1).padStart(2, "0")}</span>
                    Questions or support
                  </a>
                </li>
              </ol>
            </div>
          </nav>

          <div className="space-y-24 lg:col-span-8 lg:col-start-5">
            {chapters.map((c, i) => (
              <section key={c.id} id={c.id} className="scroll-mt-28" aria-labelledby={`${c.id}-title`}>
                <p className="font-serif text-ink-soft italic">{String(i + 1).padStart(2, "0")}</p>
                <h2 id={`${c.id}-title`} className="display mt-2 text-[clamp(2rem,1.6rem+1.4vw,2.8rem)]">
                  {c.title}
                </h2>
                <div className="mt-10 space-y-12">
                  {c.policies.map((p) => (
                    <article key={p.id} id={p.id} className="scroll-mt-28 border-t border-line pt-8">
                      <h3 className="display text-[1.45rem] leading-snug!">{p.title}</h3>
                      <div className="mt-5 max-w-2xl space-y-6 text-[1.02rem] leading-relaxed text-ink-soft">
                        {p.sections.map((s, j) => (
                          <div key={j} className="space-y-4">
                            {s.heading ? <h4 className="eyebrow text-[0.62rem] text-ink">{s.heading}</h4> : null}
                            {s.paragraphs.map((t, k) => (
                              <Markup key={k} text={t} />
                            ))}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}

            <section id="questions" className="scroll-mt-28 border border-line bg-paper p-8 lg:p-10" aria-labelledby="questions-title">
              <h2 id="questions-title" className="display text-[clamp(1.8rem,1.4rem+1.2vw,2.4rem)]">
                Questions or <em>support.</em>
              </h2>
              <p className="mt-4 max-w-xl text-ink-soft">We’re happy to help you understand a policy or find the right next step for your family.</p>
              <dl className="mt-8 grid gap-6 text-[0.95rem] sm:grid-cols-3">
                <div>
                  <dt className="eyebrow text-[0.6rem] text-ink-soft">Phone</dt>
                  <dd className="mt-2">
                    <a href={`tel:+1${site.phone.value?.replace(/\D/g, "")}`} className={linkCls}>
                      {site.phone.value}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow text-[0.6rem] text-ink-soft">General questions</dt>
                  <dd className="mt-2">
                    <a href="mailto:hello@yallaspacesd.com" className={linkCls}>
                      hello@yallaspacesd.com
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow text-[0.6rem] text-ink-soft">Memberships &amp; bookings</dt>
                  <dd className="mt-2">
                    <a href="mailto:membership@yallaspacesd.com" className={linkCls}>
                      membership@yallaspacesd.com
                    </a>
                  </dd>
                </div>
              </dl>
              <p className="mt-8 text-[0.88rem] text-ink-soft">Visits and programming are by reservation.</p>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}
