import Link from "next/link";
import type { ReactNode } from "react";
import type { Faq } from "@/content/faq";
import { policyById, policyHref } from "@/content/policies";

const linkCls = "text-ink underline decoration-blue/40 underline-offset-4 hover:text-blue hover:decoration-blue";

/** [words](/link) and **bold** inside a line. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      const href = m[2];
      out.push(
        href.startsWith("/") || href.startsWith("#") ? (
          <Link key={`${key}-${i++}`} href={href} className={linkCls}>
            {m[1]}
          </Link>
        ) : (
          <a key={`${key}-${i++}`} href={href} target="_blank" rel="noreferrer" className={linkCls}>
            {m[1]}
          </a>
        ),
      );
    } else {
      out.push(
        <strong key={`${key}-${i++}`} className="font-medium text-ink">
          {m[3]}
        </strong>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Paragraphs (blank line between) and "- " lists. */
export function Markup({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        if (lines.every((l) => l.trim().startsWith("- ")))
          return (
            <ul key={bi} className="space-y-1.5 pl-1">
              {lines.map((l, li) => (
                <li key={li} className="flex gap-3">
                  <span aria-hidden className="mt-[0.7em] h-1 w-1 shrink-0 rounded-full bg-blue/60" />
                  <span>{inline(l.trim().slice(2), `${bi}-${li}`)}</span>
                </li>
              ))}
            </ul>
          );
        return <p key={bi}>{inline(lines.join(" "), String(bi))}</p>;
      })}
    </>
  );
}

/** A FAQ's answer: its own words, or the approved policy it points to. */
export function FaqAnswer({ faq, policyLink = true }: { faq: Pick<Faq, "answer" | "policy">; policyLink?: boolean }) {
  const policy = faq.policy ? policyById(faq.policy) : null;
  if (faq.policy && policy)
    return (
      <div className="space-y-5">
        {policy.sections.map((s, i) => (
          <div key={i} className="space-y-3">
            {s.heading ? <p className="eyebrow text-[0.62rem] text-ink">{s.heading}</p> : null}
            {s.paragraphs.map((p, j) => (
              <Markup key={j} text={p} />
            ))}
          </div>
        ))}
        {policyLink ? (
          <p>
            <Link href={policyHref(policy.id)} className={linkCls}>
              View in Policies &amp; Terms
            </Link>
          </p>
        ) : null}
      </div>
    );
  return (
    <div className="space-y-4">
      <Markup text={faq.answer} />
    </div>
  );
}
