import { BillingTabs } from "@/components/admin/billing/BillingTabs";
import { requirePermission } from "@/lib/auth/session";

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("billing.view");
  return (
    <>
      <BillingTabs />
      {children}
    </>
  );
}
