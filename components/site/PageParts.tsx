import Image from "next/image";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
import type { MarkName } from "@/components/brand/marks";
import { Button, Chevron, Eyebrow } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

export function PageHero({
  eyebrow,
  title,
  lede,
  image,
  mark,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  image?: { src: string; alt: string };
  mark?: MarkName;
}) {
  return (
    <section className="pt-32 pb-16 lg:pt-44 lg:pb-24">
      <div className="shell grid items-end gap-12 lg:grid-cols-12">
        <div className={image ? "lg:col-span-7" : "lg:col-span-9"}>
          <Reveal>
            <Eyebrow className="flex items-center gap-3">
              {mark ? <Mark name={mark} className="h-5 w-auto text-blue" /> : null}
              {eyebrow}
            </Eyebrow>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="display mt-7 text-[clamp(2.8rem,1.6rem+4.4vw,5.6rem)]">{title}</h1>
          </Reveal>
          {lede ? (
            <Reveal delay={200}>
              <p className="lede mt-8 max-w-2xl text-ink-soft">{lede}</p>
            </Reveal>
          ) : null}
        </div>
        {image ? (
          <Reveal delay={150} className="lg:col-span-4 lg:col-start-9">
            <div className="relative ml-auto aspect-[3/4] w-[70%] overflow-hidden rounded-t-[999px] bg-sand lg:w-full">
              <Image src={image.src} alt={image.alt} fill priority sizes="(min-width:1024px) 30vw, 70vw" className="object-cover" />
            </div>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

export function Section({ children, className = "", tone = "chalk" }: { children: ReactNode; className?: string; tone?: "chalk" | "paper" | "mist" | "sand" }) {
  const tones = { chalk: "", paper: "bg-paper", mist: "bg-mist", sand: "bg-sand/60" };
  return <section className={`py-20 lg:py-32 ${tones[tone]} ${className}`}>{children}</section>;
}

export function SectionTitle({ eyebrow, title, children, className = "" }: { eyebrow?: string; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="display mt-5 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">{title}</h2>
      {children ? <div className="mt-6 max-w-xl text-[1.05rem] text-ink-soft">{children}</div> : null}
    </div>
  );
}

/** Definition list of practical facts — ages, hours, pricing. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="hairline divide-y divide-line border-y">
      {items.map((it) => (
        <div key={it.label} className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
          <dt className="eyebrow pt-1 text-[0.62rem] text-ink-soft">{it.label}</dt>
          <dd className="font-serif text-[1.1rem]">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Facts as a list of expandable rows: the label is always visible, the detail opens on tap. */
export function FactsAccordion({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="hairline border-t">
      {items.map((it) => (
        <details key={it.label} className="group hairline border-b">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 [&::-webkit-details-marker]:hidden">
            <span className="display text-[1.3rem] sm:text-[1.45rem]">{it.label}</span>
            <Chevron className="h-2.5 w-4 shrink-0 text-ink" />
          </summary>
          <div className="pb-6 font-serif text-[1.08rem] text-ink-soft">{it.value}</div>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({
  title,
  body,
  primary,
  secondary,
}: {
  title: ReactNode;
  body?: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="py-24 lg:py-32">
      <div className="shell">
        <Reveal className="relative overflow-hidden bg-mist px-8 py-16 text-center sm:px-16 lg:py-24">
          <Mark name="roofline" className="mx-auto h-5 w-auto text-blue" />
          <h2 className="display mx-auto mt-8 max-w-3xl text-[clamp(2.1rem,1.5rem+2vw,3.4rem)]">{title}</h2>
          {body ? <p className="mx-auto mt-5 max-w-lg text-ink-soft">{body}</p> : null}
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button href={primary.href} size="lg">
              {primary.label}
            </Button>
            {secondary ? (
              <Button href={secondary.href} variant="outline" size="lg">
                {secondary.label}
              </Button>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
