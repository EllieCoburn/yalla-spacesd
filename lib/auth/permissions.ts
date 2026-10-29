/**
 * Staff permissions. Roles are editable sets of these keys (Settings → Staff & roles).
 * Every server action and data loader checks the specific permission it needs.
 */

export const PERMISSION_GROUPS = [
  {
    group: "Overview",
    items: [{ key: "dashboard.view", label: "View dashboard" }],
  },
  {
    group: "Programs & schedule",
    items: [
      { key: "programs.view", label: "View programs and schedules" },
      { key: "programs.manage", label: "Create and edit programs" },
      { key: "schedule.manage", label: "Add and change sessions" },
      { key: "capacity.override", label: "Authorize capacity overrides (never past hard capacity)" },
    ],
  },
  {
    group: "Bookings",
    items: [
      { key: "bookings.view", label: "View bookings" },
      { key: "bookings.manage", label: "Create, move and cancel bookings" },
      { key: "waitlist.manage", label: "Manage waitlists and offers" },
      { key: "memberships.view", label: "View Club Yalla memberships" },
      { key: "memberships.manage", label: "Manage memberships" },
    ],
  },
  {
    group: "Families & children",
    items: [
      { key: "families.view", label: "View families and contact details" },
      { key: "families.manage", label: "Edit family and child records" },
      { key: "children.care", label: "See allergies, care information and departure contacts" },
      { key: "children.staffNotes", label: "See and write staff-only notes" },
    ],
  },
  {
    group: "Workspaces",
    items: [
      { key: "spaces.view", label: "View workspace reservations, including who booked" },
      { key: "spaces.manage", label: "Create, change and cancel workspace reservations and closures" },
      { key: "spaces.configure", label: "Edit workspaces, rates and reservation policies" },
    ],
  },
  {
    group: "Rosters & attendance",
    items: [
      { key: "roster.view", label: "View daily rosters" },
      { key: "attendance.manage", label: "Check children in and out" },
    ],
  },
  {
    group: "Forms & waivers",
    items: [
      { key: "forms.view", label: "See paperwork status" },
      { key: "forms.documents", label: "Open completed forms and documents" },
      { key: "forms.manage", label: "Create forms, versions and requirements" },
    ],
  },
  {
    group: "Billing",
    items: [
      { key: "billing.view", label: "View invoices and payments" },
      { key: "billing.manage", label: "Create invoices, credits and offline payments" },
      { key: "billing.refund", label: "Issue refunds" },
    ],
  },
  {
    group: "Communications & reports",
    items: [
      { key: "communications.view", label: "View communication history" },
      { key: "communications.manage", label: "Edit templates and send messages" },
      { key: "reports.view", label: "Operational reports" },
      { key: "reports.financial", label: "Financial reports" },
      { key: "reports.export", label: "Export CSV" },
    ],
  },
  {
    group: "Administration",
    items: [
      { key: "settings.manage", label: "Settings, locations and policies" },
      { key: "staff.manage", label: "Staff accounts and roles" },
      { key: "audit.view", label: "Audit trail" },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["items"][number]["key"];
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)) as Permission[];

export const DEFAULT_ROLES: { key: string; name: string; description: string; permissions: Permission[] }[] = [
  {
    key: "owner",
    name: "Owner / Administrator",
    description: "Full access, including staff, settings and refunds.",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "operations",
    name: "Operations",
    description: "Programs, schedules, families, bookings, memberships and paperwork.",
    permissions: [
      "dashboard.view",
      "programs.view",
      "programs.manage",
      "schedule.manage",
      "bookings.view",
      "bookings.manage",
      "waitlist.manage",
      "memberships.view",
      "memberships.manage",
      "spaces.view",
      "spaces.manage",
      "families.view",
      "families.manage",
      "children.care",
      "children.staffNotes",
      "roster.view",
      "attendance.manage",
      "forms.view",
      "forms.documents",
      "forms.manage",
      "billing.view",
      "communications.view",
      "communications.manage",
      "reports.view",
      "reports.export",
    ],
  },
  {
    key: "educator",
    name: "Educator",
    description: "Rosters, attendance, care information and departure contacts — no billing.",
    permissions: ["dashboard.view", "programs.view", "bookings.view", "families.view", "children.care", "roster.view", "attendance.manage", "forms.view"],
  },
  {
    key: "billing",
    name: "Billing",
    description: "Invoices, payments, refunds and financial reports.",
    permissions: [
      "dashboard.view",
      "bookings.view",
      "memberships.view",
      "families.view",
      "billing.view",
      "billing.manage",
      "billing.refund",
      "communications.view",
      "reports.view",
      "reports.financial",
      "reports.export",
    ],
  },
];

export const PERMISSION_ITEMS: { key: Permission; label: string; group: string }[] = PERMISSION_GROUPS.flatMap((g) =>
  (g.items as readonly { key: string; label: string }[]).map((i) => ({ key: i.key as Permission, label: i.label, group: g.group })),
);
