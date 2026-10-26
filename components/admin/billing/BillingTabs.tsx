"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/billing", label: "Overview" },
  { href: "/admin/billing/invoices", label: "Invoices" },
  { href: "/admin/billing/payments", label: "Payments" },
  { href: "/admin/billing/refunds", label: "Refunds" },
  { href: "/admin/billing/credits", label: "Credits" },
  { href: "/admin/billing/scheduled", label: "Scheduled charges" },
  { href: "/admin/billing/discounts", label: "Discounts" },
];

export function BillingTabs() {
  const path = usePathname();
  const active = (h: string) => (h === "/admin/billing" ? path === h : path.startsWith(h));
  return (
    <nav className="no-scrollbar -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-ink/10" aria-label="Billing sections">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active(t.href) ? "page" : undefined}
          className={`relative shrink-0 px-3 pt-1 pb-2.5 text-[0.86rem] transition-colors ${active(t.href) ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}`}
        >
          {t.label}
          {active(t.href) ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue" /> : null}
        </Link>
      ))}
    </nav>
  );
}
