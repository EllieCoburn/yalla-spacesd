import Image from "next/image";
import Link from "next/link";
import { AvailabilityGlance } from "@/components/booking/AvailabilityGlance";
import { Facade } from "@/components/brand/Facade";
import { Mark } from "@/components/brand/Mark";
import { WindowField } from "@/components/brand/WindowField";
import { Arrow, Button, Eyebrow, Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { programs } from "@/content/programs";
import { site } from "@/content/site";

export default function Home() {
  return (
    <>
      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden pt-28 lg:pt-36">
        <div className="shell grid items-center gap-12 pb-16 lg:grid-cols-12 lg:gap-8 lg:pb-24">
          <div className="lg:col-span-6 xl:col-span-6">
            <Reveal>
              <Eyebrow>Childcare &amp; Coworking · Bankers Hill, San Diego</Eyebrow>
            </Reveal>
            <Reveal delay={120}>
              <h1 className="display mt-7 text-[clamp(3.1rem,1.6rem+5.4vw,6.6rem)]">
                Close to your child. <em>Connected</em> to your day.
              </h1>
            </Reveal>
            <Reveal delay={240}>
              <p className="mt-8 max-w-[34rem] text-[1.05rem] leading-relaxed text-ink-soft lg:text-[1.125rem]">
                Yalla brings play-based childcare and a beautiful coworking space together under one roof. Your child spends the day exploring
                with educators who know them well. You work a few steps away.
              </p>
            </Reveal>
            <Reveal delay={360} className="mt-10 flex flex-wrap items-center gap-3">
              <Button href="/book" size="lg">
                Book care
              </Button>
              <Button href="/visit" variant="outline" size="lg">
                Plan a visit
              </Button>
            </Reveal>
          </div>

          <Reveal delay={200} className="lg:col-span-6 xl:col-span-5 xl:col-start-8">
            <Facade
              tower={{ src: "/photos/cowork-loft.jpg", alt: "The coworking room at Yalla, seen from the loft above" }}
              door={{ src: "/photos/dinosaurs.jpg", alt: "A child playing with toy dinosaurs outdoors" }}
              porthole={{ src: "/photos/sunflowers.jpg", alt: "Sunflowers on a classroom table" }}
            />
          </Reveal>
        </div>

        <div className="shell">
          <div className="hairline grid grid-cols-2 gap-y-6 border-t py-7 text-[0.85rem] sm:grid-cols-4">
            {[
              ["Ages", site.ages],
              ["Weekdays", "8:30am – 4:30pm"],
              ["All year", "Early Bird care from 8:00am"],
              ["Where", "Bankers Hill, by Balboa Park"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="eyebrow text-[0.6rem] text-ink-soft">{k}</p>
                <p className="mt-1.5 font-serif text-[1.05rem]">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Statement ───────── */}
      <section className="py-24 lg:py-40">
        <div className="shell">
          <Reveal className="mx-auto max-w-5xl text-center">
            <Mark name="sun" className="mx-auto mb-10 h-8 w-8 text-blue" />
            <p className="display text-[clamp(1.9rem,1.2rem+2.6vw,3.6rem)] leading-[1.15]!">
              Children spend their days playing, exploring, creating and building relationships with their educators, while their parents work
              onsite. <em>Being close to your child, with real space for your own work,</em> is the whole idea.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section className="pb-24 lg:pb-36">
        <div className="shell">
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Index n="01">How Yalla works</Index>
              <h2 className="display mt-6 text-[clamp(2.2rem,1.6rem+2vw,3.4rem)]">
                One address. <em>Two</em> kinds of good day.
              </h2>
              <Link href="/experience" className="mt-8 inline-flex items-center gap-3 text-[0.9rem] hover:text-blue">
                <span className="link-underline">The Yalla experience</span>
                <Arrow className="h-3 w-5" />
              </Link>
            </div>
            <ol className="grid gap-px overflow-hidden bg-line sm:grid-cols-3 lg:col-span-8">
              {[
                { mark: "arch" as const, title: "Arrive together", body: "Come through the door side by side and settle your child in with educators who know them well." },
                { mark: "window" as const, title: "Their day, your day", body: "They play, explore and create. You work in a calm, considered coworking space onsite." },
                { mark: "palm" as const, title: "Close all day", body: "You're never more than a few steps away. When the day ends, you head home together." },
              ].map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 120} className="flex flex-col bg-chalk p-8 lg:p-10">
                  <Mark name={s.mark} className="h-14 w-auto self-start text-blue" />
                  <p className="mt-10 font-serif text-sm text-ink-soft italic">0{i + 1}</p>
                  <h3 className="display mt-2 text-[1.7rem]">{s.title}</h3>
                  <p className="mt-3 text-[0.95rem] text-ink-soft">{s.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ───────── Programs ───────── */}
      <section className="bg-paper py-24 lg:py-36">
        <div className="shell">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div>
              <Index n="02">Programs</Index>
              <h2 className="display mt-6 max-w-2xl text-[clamp(2.2rem,1.6rem+2vw,3.4rem)]">
                Every day of the week, <em>a way in.</em>
              </h2>
            </div>
            <Button href="/programs" variant="outline">
              All programs
            </Button>
          </div>
        </div>
        <div className="no-scrollbar mt-14 flex snap-x snap-mandatory gap-5 overflow-x-auto px-[clamp(1.25rem,4vw,3.5rem)] pb-4 lg:mx-auto lg:grid lg:max-w-[1320px] lg:grid-cols-4 lg:gap-y-16 lg:overflow-visible">
          {programs.map((p, i) => (
            <Reveal key={p.slug} delay={i * 90} className="w-[72vw] shrink-0 snap-start sm:w-[42vw] lg:w-auto">
              <Link href={`/programs/${p.slug}`} className="group block">
                <div className="relative aspect-[3/4] overflow-hidden rounded-t-[999px] bg-sand">
                  <Image src={p.image} alt={p.imageAlt} fill sizes="(min-width:1024px) 25vw, 70vw" className="object-cover transition-transform duration-[1.6s] ease-[var(--ease-soft)] group-hover:scale-[1.05]" />
                </div>
                <p className="eyebrow mt-6 text-[0.6rem] text-ink-soft">{p.short}</p>
                <h3 className="display mt-2 text-[1.55rem] transition-colors group-hover:text-blue">{p.name}</h3>
                <p className="mt-1.5 text-[0.9rem] text-ink-soft">{p.tagline}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── Spaces ───────── */}
      <section className="py-24 lg:py-36">
        <div className="shell grid items-center gap-14 lg:grid-cols-12">
          <Reveal className="relative lg:col-span-6">
            <div className="relative aspect-[4/5] w-[78%] overflow-hidden rounded-t-[999px] bg-sand">
              <Image src="/photos/garden.jpg" alt="Yalla's shaded outdoor yard" fill sizes="(min-width:1024px) 36vw, 78vw" className="object-cover" />
            </div>
            <div className="absolute right-0 bottom-[-6%] aspect-square w-[44%] overflow-hidden rounded-full bg-sand ring-8 ring-chalk">
              <Image src="/photos/cowork-loft.jpg" alt="Desks in the Yalla coworking room" fill sizes="20vw" className="object-cover" />
            </div>
          </Reveal>
          <div className="lg:col-span-5 lg:col-start-8">
            <Index n="03">Our spaces</Index>
            <h2 className="display mt-6 text-[clamp(2.2rem,1.6rem+2vw,3.4rem)]">
              Rooms for them. <em>Room for you.</em>
            </h2>
            <p className="mt-6 text-[1.05rem] text-ink-soft">
              Classrooms and a leafy yard made for small explorers, and a quiet, beautifully made coworking room for the grown-ups. It all
              sits in historic Bankers Hill, a short walk from Balboa Park.
            </p>
            <Button href="/spaces" variant="outline" className="mt-10">
              Explore our spaces
            </Button>
          </div>
        </div>
      </section>

      {/* ───────── Book ───────── */}
      <section className="roofline-edge mt-10 bg-ink text-ink">
        <div className="text-chalk">
          <div className="shell grid gap-14 py-24 lg:grid-cols-12 lg:py-32">
            <div className="lg:col-span-5">
              <p className="eyebrow text-chalk/60">Book care</p>
              <h2 className="display mt-6 text-[clamp(2.2rem,1.6rem+2vw,3.4rem)]">
                The next two weeks, <em className="text-mist!">at a glance.</em>
              </h2>
              <p className="mt-6 max-w-md text-chalk/70">
                Flex days, Weekends, After Hours, Camp Yalla and Happenings live in one calendar. Choose a date, add your children and reserve in a
                few taps.
              </p>
              <Button href="/book" variant="light" className="mt-10">
                Open the calendar
              </Button>
              <p className="mt-6 text-[0.75rem] text-chalk/40">Preview: sample availability until booking goes live.</p>
            </div>
            <div className="lg:col-span-6 lg:col-start-7">
              <AvailabilityGlance />
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Visit ───────── */}
      <section className="relative overflow-hidden">
        <WindowField seed={3} width={2400} height={760} className="absolute inset-0 h-full w-full" />
        <div className="shell relative py-28 lg:py-40">
          <Reveal className="mx-auto max-w-xl bg-chalk px-8 py-14 text-center sm:px-14">
            <Mark name="arch" className="mx-auto h-12 w-auto text-blue" />
            <h2 className="display mt-8 text-[clamp(2.2rem,1.6rem+2vw,3.2rem)]">
              Come on in.
            </h2>
            <p className="mx-auto mt-5 max-w-sm text-ink-soft">
              The best way to know Yalla is to stand in it. Book a tour, see the rooms and picture your days here.
            </p>
            <Button href="/visit" className="mt-9">
              Schedule a tour
            </Button>
          </Reveal>
        </div>
      </section>
    </>
  );
}
