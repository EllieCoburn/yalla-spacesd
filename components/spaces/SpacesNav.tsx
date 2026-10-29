import Link from "next/link";

/** Header shared by the Book a Space pages. */
export function SpacesHeader({ current, preview }: { current: "book" | "reservations"; preview: boolean }) {
  const tabs = [
    { key: "book", label: "Book a Space", href: "/portal/spaces" },
    { key: "reservations", label: "My Reservations", href: "/portal/spaces/reservations" },
  ];
  return (
    <div className="shell">
      <Link href="/portal/home" className="text-[0.85rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">
        ← Family Portal
      </Link>
      <nav aria-label="Book a Space" className="mt-8 flex gap-8 border-b border-line">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} aria-current={current === t.key ? "page" : undefined} className={`relative pb-4 text-[0.92rem] ${current === t.key ? "text-ink" : "text-ink-soft hover:text-ink"}`}>
            {t.label}
            {current === t.key ? <span className="absolute inset-x-0 -bottom-px h-[2px] bg-blue" /> : null}
          </Link>
        ))}
      </nav>
      {preview ? (
        <p className="mt-6 max-w-2xl border-l-2 border-oxblood/40 pl-4 text-[0.82rem] text-oxblood">
          Preview while the portal is being built: no sign-in needed. You’re browsing as a made-up sample family, and reservations made here are test reservations under that family.
        </p>
      ) : null}
    </div>
  );
}
