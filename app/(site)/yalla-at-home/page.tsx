import type { Metadata } from "next";
import { CtaBand, PageHero, Section, SectionTitle } from "@/components/site/PageParts";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { site } from "@/content/site";

/**
 * Yalla at Home: Ellie's in-home postpartum doula care. A private page shared by link only: it's not
 * in the menu or the sitemap, and search engines are told not to list it (here and in an
 * X-Robots-Tag header, next.config.ts). It's deliberately not in robots.txt, which would advertise it.
 */
export const metadata: Metadata = {
  title: "Yalla at Home · In-home postpartum doula care",
  description: "In-home postpartum doula care with Ellie Coburn. Newborn care and practical support for San Diego families finding their rhythm with a new baby.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  alternates: { canonical: null },
};

const EMAIL = site.email.value;
const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent("Yalla at Home")}`;
const phone = site.phone.value;

const care = [
  {
    title: "Overnight care",
    lede: "Especially helpful in the early weeks. You sleep; I take the night shift.",
    items: [
      "Bottle feeds, with bottles and pump parts washed and ready by morning",
      "Bringing your baby to you to nurse, then burping, changing and settling afterward so you can go right back to bed",
      "Diapers, swaddling and soothing, at your baby’s pace",
      "A simple log of feeds, diapers and sleep",
      "A calm morning handover: how the night went and what I noticed",
    ],
  },
  {
    title: "Daytime care",
    lede: "An extra pair of hands while you rest, recover, shower or simply eat a warm meal.",
    items: [
      "Newborn care while you nap, or time together while I take care of the rest",
      "Feeding support: bottle prep, pump setup and finding comfortable positions",
      "Babywearing, bathing and settling, shown gently and at your pace",
      "Light, baby-centered help: laundry, restocking the changing station, a tidy nursery",
      "Time with older siblings, so they feel included in the new rhythm",
    ],
  },
];

const steps = [
  { title: "We talk", body: "A relaxed conversation about your family, your baby (or your due date) and what kind of help would make the biggest difference." },
  { title: "We plan", body: "Together we shape the support: overnights, days or both, how many nights a week, and for how many weeks." },
  { title: "I get to know you", body: "How you feed, how you like to soothe, what matters to your family. Your home, your baby, your way." },
  { title: "We adjust", body: "Newborns change quickly. As your baby grows and you find your rhythm, we change the plan with you." },
];

const faqs = [
  {
    q: "When should we reach out?",
    a: "Anytime. Many families get in touch during pregnancy so we can plan ahead, and I’m always glad to hear from families once their baby is here.",
  },
  {
    q: "Where do you offer care?",
    a: "In your home, in San Diego. Tell me your neighborhood when you get in touch.",
  },
  {
    q: "Is this medical care?",
    a: "No. Postpartum doula care is practical, non-medical support for you and your baby. For medical or feeding concerns, I’ll always encourage you to call your pediatrician, care provider or a lactation consultant, and I’m happy to help you find one.",
  },
  {
    q: "Do we need to be a Yalla family?",
    a: "Not at all. Yalla at Home is for any San Diego family with a new baby. If you’d like to keep the relationship going as your little one grows, Yalla is right here.",
  },
];

export default function YallaAtHome() {
  return (
    <>
      <PageHero
        eyebrow="Yalla at Home"
        mark="arch"
        title={
          <>
            In-home postpartum doula care <em>with Ellie Coburn.</em>
          </>
        }
        lede="Newborn care and practical support for San Diego families finding their rhythm with a new baby."
        image={{ src: "/photos/ellie-coburn.jpg", alt: "Ellie Coburn, owner of Yalla and a postpartum doula, smiling outdoors in a mint green shirt" }}
      />

      {/* In Ellie's words */}
      <Section tone="paper">
        <div className="shell grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Index n="01">Hello</Index>
          </div>
          <div className="space-y-6 text-[1.12rem] leading-relaxed text-ink lg:col-span-7 lg:col-start-6">
            <Reveal>
              <p>
                Yalla at Home brings Yalla’s approach to caring for children and families into your home. I’m Ellie Coburn, the owner of Yalla and a longtime postpartum doula. I offer in-home
                postpartum support in San Diego, with a focus on <em className="text-blue">supporting the whole family</em> in the early weeks with a new baby.
              </p>
            </Reveal>
            <Reveal delay={80}>
              <p className="text-ink-soft">
                We’ll talk about what would make the biggest difference for your family. That might mean getting a longer stretch of sleep while I handle bottles, diapers and settling, or having
                me bring your baby to you to nurse and take over afterward so you can go right back to bed.
              </p>
            </Reveal>
            <Reveal delay={160}>
              <p className="text-ink-soft">I’ll get to know how you want to care for your baby, what matters to your family, and where another pair of hands would make life a little easier.</p>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* Overnight and daytime care */}
      <Section>
        <div className="shell">
          <Index n="02">How I can help</Index>
          <SectionTitle
            className="mt-6"
            title={
              <>
                Day or night, <em>whatever helps most.</em>
              </>
            }
          />
          <div className="mt-14 grid gap-px overflow-hidden bg-line md:grid-cols-2">
            {care.map((c, i) => (
              <Reveal key={c.title} delay={i * 90} className="bg-chalk p-8 lg:p-12">
                <h3 className="display text-[1.9rem]">{c.title}</h3>
                <p className="mt-3 text-ink-soft">{c.lede}</p>
                <ul className="mt-7 space-y-3.5">
                  {c.items.map((it) => (
                    <li key={it} className="flex gap-3 text-[1rem] text-ink">
                      <svg viewBox="0 0 16 16" aria-hidden className="mt-1 h-4 w-4 shrink-0 text-blue" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5l3 3 7-7" />
                      </svg>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* How it works */}
      <Section tone="sand">
        <div className="shell">
          <Index n="03">How it works</Index>
          <SectionTitle
            className="mt-6"
            title={
              <>
                Support shaped <em>around your family.</em>
              </>
            }
          />
          <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 80}>
                <li>
                  <span className="display text-[2.4rem] text-blue italic">{i + 1}</span>
                  <h3 className="display mt-3 text-[1.45rem]">{s.title}</h3>
                  <p className="mt-2 text-ink-soft">{s.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </Section>

      {/* About Ellie */}
      <Section tone="paper">
        <div className="shell grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Index n="04">A little about me</Index>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <Reveal>
              <h2 className="display text-[clamp(2.1rem,1.5rem+2vw,3.1rem)]">
                Ellie Coburn, <em>M.Ed.</em>
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <p className="mt-6 text-[1.08rem] leading-relaxed text-ink-soft">
                I’m the owner of Yalla Childcare &amp; Coworking in Bankers Hill and a longtime postpartum doula. My work, at Yalla and in families’ homes, rests on the same belief: babies are
                capable, and they deserve care that is calm, unhurried and responsive. I’ll follow your lead on how you care for your baby, and bring steady, experienced hands to those
                early weeks so you can rest, recover and enjoy your new little one.
              </p>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* Good to know */}
      <Section>
        <div className="shell grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Index n="05">Good to know</Index>
          </div>
          <dl className="divide-y divide-line border-y border-line lg:col-span-7 lg:col-start-6">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 60} className="py-7">
                <dt className="display text-[1.4rem]">{f.q}</dt>
                <dd className="mt-2 text-ink-soft">{f.a}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </Section>

      <CtaBand
        title={
          <>
            Let’s talk about <em>your family.</em>
          </>
        }
        body={`Email me at ${EMAIL}${phone ? ` or call ${phone}` : ""}. Tell me a little about your family and your due date (or your baby’s birthday), and I’ll be in touch.`}
        primary={{ href: mailto, label: "Email Ellie" }}
        secondary={phone ? { href: `tel:+1${phone.replace(/\D/g, "")}`, label: `Call ${phone}` } : undefined}
      />
    </>
  );
}
