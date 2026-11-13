import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { ActionForm, MoneyField, TextArea } from "@/components/admin/forms";
import { Card, DL, Empty, Money, Notice, PageHeader, Table } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { bookingItems, bookings, families, programs, sessions } from "@/lib/db/schema";
import { familyEmail } from "@/lib/playpass/admin";
import { familyPlayPass } from "@/lib/playpass/membership";
import { allocationsWithUse } from "@/lib/playpass/wallet";
import { fmtDate, fmtTime } from "@/lib/time";
import { adjustWalletAction, simulateRenewalAction } from "../actions";

export const metadata = { title: "Play Pass family" };

const KIND: Record<string, string> = {
  allocation: "Monthly allocation",
  booking_debit: "Booking",
  booking_refund: "Returned (cancellation or refund)",
  adjustment: "Adjustment",
  expiration: "Expiration",
  payment_reversal: "Payment reversal",
};
const STATUS: Record<string, string> = { active: "Active", past_due: "Payment failed (retrying)", pending: "Setting up", canceled: "Ended" };

export default async function FamilyPlayPass({ params }: { params: Promise<{ familyId: string }> }) {
  const staff = await requirePermission("playpass.view");
  const { familyId } = await params;
  const db = getDb();
  const [f] = await db.select().from(families).where(eq(families.id, familyId));
  if (!f) notFound();
  const g = await familyEmail(db, familyId);
  const { sub, plan, nextPlan, wallet, activity, charges } = await familyPlayPass(db, familyId);
  const allocations = await allocationsWithUse(db, familyId);
  const upcoming = await db
    .select({ i: bookingItems, b: bookings, s: sessions, p: programs })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(eq(bookings.familyId, familyId), inArray(bookingItems.status, ["confirmed", "held"]), gt(sessions.endsAt, new Date())))
    .orderBy(asc(sessions.startsAt))
    .limit(12);
  const manage = can(staff, "playpass.manage");

  return (
    <>
      <PageHeader title={f.name} subtitle={g ? `${g.firstName} ${g.lastName} · ${g.email}` : undefined} back={{ href: "/admin/play-passes?tab=members", label: "Play Pass members" }} />
      {sub?.status === "past_due" ? (
        <div className="mb-5">
          <Notice tone="warning" title="Payment failed">
            {sub.lastFailureReason ?? "The last renewal didn’t go through."} Stripe retries automatically and the family has been emailed. Their existing balance is
            unaffected.
          </Notice>
        </div>
      ) : null}
      {wallet.balanceCents < 0 ? (
        <div className="mb-5">
          <Notice tone="critical" title="Negative balance">
            A refunded or disputed membership payment took back funds the family had already spent. Decide whether to follow up or adjust.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Play Pass" className="lg:col-span-2">
          <DL
            cols={3}
            items={[
              { label: "Pass", value: plan ? `${plan.name} · $${(plan.priceCents / 100).toFixed(0)}/month` : "None" },
              { label: "Status", value: sub ? `${STATUS[sub.status] ?? sub.status}${sub.cancelAtPeriodEnd ? " · not renewing" : ""}` : "—" },
              { label: "Next renewal", value: sub?.nextRenewalOn && !sub.cancelAtPeriodEnd ? `${fmtDate(sub.nextRenewalOn)}${nextPlan ? ` → ${nextPlan.name}` : ""}` : "—" },
              { label: "Available", value: <Money cents={wallet.availableCents} /> },
              { label: "Reserved at checkout", value: <Money cents={wallet.reservedCents} /> },
              { label: "Ledger balance", value: <Money cents={wallet.balanceCents} /> },
              { label: "Joined", value: sub ? `${fmtDate(sub.startDate)} (${sub.prorationDays}/${sub.monthDays} days first month)` : "—" },
              { label: "Terms accepted", value: sub ? `${sub.termsVersion} · ${fmtDate(sub.termsAcceptedAt.toISOString().slice(0, 10))}` : "—" },
              { label: "Billed through", value: sub ? (sub.provider === "stripe" ? `Stripe ${sub.subscriptionRef ?? ""}` : "Test mode") : "—" },
            ]}
          />
          {manage && sub?.provider === "test" && (sub.status === "active" || sub.status === "past_due") ? (
            <div className="mt-5 flex flex-wrap gap-3 border-t border-ink/8 pt-4">
              <p className="w-full text-[0.8rem] text-ink-soft">Test mode: run a month’s renewal through the same verified path Stripe uses.</p>
              <ActionForm action={simulateRenewalAction} submit={{ label: "Simulate renewal", variant: "secondary" }} className="">
                <input type="hidden" name="subscriptionId" value={sub.id} />
              </ActionForm>
              <ActionForm action={simulateRenewalAction} submit={{ label: "Simulate failed renewal", variant: "ghost" }} className="">
                <input type="hidden" name="subscriptionId" value={sub.id} />
                <input type="hidden" name="outcome" value="fail" />
              </ActionForm>
            </div>
          ) : null}
        </Card>

        {manage ? (
          <Card title="Adjust balance">
            <ActionForm action={adjustWalletAction} submit={{ label: "Record adjustment" }} resetOnSuccess confirm={{ title: "Record this adjustment?", body: "It’s added to the family’s ledger and the audit trail.", confirmLabel: "Record" }}>
              <input type="hidden" name="familyId" value={familyId} />
              <MoneyField name="amount" label="Amount" hint="Positive adds funds; use a minus sign to remove them (e.g. -15)." required />
              <TextArea name="note" label="Reason" required rows={2} />
            </ActionForm>
          </Card>
        ) : null}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Wallet ledger" padded={false}>
          {activity.length ? (
            <Table dense head={["Date", "Entry", "Amount"]}>
              {activity.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{fmtDate(e.createdAt.toISOString().slice(0, 10), "d MMM")}</td>
                  <td>
                    {KIND[e.kind] ?? e.kind}
                    <span className="block text-[0.75rem] text-ink-soft">
                      {e.note}
                      {e.createdBy ? ` · ${e.createdBy}` : ""}
                    </span>
                  </td>
                  <td className="tabular-nums">
                    <Money cents={e.amountCents} />
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="p-5">
              <Empty title="No wallet activity yet" />
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Allocations (for rollover review)" padded={false}>
            {allocations.length ? (
              <Table dense head={["Period", "Source", "Amount", "Used", "Left"]}>
                {allocations.map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDate(a.periodStart, "MMM yyyy")}</td>
                    <td>
                      {a.kind}
                      {a.reversedAt ? <span className="block text-[0.75rem] text-[#8a2333]">Reversed</span> : null}
                    </td>
                    <td>
                      <Money cents={a.amountCents} />
                    </td>
                    <td>
                      <Money cents={a.usedCents} />
                    </td>
                    <td>
                      <Money cents={a.leftCents} />
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <div className="p-5">
                <Empty title="No allocations yet" />
              </div>
            )}
          </Card>
          <Card title="Membership payments" padded={false}>
            {charges.length ? (
              <Table dense head={["Date", "Type", "Amount", "Status"]}>
                {charges.map((c) => (
                  <tr key={c.id}>
                    <td>{fmtDate(c.createdAt.toISOString().slice(0, 10), "d MMM yyyy")}</td>
                    <td>{c.reason}</td>
                    <td>
                      <Money cents={c.amountCents} />
                    </td>
                    <td>
                      {c.status}
                      {c.failureReason ? <span className="block text-[0.75rem] text-ink-soft">{c.failureReason}</span> : null}
                      {c.refundedCents ? <span className="block text-[0.75rem] text-ink-soft">Refunded <Money cents={c.refundedCents} /></span> : null}
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <div className="p-5">
                <Empty title="No payments yet" />
              </div>
            )}
          </Card>
          <Card title="Upcoming bookings" padded={false} actions={<Link href={`/admin/families/${familyId}`} className="text-blue">Family record</Link>}>
            {upcoming.length ? (
              <Table dense head={["When", "Experience", "Booking"]}>
                {upcoming.map((r) => (
                  <tr key={r.i.id}>
                    <td className="whitespace-nowrap">
                      {fmtDate(r.s.localDate, "EEE d MMM")} {fmtTime(r.s.startsAt)}
                    </td>
                    <td>{r.p.name}</td>
                    <td>
                      <Link href={`/admin/bookings/${r.b.id}`} className="text-blue">
                        {r.b.reference}
                      </Link>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <div className="p-5">
                <Empty title="No upcoming bookings" />
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
