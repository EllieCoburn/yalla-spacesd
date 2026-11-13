"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FaqAccordion, type FaqItem } from "./FaqAccordion";

export type FaqSection = { key: string; label: string; description: string; items: FaqItem[] };

/** Category tabs over one accordion. Switching category needs no page load and starts collapsed. */
export function FaqExplorer({ sections, initial, openId }: { sections: FaqSection[]; initial: string; openId: string | null }) {
  const [active, setActive] = useState(initial);
  const [opened, setOpened] = useState<string | null>(openId);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = sections.find((s) => s.key === active) ?? sections[0];

  // On narrow screens, keep the chosen category in view in the scrolling row.
  useEffect(() => {
    const i = sections.findIndex((s) => s.key === current.key);
    const el = tabs.current[i];
    const row = el?.closest(".overflow-x-auto");
    if (el && row) row.scrollTo({ left: Math.max(0, row.scrollLeft + el.getBoundingClientRect().left - row.getBoundingClientRect().left - 24) });
  }, [current.key, sections]);

  const choose = (key: string) => {
    if (key === active) return;
    setActive(key);
    setOpened(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("category", key);
      url.searchParams.delete("q");
      url.hash = "";
      window.history.replaceState(null, "", url);
    } catch {
      /* the page still works without updating the address */
    }
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = sections.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (next == null) return;
    e.preventDefault();
    choose(sections[next].key);
    tabs.current[next]?.focus();
  };

  return (
    <div>
      <h2 id="faq-topics" className="eyebrow text-ink-soft">
        What can we help you with?
      </h2>
      <div className="no-scrollbar -mx-[clamp(1.25rem,4vw,3.5rem)] mt-5 overflow-x-auto px-[clamp(1.25rem,4vw,3.5rem)] pb-1">
        <div role="tablist" aria-labelledby="faq-topics" className="flex w-max gap-2">
          {sections.map((s, i) => {
            const selected = s.key === current.key;
            return (
              <button
                key={s.key}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                id={`tab-${s.key}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls="faq-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(s.key)}
                onKeyDown={(e) => onKey(e, i)}
                className={`h-11 shrink-0 rounded-full border px-5 text-[0.92rem] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:ring-offset-2 focus-visible:ring-offset-chalk focus-visible:outline-none ${
                  selected ? "border-ink bg-ink text-chalk" : "border-ink/15 bg-transparent text-ink hover:border-ink/40"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div id="faq-panel" role="tabpanel" aria-labelledby={`tab-${current.key}`} className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 className="display text-[clamp(2rem,1.6rem+1.4vw,2.8rem)]">{current.label}</h2>
          <p className="mt-4 max-w-xs text-ink-soft">{current.description}</p>
        </div>
        <div className="lg:col-span-8">
          {current.items.length ? (
            <FaqAccordion key={current.key} items={current.items} openId={opened} />
          ) : (
            <p className="border-t border-line pt-6 text-ink-soft">Answers for this topic are on their way. In the meantime, we’re happy to help: hello@yallaspacesd.com.</p>
          )}
        </div>
      </div>
    </div>
  );
}
