/**
 * Yalla Admin UI kit (server-safe). Calm, legible, quick to scan: Lora for page titles, DM Sans for
 * everything operational, hairline structure, and status pills that pair an icon shape with text.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { statusOf, type Icon, type StatusKind, type Tone } from "@/lib/admin/status";

export const toneClass: Record<Tone, string> = {
  positive: "bg-[#e6f0ea] text-[#2c6447] ring-[#2c6447]/20",
  neutral: "bg-[#efeee9] text-ink ring-ink/10",
  info: "bg-[#e9e9fb] text-[#3d40b8] ring-[#3d40b8]/20",
  warning: "bg-[#f8eedd] text-[#8a5212] ring-[#8a5212]/25",
  critical: "bg-[#f6e3e5] text-[#8a2333] ring-[#8a2333]/25",
  muted: "bg-transparent text-ink-soft ring-ink/15",
};

function IconGlyph({ icon }: { icon: Icon }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden>
      {icon === "check" && <path d="M2.5 6.3l2.2 2.2L9.5 3.6" {...p} />}
      {icon === "dot" && <circle cx="6" cy="6" r="2.4" fill="currentColor" />}
      {icon === "clock" && (
        <g {...p}>
          <circle cx="6" cy="6" r="4.2" />
          <path d="M6 3.8V6l1.5 1" />
        </g>
      )}
      {icon === "alert" && (
        <g {...p}>
          <path d="M6 1.8l4.4 7.8H1.6z" />
          <path d="M6 5v1.8M6 8.2v.1" />
        </g>
      )}
      {icon === "x" && <path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6" {...p} />}
      {icon === "minus" && <path d="M3 6h6" {...p} />}
      {icon === "arrow" && <path d="M2.5 6h6.5M6.8 3.6L9.2 6 6.8 8.4" {...p} />}
    </svg>
  );
}

export function Pill({ tone, icon, children, className = "" }: { tone: Tone; icon?: Icon; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.75rem] font-medium whitespace-nowrap ring-1 ring-inset ${toneClass[tone]} ${className}`}>
      {icon ? <IconGlyph icon={icon} /> : null}
      {children}
    </span>
  );
}

export function Status({ kind, value, suffix }: { kind: StatusKind; value: string | null | undefined; suffix?: string }) {
  const s = statusOf(kind, value);
  return (
    <Pill tone={s.tone} icon={s.icon}>
      {s.label}
      {suffix ? <span className="font-normal opacity-80">· {suffix}</span> : null}
    </Pill>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 text-[0.8rem] text-ink-soft hover:text-ink">
            <span aria-hidden>←</span> {back.label}
          </Link>
        ) : null}
        <h1 className="font-serif text-[1.75rem] leading-tight tracking-[-0.015em] text-ink lg:text-[2rem]">{title}</h1>
        {subtitle ? <div className="mt-1.5 text-[0.9rem] text-ink-soft">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, actions, children, className = "", padded = true, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean; id?: string }) {
  return (
    <section id={id} className={`rounded-xl border border-ink/10 bg-[#fffefb] shadow-[0_1px_0_rgba(41,44,69,0.03)] ${className}`}>
      {title || actions ? (
        <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-5 py-3.5">
          {title ? <h2 className="text-[0.95rem] font-semibold text-ink">{title}</h2> : <span />}
          {actions ? <div className="flex items-center gap-2 text-[0.82rem]">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, href, tone }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: Tone }) {
  const inner = (
    <>
      <p className="text-[0.75rem] font-medium tracking-[0.04em] text-ink-soft uppercase">{label}</p>
      <p className={`mt-1.5 font-serif text-[1.9rem] leading-none tabular-nums ${tone === "critical" ? "text-[#8a2333]" : tone === "warning" ? "text-[#8a5212]" : "text-ink"}`}>{value}</p>
      {sub ? <p className="mt-2 text-[0.8rem] text-ink-soft">{sub}</p> : null}
    </>
  );
  const cls = "block rounded-xl border border-ink/10 bg-[#fffefb] p-4 transition-colors";
  return href ? (
    <Link href={href} className={`${cls} group hover:border-blue/50 hover:bg-white focus-visible:border-blue`}>
      {inner}
      <span className="mt-2 inline-block text-[0.75rem] text-blue opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">View records →</span>
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ink/15 px-6 py-10 text-center">
      <svg viewBox="0 0 40 40" className="h-9 w-9 text-blue/50" aria-hidden>
        <path d="M10 34V18a10 10 0 0 1 20 0v16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <p className="mt-3 text-[0.95rem] font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-[0.85rem] text-ink-soft">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div role={tone === "critical" ? "alert" : "status"} className={`rounded-lg px-4 py-3 text-[0.85rem] ring-1 ring-inset ${toneClass[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
    </div>
  );
}

export function DL({ items, cols = 2 }: { items: { label: string; value: ReactNode; full?: boolean }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-4 ${cols === 3 ? "sm:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : ""}`}>
      {items.map((i) => (
        <div key={i.label} className={i.full ? "sm:col-span-full" : ""}>
          <dt className="text-[0.72rem] font-medium tracking-[0.04em] text-ink-soft uppercase">{i.label}</dt>
          <dd className="mt-1 text-[0.9rem] text-ink">{i.value ?? <span className="text-ink-soft">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Semantic table that stays readable on phones (horizontal scroll inside the card). */
export function Table({ head, children, dense }: { head: ReactNode[]; children: ReactNode; dense?: boolean }) {
  return (
    <div className="-mx-px overflow-x-auto">
      <table className={`w-full min-w-[640px] text-left text-[0.85rem] ${dense ? "[&_td]:py-2" : "[&_td]:py-3"}`}>
        <thead>
          <tr className="border-b border-ink/10 text-[0.72rem] tracking-[0.04em] text-ink-soft uppercase">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-2.5 font-medium first:pl-5 last:pr-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/6 [&_td]:px-4 [&_td]:align-top [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_tr]:transition-colors [&_tr:hover]:bg-mist/30">{children}</tbody>
      </table>
    </div>
  );
}

export function Tabs({ tabs, current }: { tabs: { href: string; label: string; key: string; count?: number }[]; current: string }) {
  return (
    <nav className="no-scrollbar -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-ink/10" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`relative shrink-0 px-3 pt-1 pb-2.5 text-[0.86rem] transition-colors ${t.key === current ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}`}
        >
          {t.label}
          {t.count != null ? <span className="ml-1.5 rounded-full bg-ink/8 px-1.5 text-[0.7rem] tabular-nums">{t.count}</span> : null}
          {t.key === current ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue" /> : null}
        </Link>
      ))}
    </nav>
  );
}

export const btn = {
  primary: "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ink px-3.5 text-[0.84rem] font-medium text-chalk transition-colors hover:bg-blue disabled:cursor-not-allowed disabled:opacity-50",
  secondary: "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-3.5 text-[0.84rem] font-medium text-ink transition-colors hover:border-ink/40 disabled:opacity-50",
  danger: "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#8a2333] px-3.5 text-[0.84rem] font-medium text-white transition-colors hover:bg-[#6f1b29] disabled:opacity-50",
  ghost: "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-2.5 text-[0.84rem] text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink",
  link: "text-blue underline-offset-4 hover:underline",
};

export function LinkButton({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: keyof typeof btn }) {
  return (
    <Link href={href} className={btn[variant]}>
      {children}
    </Link>
  );
}

export const inputCls =
  "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.88rem] text-ink placeholder:text-ink/35 focus:border-blue focus:ring-2 focus:ring-blue/20 focus:outline-none disabled:bg-ink/5";

/** GET filter bar — filters live in the URL so views are shareable and bookmarkable. */
export function FilterBar({ children, action }: { children: ReactNode; action: string }) {
  return (
    <form action={action} className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-ink/10 bg-[#fffefb] p-3">
      {children}
      <button className={btn.secondary}>Apply</button>
      <Link href={action} className={btn.ghost}>
        Clear
      </Link>
    </form>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-[9rem] flex-col gap-1 text-[0.72rem] font-medium tracking-[0.04em] text-ink-soft uppercase">
      {label}
      <span className="normal-case tracking-normal">{children}</span>
    </label>
  );
}

export function Money({ cents, muted }: { cents: number | null | undefined; muted?: boolean }) {
  if (cents == null) return <span className="text-ink-soft">—</span>;
  const s = `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <span className={`tabular-nums ${muted ? "text-ink-soft" : ""}`}>{s}</span>;
}

export function Capacity({ used, capacity, remaining }: { used: number; capacity: number; remaining: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(capacity, 1)) * 100));
  const tone = remaining <= 0 ? "bg-[#8a2333]" : remaining <= 2 ? "bg-[#c08a3e]" : "bg-blue";
  return (
    <div className="min-w-[7rem]">
      <div className="flex items-baseline justify-between text-[0.8rem] tabular-nums">
        <span>
          {used}/{capacity}
        </span>
        <span className="text-ink-soft">{remaining <= 0 ? "Full" : `${remaining} left`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/8" role="img" aria-label={`${used} of ${capacity} spots used, ${remaining} remaining`}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
