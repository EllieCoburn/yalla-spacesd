import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Renders handbook text so it's easy to scan, not a wall of words:
 * - the first paragraph is a lead, a little larger;
 * - "**Label**: text" paragraphs become small labeled blocks;
 * - "- **Term**: text" lists become cards; other lists get soft bullets;
 * - "1. " lists become numbered steps;
 * - "> " paragraphs become a highlighted "good to know" callout;
 * - times, prices, durations and percentages are picked out so they're easy to spot and remember.
 */

// Times and time ranges, money, durations, percentages, temperatures and ratios.
const NUM = new RegExp(
  [
    String.raw`~?\d{1,2}(?::\d{2})?\s?(?:am|pm)?\s?(?:[–-]|to)\s?\d{1,2}(?::\d{2})?\s?(?:am|pm)`,
    String.raw`\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b`,
    String.raw`\$\d[\d,]*(?:\.\d+)?(?:\s(?:a|per)\s(?:day|month))?`,
    String.raw`(?:~|\b)\d+(?:\.\d+)?\s?(?:–\s?\d+\s)?(?:business days|consecutive days|minutes|hours|days|weeks|months|years|ounces)\b`,
    String.raw`\+?\d+%`,
    String.raw`\b\d+°F(?: \(\d+°C\))?`,
    String.raw`(?:-)?\b\d+°F \(-?\d+°C\)`,
    String.raw`\b1 adult for every \d+ children`,
  ].join("|"),
  "gi",
);

function highlight(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(NUM)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={`${key}-n${i++}`} className="rounded-[0.35rem] bg-blue/[0.09] px-1 py-px font-medium whitespace-nowrap text-ink tabular-nums">
        {m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const linkCls = "text-blue underline decoration-blue/40 underline-offset-4 hover:decoration-blue";

export function inline(text: string, key: string, numbers = true): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  const plain = (s: string) => (numbers ? highlight(s, `${key}-${i++}`) : [s]);
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...plain(text.slice(last, m.index)));
    if (m[1]) {
      const href = m[2];
      out.push(
        href.startsWith("/") || href.startsWith("#") ? (
          <Link key={`${key}-l${i++}`} href={href} className={linkCls}>
            {m[1]}
          </Link>
        ) : (
          <a key={`${key}-l${i++}`} href={href} target="_blank" rel="noreferrer" className={linkCls}>
            {m[1]}
          </a>
        ),
      );
    } else {
      out.push(
        <strong key={`${key}-b${i++}`} className="font-medium text-ink">
          {m[3]}
        </strong>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...plain(text.slice(last)));
  return out;
}

const TERM = /^\*\*([^*]+)\*\*\s*[:–-]\s*([\s\S]*)$/;
/** Text after a label starts its own line, so it starts with a capital. */
const cap = (t: string) => (/^[a-z]/.test(t) ? t[0].toUpperCase() + t.slice(1) : t);

export function HandbookText({ text, lead = true, compact = false }: { text: string; lead?: boolean; compact?: boolean }) {
  const blocks = text.trim().split(/\n\s*\n/);
  let firstPara = lead;
  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {blocks.map((b, bi) => {
        const lines = b.split("\n").map((l) => l.trimEnd());
        const k = String(bi);

        // Callout: "> text"
        if (lines[0].startsWith("> ")) {
          return (
            <div key={k} className="flex gap-3 rounded-2xl border border-blue/25 bg-blue/[0.05] px-5 py-4 text-[0.98rem] leading-relaxed text-ink">
              <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue text-[0.7rem] font-semibold text-chalk">
                !
              </span>
              <p>{inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "), k)}</p>
            </div>
          );
        }

        // A list may follow an intro line: a bare label ("**Not permitted in any lunch**:") or a sentence.
        const introLine = lines.length > 1 && !/^(- |\d+\.\s)/.test(lines[0].trim()) ? lines[0] : null;
        const head = introLine?.match(/^\*\*([^*]+)\*\*:?\s*$/) ?? null;
        const listLines = introLine ? lines.slice(1) : lines;
        const intro = introLine && !head ? <HandbookText text={introLine} lead={false} compact /> : null;
        const isList = listLines.length > 0 && listLines.every((l) => /^- /.test(l.trim()));
        const isSteps = listLines.length > 0 && listLines.every((l) => /^\d+\.\s/.test(l.trim()));

        if (isSteps) {
          return (
            <div key={k}>
              {head ? <p className="eyebrow mb-3 text-[0.62rem] text-ink-soft">{head[1]}</p> : null}
              {intro ? <div className="mb-3">{intro}</div> : null}
              <ol className="space-y-2.5">
                {listLines.map((l, li) => (
                  <li key={li} className="flex gap-4 rounded-2xl border border-line bg-paper/70 px-4 py-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-[0.9rem] text-chalk">{li + 1}</span>
                    <span className="pt-0.5 text-[0.97rem] leading-relaxed text-ink-soft">{inline(l.trim().replace(/^\d+\.\s/, ""), `${k}-${li}`)}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        }

        if (isList) {
          const items = listLines.map((l) => l.trim().slice(2));
          const terms = items.map((t) => t.match(TERM));
          const allTerms = terms.every(Boolean);
          return (
            <div key={k}>
              {head ? <p className="eyebrow mb-3 text-[0.62rem] text-ink-soft">{head[1]}</p> : null}
              {intro ? <div className="mb-3">{intro}</div> : null}
              {allTerms ? (
                <ul className={`grid gap-2.5 ${items.length % 2 === 0 && items.every((t) => t.length < 190) ? "sm:grid-cols-2" : ""}`}>
                  {terms.map((t, li) => (
                    <li key={li} className="rounded-2xl border border-line bg-paper/70 px-4 py-3.5">
                      <span className="block font-serif text-[1.05rem] leading-snug text-ink">{inline(t![1], `${k}-${li}-t`, false)}</span>
                      <span className="mt-1 block text-[0.93rem] leading-relaxed text-ink-soft">{inline(cap(t![2]), `${k}-${li}`)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="space-y-2">
                  {items.map((t, li) => (
                    <li key={li} className="flex gap-3 text-[0.98rem] leading-relaxed text-ink-soft">
                      <span aria-hidden className="mt-[0.62em] h-1.5 w-1.5 shrink-0 rounded-full bg-blue/70" />
                      <span>{inline(t, `${k}-${li}`)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        }

        // "**Label**: text": a labeled block.
        const joined = lines.join(" ");
        const term = joined.match(TERM);
        if (term && term[1].length < 60) {
          firstPara = false;
          return (
            <div key={k} className="border-l-2 border-ink/10 pl-4">
              <p className="font-serif text-[1.08rem] text-ink">{inline(term[1], `${k}-t`, false)}</p>
              <p className="mt-1 text-[0.98rem] leading-relaxed text-ink-soft">{inline(cap(term[2]), k)}</p>
            </div>
          );
        }

        // Plain paragraph; keep line breaks (addresses, sign-offs).
        const isLead = firstPara && !compact;
        firstPara = false;
        return (
          <p key={k} className={isLead ? "text-[1.08rem] leading-relaxed text-ink" : "text-[0.98rem] leading-relaxed text-ink-soft"}>
            {lines.map((l, li) => (
              <span key={li}>
                {li ? <br /> : null}
                {inline(l, `${k}-${li}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** The numbers worth remembering in a section, as boxes. */
export function FactTiles({ facts }: { facts: { value: string; label: string }[] }) {
  return (
    <ul className={`grid gap-2.5 ${facts.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : facts.length === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
      {facts.map((f) => (
        <li key={f.label} className="rounded-2xl border border-ink/10 bg-chalk px-4 py-3.5 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
          <span className="block font-serif text-[1.5rem] leading-tight text-ink tabular-nums">{f.value}</span>
          <span className="mt-1 block text-[0.78rem] leading-snug text-ink-soft">{f.label}</span>
        </li>
      ))}
    </ul>
  );
}
