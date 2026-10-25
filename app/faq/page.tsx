import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CtaBand, PageHero } from "@/components/site/PageParts";
import { ToConfirm } from "@/components/ui/Draft";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about parent presence, ages, meals, naps, booking, cancellations and first visits at Yalla.",
};

type QA = { q: string; a: ReactNode };

const groups: { title: string; items: QA[] }[] = [
  {
    title: "How Yalla works",
    items: [
      {
        q: "Do I need to stay onsite while my child is in care?",
        a: (
          <>
            Our weekly program, Yalla Everyday, is designed around parents and caregivers working onsite in our coworking space, close to
            their children all day. Some offerings, like Yalla After Hours, are drop-off by design. Each program page notes how it works.{" "}
            <ToConfirm>Policy details</ToConfirm>
          </>
        ),
      },
      {
        q: "What ages do you care for?",
        a: "We serve families with children from around four months through five years old. Some offerings may have their own age range, shown on each program page and in the booking calendar.",
      },
      {
        q: "What are your caregiver-to-child ratios?",
        a: "Our cohorts are deliberately small. Seedlings and Saplings have a maximum ratio of 1:4 and at most 8 children; Sprouts 1:6 with at most 12; and Wildflowers 1:8 with at most 12.",
      },
      {
        q: "What are your hours?",
        a: "Yalla Everyday runs year-round on weekdays. Full days are 8:30am to 4:30pm and half days 8:30am to 12:00pm, with Early Bird care from 8:00am. Weekend sessions and other offerings have their own times, listed in the booking calendar.",
      },
    ],
  },
  {
    title: "The day",
    items: [
      { q: "Are meals and snacks provided?", a: <ToConfirm>Answer from Yalla</ToConfirm> },
      { q: "How do naps and rest time work?", a: <ToConfirm>Answer from Yalla</ToConfirm> },
      { q: "What should my child bring?", a: <ToConfirm>Answer from Yalla</ToConfirm> },
    ],
  },
  {
    title: "Booking & changes",
    items: [
      {
        q: "How do I book Yalla Flex, Camp Yalla, Weekends or After Hours?",
        a: "Head to Book Care, filter by offering, your child’s age and date, then choose your sessions and reserve. Your bookings live in the Family Portal, where you can view or change them.",
      },
      {
        q: "Can I book the same day every week?",
        a: "Yes. Repeat bookings let you reserve a recurring day (every Tuesday, say) in one go.",
      },
      { q: "What is your cancellation policy?", a: <ToConfirm>Policy from Yalla</ToConfirm> },
      {
        q: "What happens if a session is full?",
        a: "You can join the waitlist from the booking calendar, and we’ll let you know if a space opens up.",
      },
    ],
  },
  {
    title: "Getting started",
    items: [
      {
        q: "What happens on a first visit?",
        a: "Start with a tour: see the classrooms, the yard and the coworking space, and ask us anything. You can request one on our Visit page.",
      },
      {
        q: "What paperwork is needed before my child’s first day?",
        a: (
          <>
            Required forms are completed in the Family Portal, where you can see what’s outstanding for each child. <ToConfirm>List of forms</ToConfirm>
          </>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <>
      <PageHero
        eyebrow="FAQ"
        mark="sun"
        title={
          <>
            Good questions, <em>clear answers.</em>
          </>
        }
        lede="Everything families usually ask before their first day. Don’t see yours? We’re happy to talk it through."
      />

      <section className="pb-10">
        <div className="shell grid gap-16 lg:grid-cols-12">
          <nav aria-label="FAQ sections" className="hidden lg:col-span-3 lg:block">
            <ul className="sticky top-32 space-y-3">
              {groups.map((g, i) => (
                <li key={g.title}>
                  <a href={`#faq-${i}`} className="link-underline text-[0.95rem] text-ink-soft hover:text-ink">
                    {g.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-20 lg:col-span-8 lg:col-start-5">
            {groups.map((g, i) => (
              <div key={g.title} id={`faq-${i}`} className="scroll-mt-32">
                <p className="eyebrow text-ink-soft">
                  <span className="mr-3 font-serif text-[0.9rem] tracking-normal text-blue normal-case italic">0{i + 1}</span>
                  {g.title}
                </p>
                <div className="hairline mt-6 border-t">
                  {g.items.map((it) => (
                    <details key={it.q} className="group hairline border-b">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 [&::-webkit-details-marker]:hidden">
                        <span className="display text-[1.3rem] leading-snug! sm:text-[1.5rem]">{it.q}</span>
                        <span className="relative mt-2 h-4 w-4 shrink-0">
                          <span className="absolute top-1/2 left-0 h-px w-4 bg-ink" />
                          <span className="absolute top-0 left-1/2 h-4 w-px bg-ink transition-transform duration-500 group-open:rotate-90 group-open:opacity-0" />
                        </span>
                      </summary>
                      <div className="max-w-2xl pb-8 text-[1.02rem] text-ink-soft">{it.a}</div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title={
          <>
            Still curious? <em>Come visit.</em>
          </>
        }
        primary={{ href: "/visit", label: "Schedule a tour" }}
        secondary={{ href: "/book", label: "Book care" }}
      />
    </>
  );
}
