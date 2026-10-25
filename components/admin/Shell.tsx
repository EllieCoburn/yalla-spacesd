"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";

export type NavItem = { href: string; label: string; icon: string; group: string; mobile?: boolean };
export type SearchResult = { href: string; title: string; detail: string; type: string };

const ICONS: Record<string, ReactNode> = {
  today: <path d="M4 10.5 12 4l8 6.5V20H4z M9.5 20v-5.5h5V20" />,
  roster: <path d="M7 4h10v16H7z M10 8h4 M10 12h4 M10 16h2" />,
  bookings: <path d="M5 6h14v13H5z M5 10h14 M9 3.5v4 M15 3.5v4" />,
  schedule: <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 8v4l3 2" />,
  programs: <path d="M7 20V9a5 5 0 0 1 10 0v11" />,
  families: <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M3.5 20c0-3 2.2-5.5 5-5.5s5 2.5 5 5.5 M13.5 20c.3-2.4 1.5-4.4 3-4.4 2 0 3.5 2 3.5 4.4" />,
  memberships: <path d="M5 20V8l7-4 7 4v12 M9 20v-6h6v6" />,
  waitlist: <path d="M5 7h14 M5 12h10 M5 17h6" />,
  forms: <path d="M7 3.5h7l4 4V20H7z M14 3.5V8h4 M10 13h5 M10 16.5h5" />,
  billing: <path d="M4 7h16v11H4z M4 10.5h16 M8 15h3" />,
  messages: <path d="M4 6h16v11H8l-4 3z" />,
  reports: <path d="M5 20V10 M10 20V4 M15 20v-7 M20 20v-4" />,
  settings: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 3v2.5 M12 18.5V21 M3 12h2.5 M18.5 12H21 M5.6 5.6l1.8 1.8 M16.6 16.6l1.8 1.8 M5.6 18.4l1.8-1.8 M16.6 7.4l1.8-1.8" />,
  audit: <path d="M12 3.5 5 6.5v5c0 4 3 7.5 7 9 4-1.5 7-5 7-9v-5z M9 12l2 2 4-4" />,
  search: <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.5 15.5 20 20" />,
  menu: <path d="M4 7h16 M4 12h16 M4 17h16" />,
};

export function NavIcon({ name, className = "h-[18px] w-[18px]" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export function Shell({
  nav,
  user,
  banners,
  children,
  search,
  signOut,
}: {
  nav: NavItem[];
  user: { name: string; role: string };
  banners: ReactNode;
  children: ReactNode;
  search: (q: string) => Promise<SearchResult[]>;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/"));
  const groups = [...new Set(nav.map((n) => n.group))];

  const navList = (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1.5 px-3 text-[0.66rem] font-semibold tracking-[0.16em] text-ink-soft/70 uppercase">{g}</p>
          <ul className="space-y-0.5">
            {nav
              .filter((n) => n.group === g)
              .map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active(n.href) ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[0.86rem] transition-colors ${
                      active(n.href) ? "bg-ink text-chalk" : "text-ink/80 hover:bg-ink/5 hover:text-ink"
                    }`}
                  >
                    <NavIcon name={n.icon} />
                    {n.label}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const userBox = (
    <div className="border-t border-ink/10 pt-4">
      <p className="truncate px-3 text-[0.85rem] font-medium text-ink">{user.name}</p>
      <p className="truncate px-3 text-[0.75rem] text-ink-soft">{user.role}</p>
      <div className="mt-2 flex gap-1 px-1">
        <Link href="/admin/account" className="rounded-md px-2 py-1 text-[0.78rem] text-ink-soft hover:bg-ink/5 hover:text-ink">
          Account & security
        </Link>
        <form action={signOut}>
          <button className="rounded-md px-2 py-1 text-[0.78rem] text-ink-soft hover:bg-ink/5 hover:text-ink">Sign out</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[15.5rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto border-r border-ink/10 bg-chalk px-3 py-5 lg:flex">
        <Link href="/admin" className="flex items-center gap-2.5 px-3 text-blue">
          <Mark name="wordmark" className="h-7 w-auto" />
          <span className="mt-1 text-[0.66rem] font-semibold tracking-[0.2em] text-ink-soft uppercase">Admin</span>
        </Link>
        <button
          onClick={() => setPaletteOpen(true)}
          className="mx-1 flex items-center gap-2 rounded-lg border border-ink/12 bg-white px-3 py-2 text-left text-[0.82rem] text-ink-soft hover:border-ink/30"
        >
          <NavIcon name="search" className="h-4 w-4" />
          Search families, bookings…
          <kbd className="ml-auto rounded border border-ink/15 px-1.5 text-[0.68rem]">⌘K</kbd>
        </button>
        <div className="flex-1">{navList}</div>
        {userBox}
      </aside>

      <div className="min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink/10 bg-chalk/95 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/admin" className="flex items-center gap-2 text-blue">
            <Mark name="wordmark" className="h-6 w-auto" />
            <span className="text-[0.62rem] font-semibold tracking-[0.2em] text-ink-soft uppercase">Admin</span>
          </Link>
          <div className="flex items-center gap-1">
            <button onClick={() => setPaletteOpen(true)} className="rounded-lg p-2 text-ink" aria-label="Search">
              <NavIcon name="search" />
            </button>
            <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-ink" aria-label="Open menu" aria-expanded={drawer}>
              <NavIcon name="menu" />
            </button>
          </div>
        </header>
        {banners}
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-9 lg:pb-16">
          {children}
        </main>
        {/* Mobile bottom tabs for the most-used views */}
        <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-ink/10 bg-chalk/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {nav
            .filter((n) => n.mobile)
            .slice(0, 3)
            .map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[0.68rem] ${active(n.href) ? "text-blue" : "text-ink-soft"}`}>
                <NavIcon name={n.icon} />
                {n.label}
              </Link>
            ))}
          <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 text-[0.68rem] text-ink-soft">
            <NavIcon name="menu" />
            More
          </button>
        </nav>
      </div>

      {/* Mobile drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-ink/30" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[82%] max-w-xs flex-col gap-6 overflow-y-auto bg-chalk px-3 py-5">
            {navList}
            {userBox}
          </div>
        </div>
      ) : null}

      {paletteOpen ? <Palette onClose={() => setPaletteOpen(false)} search={search} nav={nav} /> : null}
    </div>
  );
}

function Palette({ onClose, search, nav }: { onClose: () => void; search: (q: string) => Promise<SearchResult[]>; nav: NavItem[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [idx, setIdx] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) return setResults([]);
      start(async () => {
        setResults(await search(q));
        setIdx(0);
      });
    }, 160);
    return () => clearTimeout(t);
  }, [q, search]);
  const items: SearchResult[] = q.trim().length < 2 ? nav.map((n) => ({ href: n.href, title: n.label, detail: "Go to", type: "Page" })) : results;
  const go = (r?: SearchResult) => {
    if (!r) return;
    onClose();
    router.push(r.href);
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/30 p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-ink/10 px-4">
          <NavIcon name="search" className="h-5 w-5 text-ink-soft" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") setIdx((i) => Math.min(i + 1, items.length - 1));
              if (e.key === "ArrowUp") setIdx((i) => Math.max(i - 1, 0));
              if (e.key === "Enter") go(items[idx]);
            }}
            placeholder="Family, child, guardian email, booking reference…"
            className="h-14 flex-1 border-0 bg-transparent text-[0.95rem] focus:ring-0 focus:outline-none"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
          />
          {pending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/30 border-r-transparent" aria-hidden /> : null}
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 ? <li className="px-3 py-6 text-center text-[0.85rem] text-ink-soft">{q.trim().length < 2 ? "Type at least two characters." : "No matches."}</li> : null}
          {items.map((r, i) => (
            <li key={r.href + i} role="option" aria-selected={i === idx}>
              <button onMouseEnter={() => setIdx(i)} onClick={() => go(r)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left ${i === idx ? "bg-mist/70" : ""}`}>
                <span className="min-w-0">
                  <span className="block truncate text-[0.88rem] text-ink">{r.title}</span>
                  <span className="block truncate text-[0.75rem] text-ink-soft">{r.detail}</span>
                </span>
                <span className="shrink-0 rounded-full bg-ink/6 px-2 py-0.5 text-[0.68rem] text-ink-soft">{r.type}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
