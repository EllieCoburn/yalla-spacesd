import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { EventEnquiryForm } from "@/components/site/EventEnquiryForm";
import { FlexRates } from "@/components/site/FlexRates";
import { CtaBand, FactsAccordion } from "@/components/site/PageParts";
import { ToConfirm } from "@/components/ui/Draft";
import { Arrow, Button, Eyebrow } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { getProgram, otherPrograms } from "@/content/programs";

export function generateStaticParams() {
  return otherPrograms.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = getProgram((await params).slug);
  return p ? { title: p.name, description: p.summary } : {};
}

const pending = <span className="text-ink-soft">Details coming soon <ToConfirm /></span>;

export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = getProgram((await params).slug);
  if (!p || p.kind === "membership") notFound();
  const others = otherPrograms.filter((o) => o.slug !== p.slug);

  return (
    <>
      <section className="pt-32 pb-16 lg:pt-40 lg:pb-24">
        <div className="shell">
          <Link href="/programs" className="eyebrow inline-flex items-center gap-3 text-ink-soft hover:text-ink">
            <Arrow className="h-3 w-4 rotate-180" /> All programs
          </Link>
          <div className="mt-10 grid items-end gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Reveal>
                <Eyebrow className="flex items-center gap-3">
                  {p.motif ? <Mark name={p.motif} className="h-5 w-auto text-blue" /> : null}
                  {p.short}
                </Eyebrow>
              </Reveal>
              <Reveal delay={100}>
                <h1 className="display mt-6 text-[clamp(3rem,1.6rem+5vw,6.2rem)]">{p.name}</h1>
              </Reveal>
              <Reveal delay={180}>
                <p className="display mt-5 text-[clamp(1.4rem,1.1rem+1vw,2rem)] text-blue italic">{p.tagline}</p>
              </Reveal>
              <Reveal delay={260}>
                <p className="mt-8 max-w-xl text-[1.08rem] text-ink-soft">{p.summary}</p>
              </Reveal>
              <Reveal delay={340} className="mt-10 flex flex-wrap gap-3">
                <Button href={p.cta.href} size="lg">
                  {p.cta.label}
                </Button>
                <Button href="/visit" variant="outline" size="lg">
                  Book a tour
                </Button>
              </Reveal>
            </div>
            <Reveal delay={150} className="relative lg:col-span-4 lg:col-start-9">
              <div className="relative aspect-[3/4] overflow-hidden rounded-t-[999px] bg-sand">
                <Image src={p.image} alt={p.imageAlt} fill priority sizes="(min-width:1024px) 30vw, 90vw" className="object-cover" />
              </div>
              {p.motif ? (
                <Mark
                  name={p.motif}
                  // The bunting is a wide garland, so it sits lower and smaller than the upright motifs.
                  className={`absolute -left-6 w-auto text-blue sm:-left-10 ${p.motif === "bunting" ? "-bottom-6 h-14 sm:h-16" : "-bottom-8 h-24 sm:h-28"}`}
                />
              ) : null}
            </Reveal>
          </div>
        </div>
      </section>

      <section className="bg-paper py-20 lg:py-28">
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Mark name="roofline" className="h-4 w-auto text-blue" />
            <div className="mt-10 space-y-6 text-[1.08rem] text-ink-soft">
              {p.body.map((para) => (
                <p key={para}>{para}</p>
              ))}
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <Eyebrow className="mb-6">The details</Eyebrow>
            <FactsAccordion
              items={
                p.kind === "private_event"
                  ? [
                      { label: "Occasions", value: "Private parties & special occasions" },
                      { label: "Guests", value: pending },
                      { label: "Availability", value: pending },
                      { label: "Pricing", value: p.pricing ?? pending },
                      { label: "How to book", value: "Send an enquiry below and we’ll plan it with you" },
                    ]
                  : [
                // Yalla Flex shows ages, days, hours and pricing in the day-rates section below, so they aren't repeated here.
                ...(p.kind === "drop_in"
                  ? []
                  : [
                      { label: "Ages", value: p.ages ?? pending },
                      { label: "Days & hours", value: p.days ?? pending },
                      { label: "Pricing", value: p.pricing ?? pending },
                    ]),
                {
                  label: "What’s included",
                  value: p.included ? (
                    <ul className="list-disc space-y-2 pl-5 marker:text-blue">
                      {p.included.map((x) => (
                        <li key={x} className="pl-1">
                          {x}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    pending
                  ),
                },
                // On Yalla Flex, parents are covered by "What’s included" (coworking for you); first-timers get setup steps instead.
                ...(p.kind === "drop_in"
                  ? [
                      {
                        label: "Before your first day",
                        value:
                          "Set up your Family Portal, add your child’s profile and complete the required forms. Most of this happens just once, so later bookings are quick.",
                      },
                    ]
                  : [
                      {
                        label: "Parents",
                        value:
                          p.parentOnsite === true
                            ? "Parents and caregivers work onsite in our coworking space"
                            : p.parentOnsite === false
                              ? "Parents head out after arrival and enjoy their time"
                              : pending,
                      },
                    ]),
                {
                  label: "How to book",
                  value:
                    p.bookingMode === "inquire"
                      ? "Get in touch and we’ll take it from there"
                      : p.kind === "drop_in"
                        ? "Choose full or half days in the booking calendar whenever there’s space, and reserve online with instant confirmation. Book a single day or several at once."
                        : "Book online. Live availability, instant confirmation.",
                },
                    ]
              }
            />
            <div className="mt-10">
              <Button href={p.cta.href}>{p.cta.label}</Button>
            </div>
          </div>
        </div>
      </section>

      {p.kind === "drop_in" ? <FlexRates /> : null}

      {p.kind === "private_event" ? (
        <section id="enquire" className="scroll-mt-24 py-20 lg:py-28">
          <div className="shell grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Eyebrow>Private events</Eyebrow>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Tell us about <em>your occasion.</em>
              </h2>
              <p className="mt-6 text-ink-soft">Share a few details and we’ll be in touch to plan it with you.</p>
            </div>
            <div className="bg-paper p-7 sm:p-12 lg:col-span-7 lg:col-start-6">
              <EventEnquiryForm />
            </div>
          </div>
        </section>
      ) : null}

      <section className="py-20 lg:py-28">
        <div className="shell">
          <Eyebrow>Also at Yalla</Eyebrow>
          <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-4">
            {others.map((o) => (
              <Link key={o.slug} href={`/programs/${o.slug}`} className="group">
                <div className="relative aspect-[3/4] overflow-hidden rounded-t-[999px] bg-sand">
                  <Image src={o.image} alt={o.imageAlt} fill sizes="(min-width:1024px) 22vw, 45vw" className="object-cover transition-transform duration-[1.6s] ease-[var(--ease-soft)] group-hover:scale-[1.05]" />
                </div>
                <h3 className="display mt-5 text-[1.4rem] group-hover:text-blue">{o.name}</h3>
                <p className="mt-1 text-[0.88rem] text-ink-soft">{o.tagline}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title={
          <>
            Ready when <em>you are.</em>
          </>
        }
        primary={{ href: p.cta.href, label: p.cta.label }}
        secondary={{ href: "/faq", label: "Read the FAQ" }}
      />
    </>
  );
}
