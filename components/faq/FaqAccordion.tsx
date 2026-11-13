"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

export type FaqItem = { id: string; question: string; body: ReactNode };

/** Plus that becomes a minus when open. */
function PlusMinus({ open }: { open: boolean }) {
  return (
    <span aria-hidden className="relative mt-[0.55em] block h-3.5 w-3.5 shrink-0 text-ink">
      <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-current" />
      <span className={`absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-current transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? "scale-y-0" : "scale-y-100"}`} />
    </span>
  );
}

/**
 * One question open at a time. `openId` opens a question on arrival (for links to a question);
 * changing `resetKey` closes everything (e.g. when switching category).
 */
export function FaqAccordion({ items, openId, size = "lg" }: { items: FaqItem[]; openId?: string | null; size?: "lg" | "md" }) {
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const uid = useId();

  useEffect(() => {
    if (!openId) return;
    const el = document.getElementById(`faq-${openId}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  }, [openId]);

  return (
    <div className="border-t border-line">
      {items.map((it) => {
        const isOpen = open === it.id;
        const btn = `${uid}-${it.id}-q`;
        const panel = `${uid}-${it.id}-a`;
        return (
          <div key={it.id} id={`faq-${it.id}`} className="scroll-mt-32 border-b border-line">
            <h3>
              <button
                id={btn}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => setOpen(isOpen ? null : it.id)}
                className={`group flex w-full items-start justify-between gap-6 text-left focus-visible:outline-none ${size === "lg" ? "py-6 sm:py-7" : "py-5"}`}
              >
                <span
                  className={`group-hover:text-blue group-focus-visible:underline group-focus-visible:decoration-blue/50 group-focus-visible:underline-offset-4 ${
                    size === "lg" ? "display text-[1.25rem] leading-snug! sm:text-[1.5rem]" : "text-[1.08rem] leading-snug"
                  }`}
                >
                  {it.question}
                </span>
                <PlusMinus open={isOpen} />
              </button>
            </h3>
            <div
              id={panel}
              role="region"
              aria-labelledby={btn}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
              inert={!isOpen}
            >
              <div className="overflow-hidden">
                <div className={`max-w-2xl text-ink-soft ${size === "lg" ? "pb-8 text-[1.02rem]" : "pb-6 text-[0.98rem]"}`}>{it.body}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
