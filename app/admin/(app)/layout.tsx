import { signOut } from "@/app/admin/(auth)/actions";
import { Shell, type NavItem } from "@/components/admin/Shell";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import type { Permission } from "@/lib/auth/permissions";
import { notificationsMode } from "@/lib/notify";
import { paymentsStatus } from "@/lib/payments/provider";
import { searchAll } from "./search-action";

const NAV: (NavItem & { perm: Permission | Permission[] })[] = [
  { href: "/admin", label: "Today", icon: "today", group: "Daily", perm: "dashboard.view", mobile: true },
  { href: "/admin/roster", label: "Roster", icon: "roster", group: "Daily", perm: "roster.view", mobile: true },
  { href: "/admin/bookings", label: "Bookings", icon: "bookings", group: "Daily", perm: "bookings.view", mobile: true },
  { href: "/admin/waitlist", label: "Waitlist", icon: "waitlist", group: "Daily", perm: "bookings.view" },
  { href: "/admin/spaces", label: "Space reservations", icon: "spaces", group: "Daily", perm: "spaces.view" },
  { href: "/admin/families", label: "Families", icon: "families", group: "People", perm: "families.view", mobile: true },
  { href: "/admin/memberships", label: "Club Yalla", icon: "memberships", group: "People", perm: "memberships.view" },
  { href: "/admin/forms", label: "Forms & waivers", icon: "forms", group: "People", perm: "forms.view" },
  { href: "/admin/schedule", label: "Schedule", icon: "schedule", group: "Programs", perm: "programs.view" },
  { href: "/admin/programs", label: "Programs", icon: "programs", group: "Programs", perm: "programs.view" },
  { href: "/admin/billing", label: "Billing", icon: "billing", group: "Business", perm: "billing.view" },
  { href: "/admin/communications", label: "Messages", icon: "messages", group: "Business", perm: "communications.view" },
  { href: "/admin/reports", label: "Reports", icon: "reports", group: "Business", perm: "reports.view" },
  { href: "/admin/settings", label: "Settings", icon: "settings", group: "Admin", perm: ["settings.manage", "staff.manage"] },
  { href: "/admin/audit", label: "Audit trail", icon: "audit", group: "Admin", perm: "audit.view" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const nav = NAV.filter((n) => (Array.isArray(n.perm) ? n.perm.some((p) => can(staff, p)) : can(staff, n.perm))).map(({ perm: _p, ...n }) => n);
  const pay = paymentsStatus();
  const mail = notificationsMode();
  const banners = (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-ink/8 bg-[#ecebf8] px-4 py-1.5 text-[0.74rem] text-[#3d40b8] sm:px-6 lg:px-10">
      {pay.provider === "test" ? <span>● Test payments — no real charges</span> : pay.live ? <span className="text-[#8a2333]">● LIVE payments</span> : <span>● Stripe test mode</span>}
      {mail === "test" ? <span>● Emails captured, not sent</span> : <span className="text-[#8a2333]">● Emails are being delivered</span>}
      {pay.problem ? <span className="text-[#8a5212]">{pay.problem}</span> : null}
      {staff.roleKey === "owner" && !staff.mfaEnabled ? (
        <a href="/admin/account" className="font-medium underline">
          Turn on two-step verification
        </a>
      ) : null}
    </div>
  );
  return (
    <Shell nav={nav} user={{ name: staff.name, role: staff.roleName }} banners={banners} search={searchAll} signOut={signOut}>
      {children}
    </Shell>
  );
}
