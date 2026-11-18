import Link from "next/link";
import { Button } from "@/components/ui/primitives";

/** Where old links (including pages from Yalla's previous website) land: a way forward. */
export function MovedPage() {
  const links = [
    { href: "/club-yalla", label: "Club Yalla", note: "Year-round weekday membership" },
    { href: "/programs/yalla-flex", label: "Yalla Flex", note: "Book a day of care and coworking" },
    { href: "/programs/camp-yalla", label: "Camp Yalla", note: "Seasonal, play-based camps" },
    { href: "/programs/yalla-happenings", label: "Yalla Happenings", note: "Weekend and evening experiences" },
    { href: "/coworking", label: "Coworking", note: "Work and play, under one roof" },
    { href: "/about", label: "About Yalla", note: "Our story, approach and space" },
  ];
  return (
    <section className="pt-36 pb-24 lg:pt-44">
      <div className="shell max-w-3xl">
        <h1 className="display text-[clamp(2.4rem,1.7rem+2.4vw,3.8rem)]">
          This page has <em>moved.</em>
        </h1>
        <p className="mt-5 max-w-xl text-[1.08rem] text-ink-soft">Yalla has a new website, so some older links no longer work. Here’s where to find what you’re looking for.</p>
        <ul className="mt-10 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
          {links.map((l) => (
            <li key={l.href} className="bg-paper">
              <Link href={l.href} className="block h-full p-6 transition-colors hover:bg-sand/60">
                <span className="display text-[1.35rem] text-ink">{l.label}</span>
                <span className="mt-1 block text-[0.9rem] text-ink-soft">{l.note}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Button href="/" size="lg">
            Go to the home page
          </Button>
          <Link href="/faq" className="link-underline pb-0.5 text-[0.95rem] text-ink">
            Read the FAQ
          </Link>
          <Link href="/book-a-tour" className="link-underline pb-0.5 text-[0.95rem] text-ink">
            Book a tour
          </Link>
        </div>
      </div>
    </section>
  );
}
