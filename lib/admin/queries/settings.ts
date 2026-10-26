import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { capacityPools, cohorts, locations, roles, staffUsers } from "@/lib/db/schema";
import { notificationsMode } from "@/lib/notify";
import { paymentsStatus } from "@/lib/payments/provider";

export async function staffDirectory(db: Executor) {
  return db.select({ u: staffUsers, r: roles }).from(staffUsers).innerJoin(roles, eq(roles.id, staffUsers.roleId)).orderBy(asc(staffUsers.name));
}

export async function allRoles(db: Executor) {
  return db.select().from(roles).orderBy(desc(roles.isSystem), asc(roles.name));
}

export async function locationsCohortsPools(db: Executor) {
  const [locs, cos, pools] = await Promise.all([
    db.select().from(locations).orderBy(asc(locations.name)),
    db.select().from(cohorts).orderBy(asc(cohorts.sortOrder), asc(cohorts.name)),
    db.select().from(capacityPools).orderBy(asc(capacityPools.name)),
  ]);
  return { locations: locs, cohorts: cos, pools };
}

/** Configuration status only — never the secret values. */
export function systemStatus() {
  const set = (k: string) => !!process.env[k];
  const secret = process.env.AUTH_SECRET ?? "";
  return {
    payments: paymentsStatus(),
    notifications: notificationsMode(),
    env: [
      { key: "DATABASE_URL", label: "Database", ok: set("DATABASE_URL"), required: true },
      { key: "AUTH_SECRET", label: "Session & MFA encryption secret (32+ characters)", ok: secret.length >= 32 && !secret.startsWith("dev-only"), required: true, note: secret.startsWith("dev-only") ? "Development value — replace on the live site." : undefined },
      { key: "ADMIN_SETUP_TOKEN", label: "First-time setup token", ok: set("ADMIN_SETUP_TOKEN"), required: false },
      { key: "PUBLIC_BASE_URL", label: "Public site address (used in emailed links)", ok: set("PUBLIC_BASE_URL"), required: false },
      { key: "STRIPE_SECRET_KEY", label: "Stripe secret key", ok: set("STRIPE_SECRET_KEY"), required: false },
      { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe webhook signing secret", ok: set("STRIPE_WEBHOOK_SECRET"), required: false },
      { key: "PAYMENTS_LIVE_ENABLED", label: "Live payments switch", ok: process.env.PAYMENTS_LIVE_ENABLED === "true", required: false },
      { key: "RESEND_API_KEY", label: "Email delivery (Resend) API key", ok: set("RESEND_API_KEY"), required: false },
      { key: "NOTIFICATIONS_FROM", label: "Email sender address", ok: set("NOTIFICATIONS_FROM"), required: false },
      { key: "NOTIFICATIONS_MODE", label: "Email mode set to live", ok: process.env.NOTIFICATIONS_MODE === "live", required: false },
      { key: "CRON_SECRET", label: "Scheduled jobs secret", ok: set("CRON_SECRET"), required: false },
    ],
  };
}
