import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/admin/ui";
import { LateFeeReview } from "@/components/admin/late/LateFeeReview";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { flaggedLateCheckouts } from "@/lib/ops/late-fees";
import { fmtDate, fmtTime } from "@/lib/time";

export const metadata = { title: "Late sign-outs" };

/** Late sign-outs waiting for a decision. None are charged until an admin approves them. */
export default async function LateSignOutsPage() {
  const staff = await requirePermission("billing.view");
  const rows = await flaggedLateCheckouts(getDb());
  return (
    <>
      <PageHeader
        title="Late sign-outs to review"
        subtitle="Children signed out after the grace period. Nothing has been charged and families haven’t been told. Charge the fee (you can lower it) or dismiss it with a reason, such as an agreed extension or a family who forgot to check out at the kiosk."
      />
      {rows.length === 0 ? (
        <Empty title="Nothing to review">Late sign-outs appear here when a child is signed out after the grace period.</Empty>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-ink/8">
            {rows.map((r) => (
              <li key={r.fee.id} className="px-5 py-4">
                <LateFeeReview
                  fee={r.fee}
                  canManage={can(staff, "billing.manage")}
                  showMoney
                  who={
                    <>
                      <Link href={`/admin/families/${r.f.id}`} className="font-medium hover:text-blue">
                        {r.c.preferredName || r.c.firstName} {r.c.lastName}
                      </Link>
                      <span className="text-ink-soft">
                        {" "}
                        · {r.s.title ?? r.p.name}, {fmtDate(r.s.localDate, "EEE d MMM")} (ended {fmtTime(r.s.endsAt)})
                      </span>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
