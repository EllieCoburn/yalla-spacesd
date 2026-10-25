"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { nav, secondaryNav } from "@/content/site";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-700 ease-[var(--ease-soft)] ${
          scrolled ? "bg-chalk/85 shadow-[0_1px_0_var(--color-line)] backdrop-blur-xl" : "bg-transparent"
        }`}
      >
        <div className={`shell flex items-center justify-between transition-all duration-700 ${scrolled ? "h-16" : "h-20 lg:h-24"}`}>
          <Link href="/" aria-label="Yalla — home" className="relative z-10 text-blue">
            <Mark name="wordmark" className={`w-auto transition-all duration-700 ${scrolled ? "h-7" : "h-8 lg:h-10"}`} />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-8 xl:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className="link-underline pb-0.5 text-[0.84rem] tracking-[0.02em] text-ink/80 transition-colors hover:text-ink"
              >
                {item.short}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-5">
            <Link href="/portal" className="hidden text-[0.84rem] text-ink/70 transition-colors hover:text-ink md:inline">
              Family Portal
            </Link>
            <Link
              href="/book"
              className="hidden h-10 items-center rounded-full bg-ink px-5 text-[0.82rem] tracking-[0.04em] text-chalk transition-colors duration-500 hover:bg-blue sm:inline-flex"
            >
              Book care
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="site-menu"
              className="relative z-10 -mr-2 flex h-11 w-11 items-center justify-center xl:hidden"
            >
              <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
              <span className="relative block h-3 w-7">
                <span className={`absolute left-0 h-px w-full bg-ink transition-all duration-500 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
                <span className={`absolute left-0 h-px bg-ink transition-all duration-500 ${open ? "top-1.5 w-full -rotate-45" : "top-3 w-4"}`} />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Full-screen menu (mobile & tablet) */}
      <div
        id="site-menu"
        className={`fixed inset-0 z-40 flex flex-col bg-chalk transition-[opacity,visibility] duration-700 ease-[var(--ease-soft)] xl:hidden ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="shell flex flex-1 flex-col overflow-y-auto pt-28 pb-10">
          <nav aria-label="Mobile" className="flex flex-col">
            {nav.map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                className={`display hairline flex items-baseline justify-between border-b py-4 text-[2rem] transition-all duration-700 ease-[var(--ease-soft)] sm:text-[2.6rem] ${
                  open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                } ${isActive(item.href) ? "text-blue" : ""}`}
                style={{ transitionDelay: open ? `${120 + i * 50}ms` : "0ms" }}
              >
                {item.label}
                <span className="font-serif text-sm text-ink-soft italic">0{i + 1}</span>
              </Link>
            ))}
          </nav>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
            {secondaryNav.map((item) => (
              <Link key={item.href} href={item.href} className="eyebrow text-ink-soft hover:text-ink">
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-auto flex items-end justify-between gap-6 pt-12">
            <Link href="/book" className="inline-flex h-14 flex-1 items-center justify-center rounded-full bg-ink text-chalk">
              Book care
            </Link>
            <Mark name="palm" className="h-28 w-auto shrink-0 text-blue" />
          </div>
        </div>
      </div>
    </>
  );
}
