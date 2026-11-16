"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { askTeamYallaAction } from "@/app/(site)/portal/handbook/actions";
import { Markup } from "@/components/faq/FaqAnswer";
import { HANDBOOK, HANDBOOK_PROGRAMS, HANDBOOK_SECTIONS, HANDBOOK_YEAR, type HandbookEntry, type HandbookProgram, type HandbookSection } from "@/content/handbook";
import { answer as askHandbook, buildIndex, type HandbookAnswer } from "@/lib/handbook/search";

const PROGRAM_KEY = "yalla.handbook.program";
const DOT: Record<HandbookProgram, string> = { club: "bg-blue", flex: "bg-oxblood", camp: "bg-[#d8a23a]", happenings: "bg-ink" };
const TINT: Record<HandbookProgram, string> = {
  club: "border-blue/30 bg-blue/[0.05]",
  flex: "border-oxblood/25 bg-oxblood/[0.04]",
  camp: "border-[#d8a23a]/40 bg-[#d8a23a]/[0.07]",
  happenings: "border-ink/20 bg-ink/[0.035]",
};
const programName = (p: HandbookProgram) => HANDBOOK_PROGRAMS.find((x) => x.key === p)!.name;

/** A program named in the question itself ("…at Flex?"), used when no program is chosen. */
function programIn(text: string): HandbookProgram | null {
  const t = text.toLowerCase();
  if (/\bflex\b|drop[\s-]?in/.test(t)) return "flex";
  if (/\bclub\b|membership|tuition|cohort year/.test(t)) return "club";
  if (/\bcamp/.test(t)) return "camp";
  if (/happening|immersive|after hours|weekend play|pop[\s-]?up/.test(t)) return "happenings";
  return null;
}

const SUGGESTIONS = ["What should my child bring?", "What if I’m running late?", "Do I need to stay onsite?", "When are you closed?", "Can you give my child medicine?", "How do I cancel a booking?"];

/** The Family Handbook: pick your program, ask a question, or explore by topic. */
export function Handbook({ signedIn, firstName, email }: { signedIn: boolean; firstName: string | null; email: string | null }) {
  const index = useMemo(() => buildIndex(HANDBOOK_SECTIONS), []);
  const [program, setProgramState] = useState<HandbookProgram | null>(null);
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<{ q: string; result: HandbookAnswer } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string>(HANDBOOK[0].id);
  const answerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Remember the chosen program on this device.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROGRAM_KEY) as HandbookProgram | null;
      if (saved && HANDBOOK_PROGRAMS.some((p) => p.key === saved)) setProgramState(saved);
    } catch {}
  }, []);
  const setProgram = (p: HandbookProgram | null) => {
    setProgramState(p);
    try {
      if (p) localStorage.setItem(PROGRAM_KEY, p);
      else localStorage.removeItem(PROGRAM_KEY);
    } catch {}
    if (asked) setAsked({ q: asked.q, result: askHandbook(index, asked.q, p ?? programIn(asked.q)) });
  };

  // Open a section from the address bar (#section-id), e.g. from a link in an agreement.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id && HANDBOOK_SECTIONS.some((s) => s.id === id)) reveal(id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Highlight the chapter in view in the contents.
  useEffect(() => {
    const els = HANDBOOK.map((c) => document.getElementById(`chapter-${c.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id.replace("chapter-", ""));
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  function reveal(id: string, smooth = true) {
    setOpen((s) => new Set(s).add(id));
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
      history.replaceState(null, "", `#${id}`);
    });
  }

  function ask(text: string) {
    const t = text.trim();
    if (!t) return;
    setQ(t);
    setAsked({ q: t, result: askHandbook(index, t, program ?? programIn(t)) });
    requestAnimationFrame(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="pt-28 pb-24 lg:pt-36">
      {/* ── Hero ── */}
      <div className="shell">
        <Link href="/portal/home" className="eyebrow text-ink-soft hover:text-ink">
          ← Family Portal
        </Link>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <p className="eyebrow text-ink-soft">Family Handbook · {HANDBOOK_YEAR}</p>
            <h1 className="display mt-4 text-[clamp(2.6rem,1.9rem+2.8vw,4.6rem)] leading-[1.02]">
              Everything you need to know, <em>in one place.</em>
            </h1>
            <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-ink-soft">
              {firstName ? `Welcome, ${firstName}. ` : ""}How days at Yalla work, what to bring, how we care for your child, and the policies that keep our community thriving. Ask a question, or explore by topic.
            </p>
          </div>

          {/* Ask */}
          <div className="rounded-[1.75rem] border border-line bg-paper p-5 shadow-[0_1px_0_rgba(0,0,0,0.02),0_18px_40px_-28px_rgba(30,30,60,0.35)] sm:p-7">
            <p className="font-serif text-[1.35rem] text-ink">Ask the handbook</p>
            <p className="mt-1 text-[0.86rem] text-ink-soft">Ask in your own words. If the answer isn’t here, you can send your question to Team Yalla.</p>
            <form
              className="mt-4 flex items-center gap-2 rounded-full border border-ink/15 bg-chalk p-1.5 pl-5 focus-within:border-blue"
              onSubmit={(e) => {
                e.preventDefault();
                ask(q);
              }}
            >
              <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink-soft">
                <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="m13.5 13.5 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. What time is rest time?"
                aria-label="Ask the handbook a question"
                className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[1rem] focus:ring-0 focus:outline-none"
              />
              <button className="h-10 shrink-0 rounded-full bg-ink px-5 text-[0.9rem] text-chalk transition-colors hover:bg-blue">Ask</button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1.5 text-[0.8rem] text-ink-soft transition-colors hover:border-ink/30 hover:text-ink">
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Answer */}
        <div ref={answerRef} aria-live="polite" className="scroll-mt-32">
          {asked ? (
            <AnswerPanel
              key={asked.q + (program ?? "")}
              question={asked.q}
              result={asked.result}
              program={program ?? programIn(asked.q)}
              signedIn={signedIn}
              email={email}
              onOpen={(id) => reveal(id)}
              onClear={() => {
                setAsked(null);
                setQ("");
                inputRef.current?.focus();
              }}
            />
          ) : null}
        </div>

        {/* Program picker */}
        <section className="mt-14 border-t border-line pt-10" aria-labelledby="program-heading">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p id="program-heading" className="eyebrow text-ink-soft">
                Reading for
              </p>
              <p className="mt-2 max-w-lg text-[0.95rem] text-ink-soft">The handbook applies to every Yalla family. Choose your program to see the details that apply to you.</p>
            </div>
            <div role="radiogroup" aria-label="Choose your program" className="flex flex-wrap gap-2">
              <ProgramPill on={program === null} onClick={() => setProgram(null)} label="Every program" />
              {HANDBOOK_PROGRAMS.map((p) => (
                <ProgramPill key={p.key} on={program === p.key} onClick={() => setProgram(p.key)} label={p.name} dot={DOT[p.key]} />
              ))}
            </div>
          </div>
          {program ? (
            <p className={`mt-5 rounded-2xl border px-5 py-4 text-[0.92rem] text-ink ${TINT[program]}`}>
              <span className="font-medium">{programName(program)}:</span> {HANDBOOK_PROGRAMS.find((p) => p.key === program)!.line} Notes for {programName(program)} families are highlighted throughout, and sections that don’t apply are tucked away.
            </p>
          ) : null}
        </section>

        {/* Topics */}
        <section className="mt-14" aria-labelledby="topics-heading">
          <h2 id="topics-heading" className="display text-[clamp(1.8rem,1.5rem+1vw,2.4rem)]">
            Explore by <em>topic.</em>
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {HANDBOOK.map((c) => (
              <a
                key={c.id}
                href={`#chapter-${c.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById(`chapter-${c.id}`);
                  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: "smooth" });
                }}
                className="group flex gap-4 rounded-2xl border border-line bg-paper/60 p-5 transition-all hover:-translate-y-0.5 hover:border-ink/25 hover:bg-paper"
              >
                <span className="font-serif text-[1.6rem] leading-none text-blue">{c.number}</span>
                <span>
                  <span className="block font-serif text-[1.15rem] text-ink">{c.title}</span>
                  <span className="mt-1 block text-[0.84rem] leading-snug text-ink-soft">{c.blurb}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      </div>

      {/* ── The handbook ── */}
      <div className="shell mt-20 grid gap-12 lg:grid-cols-[15rem_1fr] xl:grid-cols-[17rem_1fr]">
        <nav aria-label="Handbook contents" className="hidden lg:block">
          <div className="sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto pr-2">
            <p className="eyebrow text-ink-soft">Contents</p>
            <ol className="mt-4 space-y-1">
              {HANDBOOK.map((c) => (
                <li key={c.id}>
                  <a
                    href={`#chapter-${c.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById(`chapter-${c.id}`);
                      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: "smooth" });
                    }}
                    className={`flex gap-3 rounded-lg px-3 py-2 text-[0.88rem] transition-colors ${active === c.id ? "bg-ink/[0.06] text-ink" : "text-ink-soft hover:text-ink"}`}
                  >
                    <span className="w-5 shrink-0 tabular-nums text-ink-soft/70">{c.number}</span>
                    {c.title}
                  </a>
                </li>
              ))}
            </ol>
            <div className="mt-8 rounded-2xl border border-line p-4">
              <p className="text-[0.86rem] text-ink">Can’t find something?</p>
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  setTimeout(() => inputRef.current?.focus(), 400);
                }}
                className="mt-2 text-[0.84rem] text-blue underline underline-offset-4"
              >
                Ask the handbook
              </button>
            </div>
          </div>
        </nav>

        {/* Mobile: jump to a topic */}
        <div className="lg:hidden">
          <label className="block">
            <span className="eyebrow text-ink-soft">Jump to a topic</span>
            <select
              className="mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[0.95rem]"
              defaultValue=""
              onChange={(e) => {
                const el = document.getElementById(`chapter-${e.target.value}`);
                if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 100, behavior: "smooth" });
              }}
            >
              <option value="" disabled>
                Choose a chapter
              </option>
              {HANDBOOK.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} · {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="min-w-0 space-y-20">
          {HANDBOOK.map((c) => (
            <section key={c.id} id={`chapter-${c.id}`} aria-labelledby={`chapter-${c.id}-title`} className="scroll-mt-28">
              <header className="border-b border-line pb-6">
                <p className="font-serif text-[2.6rem] leading-none text-blue/80">{c.number}</p>
                <h2 id={`chapter-${c.id}-title`} className="display mt-3 text-[clamp(2rem,1.6rem+1.6vw,3rem)]">
                  {c.title}
                </h2>
                <p className="mt-2 text-ink-soft">{c.blurb}</p>
              </header>
              <div className="divide-y divide-line">
                {c.sections.map((s) => (
                  <SectionItem key={s.id} s={s} program={program} open={open.has(s.id)} onToggle={() => toggle(s.id)} />
                ))}
              </div>
            </section>
          ))}

          <AskTeamCard signedIn={signedIn} email={email} program={program} />
        </div>
      </div>
    </div>
  );
}

function ProgramPill({ on, onClick, label, dot }: { on: boolean; onClick: () => void; label: string; dot?: string }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[0.88rem] transition-colors ${on ? "border-ink bg-ink text-chalk" : "border-line bg-paper text-ink hover:border-ink/30"}`}
    >
      {dot ? <span aria-hidden className={`h-2 w-2 rounded-full ${dot} ${on ? "ring-2 ring-chalk/70" : ""}`} /> : null}
      {label}
    </button>
  );
}

function SectionItem({ s, program, open, onToggle }: { s: HandbookSection; program: HandbookProgram | null; open: boolean; onToggle: () => void }) {
  const notFor = !!program && !!s.appliesTo && !s.appliesTo.includes(program);
  const notes = (Object.entries(s.programs ?? {}) as [HandbookProgram, string][]).filter(([, v]) => v);
  const [tab, setTab] = useState<HandbookProgram | null>(null);
  const shownTab = program && s.programs?.[program] ? program : tab;

  return (
    <article id={s.id} className={`scroll-mt-28 py-7 ${notFor && !open ? "opacity-60" : ""}`}>
      <button onClick={onToggle} aria-expanded={open} aria-controls={`${s.id}-body`} className="group flex w-full items-start justify-between gap-6 text-left">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-serif text-[1.35rem] leading-snug text-ink group-hover:text-blue">{s.title}</span>
            {s.appliesTo ? (
              <span className="flex flex-wrap gap-1.5">
                {s.appliesTo.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[0.68rem] tracking-wide text-ink-soft uppercase">
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[p]}`} />
                    {programName(p)}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
          {notFor && !open ? (
            <span className="mt-2 block text-[0.9rem] text-ink-soft">Not part of {programName(program!)}. Open to read anyway.</span>
          ) : (
            <span className="mt-2 block text-[0.98rem] leading-relaxed text-ink-soft">
              <Markup text={s.summary} />
            </span>
          )}
        </span>
        <span aria-hidden className={`mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-soft transition-transform duration-300 group-hover:border-ink/30 ${open ? "rotate-45" : ""}`}>
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {open ? (
        <div id={`${s.id}-body`} className="mt-5 max-w-[46rem]">
          <div className="space-y-4 text-[1rem] leading-relaxed text-ink-soft [&_strong]:text-ink">
            <Markup text={s.body} />
          </div>

          {notes.length ? (
            <div className="mt-7">
              {program && s.programs?.[program] ? null : (
                <div role="tablist" aria-label="Program details" className="flex flex-wrap gap-2">
                  {notes.map(([p]) => (
                    <button
                      key={p}
                      role="tab"
                      aria-selected={shownTab === p}
                      onClick={() => setTab(shownTab === p ? null : p)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.82rem] transition-colors ${shownTab === p ? "border-ink bg-ink text-chalk" : "border-line text-ink hover:border-ink/30"}`}
                    >
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[p]}`} />
                      For {programName(p)}
                    </button>
                  ))}
                </div>
              )}
              {shownTab && s.programs?.[shownTab] ? (
                <div className={`mt-3 rounded-2xl border p-5 ${TINT[shownTab]}`}>
                  <p className="eyebrow flex items-center gap-2 text-[0.62rem] text-ink-soft">
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[shownTab]}`} />
                    For {programName(shownTab)} families
                  </p>
                  <div className="mt-2.5 space-y-3 text-[0.96rem] leading-relaxed text-ink [&_ul]:text-ink-soft">
                    <Markup text={s.programs[shownTab]!} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function AnswerPanel({
  question,
  result,
  program,
  signedIn,
  email,
  onOpen,
  onClear,
}: {
  question: string;
  result: HandbookAnswer;
  program: HandbookProgram | null;
  signedIn: boolean;
  email: string | null;
  onOpen: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="mt-10 overflow-hidden rounded-[1.75rem] border border-line bg-paper">
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4 sm:px-8">
        <p className="text-[0.92rem] text-ink-soft">
          You asked: <span className="text-ink">“{question}”</span>
        </p>
        <button onClick={onClear} className="shrink-0 text-[0.82rem] text-ink-soft underline underline-offset-4 hover:text-ink">
          Clear
        </button>
      </div>
      {result.found ? (
        <div className="grid gap-8 px-6 py-7 sm:px-8 lg:grid-cols-[1fr_16rem]">
          <div className="min-w-0">
            <p className="eyebrow text-[0.62rem] text-blue">
              From the handbook · {result.best.entry.chapterTitle}
            </p>
            <h3 className="display mt-2 text-[1.7rem]">{result.best.entry.title}</h3>
            <div className="mt-3 text-[1.05rem] leading-relaxed text-ink">
              <Markup text={result.best.entry.summary} />
            </div>
            {result.excerpt.filter((p) => !sameText(p, result.best.entry.summary)).length ? (
              <div className="mt-4 space-y-3 border-l-2 border-blue/40 pl-4 text-[0.95rem] leading-relaxed text-ink-soft [&_strong]:text-ink">
                {result.excerpt
                  .filter((p) => !sameText(p, result.best.entry.summary))
                  .map((p, i) => (
                    <Markup key={i} text={p.replace(/^\d+\.\s/, "- ")} />
                  ))}
              </div>
            ) : null}
            {program && result.best.entry.programs?.[program] && !result.excerpt.some((p) => result.best.entry.programs![program]!.includes(p)) ? (
              <div className={`mt-5 rounded-2xl border p-4 ${TINT[program]}`}>
                <p className="eyebrow text-[0.6rem] text-ink-soft">For {programName(program)} families</p>
                <div className="mt-2 space-y-2 text-[0.94rem] leading-relaxed text-ink">
                  <Markup text={result.best.entry.programs[program]!} />
                </div>
              </div>
            ) : null}
            <button onClick={() => onOpen(result.best.entry.id)} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[0.9rem] text-chalk transition-colors hover:bg-blue">
              Read the full section <span aria-hidden>→</span>
            </button>
            <MiniAsk question={question} signedIn={signedIn} email={email} program={program} section={result.best.entry.title} />
          </div>
          {result.related.length ? <Related hits={result.related.map((h) => h.entry)} onOpen={onOpen} /> : null}
        </div>
      ) : (
        <div className="grid gap-8 px-6 py-7 sm:px-8 lg:grid-cols-[1fr_16rem]">
          <div>
            <p className="display text-[1.6rem]">We couldn’t find that in the handbook.</p>
            <p className="mt-2 max-w-lg text-[0.95rem] text-ink-soft">Send your question to Team Yalla and we’ll reply by email, usually within 72 hours. You can also try asking another way.</p>
            <AskForm initial={question} searched={question} signedIn={signedIn} email={email} program={program} />
          </div>
          {result.related.length ? <Related title="These might help" hits={result.related.map((h) => h.entry)} onOpen={onOpen} /> : null}
        </div>
      )}
    </div>
  );
}

const sameText = (a: string, b: string) => a.replace(/\W/g, "").toLowerCase() === b.replace(/\W/g, "").toLowerCase();

function Related({ hits, onOpen, title = "Also in the handbook" }: { hits: HandbookEntry[]; onOpen: (id: string) => void; title?: string }) {
  return (
    <aside>
      <p className="eyebrow text-[0.6rem] text-ink-soft">{title}</p>
      <ul className="mt-3 space-y-2">
        {hits.map((e) => (
          <li key={e.id}>
            <button onClick={() => onOpen(e.id)} className="group w-full rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-ink/25 hover:bg-chalk">
              <span className="block text-[0.7rem] text-ink-soft">{e.chapterTitle}</span>
              <span className="block text-[0.92rem] text-ink group-hover:text-blue">{e.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** "Still not quite it?": a small prompt under an answer, opening the question form. */
function MiniAsk(props: { question: string; signedIn: boolean; email: string | null; program: HandbookProgram | null; section: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mt-6 border-t border-line pt-5">
      {show ? (
        <AskForm initial={props.question} searched={props.question} signedIn={props.signedIn} email={props.email} program={props.program} section={props.section} />
      ) : (
        <p className="text-[0.88rem] text-ink-soft">
          Not quite what you needed?{" "}
          <button onClick={() => setShow(true)} className="text-blue underline underline-offset-4">
            Ask Team Yalla
          </button>
        </p>
      )}
    </div>
  );
}

function AskForm({ initial, searched, signedIn, email, program, section, dark = false }: { initial: string; searched?: string; signedIn: boolean; email: string | null; program: HandbookProgram | null; section?: string; dark?: boolean }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<{ ok: true; email: string } | { ok: false; error: string } | null>(null);
  const [pending, start] = useTransition();

  if (state?.ok)
    return (
      <div className={`mt-5 rounded-2xl border p-5 ${dark ? "border-chalk/20 bg-chalk/[0.06]" : "border-blue/30 bg-blue/[0.05]"}`}>
        <p className={`font-serif text-[1.15rem] ${dark ? "text-chalk" : "text-ink"}`}>Thank you, your question is with Team Yalla.</p>
        <p className={`mt-1 text-[0.9rem] ${dark ? "text-chalk/70" : "text-ink-soft"}`}>
          We’ll reply to <span className={dark ? "text-chalk" : "text-ink"}>{state.email}</span>, usually within 72 hours. If it’s urgent, please call 619.775.4008.
        </p>
      </div>
    );

  return (
    <form
      className="mt-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setState(await askTeamYallaAction({ question: text, searched, program: program ? programName(program) : null, section: section ?? null })));
      }}
    >
      <label className="block">
        <span className={`text-[0.82rem] ${dark ? "text-chalk/80" : "text-ink"}`}>Your question for Team Yalla</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={dark ? "What would you like to know?" : undefined}
          className={`mt-2 w-full rounded-2xl border px-4 py-3 text-[0.98rem] focus:border-blue focus:ring-0 focus:outline-none ${dark ? "border-chalk/25 bg-[#33365a] text-chalk placeholder:text-chalk/40" : "border-ink/15 bg-chalk"}`}
        />
      </label>
      {state && !state.ok ? <p className={`mt-2 text-[0.85rem] ${dark ? "text-[#ffb4b4]" : "text-oxblood"}`}>{state.error}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button
          disabled={pending || !signedIn || text.trim().length < 3}
          className={`inline-flex h-11 items-center rounded-full px-6 text-[0.9rem] transition-colors hover:bg-blue disabled:cursor-not-allowed disabled:opacity-50 ${dark ? "bg-chalk text-ink hover:text-chalk" : "bg-ink text-chalk"}`}
        >
          {pending ? "Sending…" : "Send to Team Yalla"}
        </button>
        <span className={`text-[0.8rem] ${dark ? "text-chalk/60" : "text-ink-soft"}`}>{signedIn && email ? `We’ll reply to ${email}.` : "Sign in to the Family Portal to send a question."}</span>
      </div>
    </form>
  );
}

function AskTeamCard({ signedIn, email, program }: { signedIn: boolean; email: string | null; program: HandbookProgram | null }) {
  return (
    <section className="rounded-[1.75rem] bg-ink px-6 py-9 text-chalk sm:px-10 sm:py-12">
      <p className="eyebrow text-chalk/60">Still wondering?</p>
      <h2 className="display mt-3 text-[clamp(1.9rem,1.5rem+1.4vw,2.8rem)] text-chalk">
        Ask <em>Team Yalla.</em>
      </h2>
      <p className="mt-3 max-w-lg text-chalk/75">If something isn’t covered here, send us your question and we’ll get back to you by email, usually within 72 hours.</p>
      <div className="mt-2 max-w-xl">
        <AskForm initial="" signedIn={signedIn} email={email} program={program} dark />
      </div>
    </section>
  );
}
