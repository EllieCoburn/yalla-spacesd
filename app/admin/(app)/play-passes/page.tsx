import Link from "next/link";
import { asc } from "drizzle-orm";
import { ActionForm, Checkbox, MoneyField, TextField } from "@/components/admin/forms";
import { Card, Empty, FilterBar, FilterField, inputCls, Money, Notice, PageHeader, Stat, Table, Tabs } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { playPassPlans, programs } from "@/lib/db/schema";
import { getPolicy } from "@/lib/ops/settings";
import { paymentsStatus } from "@/lib/payments/provider";
import { financialReport, memberList, outstandingBalances, overview } from "@/lib/playpass/admin";
import { fmtDate, todayLA } from "@/lib/time";
import { eligibilityAction, newPlanAction } from "./actions";

export const metadata = { title: "Play Passes" };

const STATUS: Record<string, string> = { active: "Active", past_due: "Payment failed", pending: "Setting up", canceled: "Ended" };

export default async function PlayPassesAdmin({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; month?: string }> }) {
  const staff = await requirePermission("playpass.view");
  const sp = await searchParams;
  const tab = sp.tab ?? "overview";
  const db = getDb();
  const manage = can(staff, "playpass.manage");
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayLA().slice(0, 7);
  const pay = paymentsStatus();

  return (
    <>
      <PageHeader
        title="Play Passes"
        subtitle="Monthly family memberships for Yalla Happenings. Each pass adds a spending balance on the 1st; families spend it on eligible experiences at checkout."
      />
      {pay.provider === "test" ? (
        <div className="mb-5">
          <Notice tone="info" title="Test mode">
            Signups use the built-in test checkout and no money moves. Live charging starts only when Stripe keys are added and approved (see docs/PLAY_PASS.md).
          </Notice>
        </div>
      ) : null}
      <Tabs
        current={tab}
        tabs={[
          { key: "overview", label: "Overview", href: `/admin/play-passes?tab=overview` },
          { key: "members", label: "Members", href: `/admin/play-passes?tab=members` },
          { key: "offerings", label: "Passes & pricing", href: `/admin/play-passes?tab=offerings` },
          { key: "eligibility", label: "Eligible programs", href: `/admin/play-passes?tab=eligibility` },
          { key: "balances", label: "Balances", href: `/admin/play-passes?tab=balances` },
        ]}
      />
      {tab === "overview" ? <Overview month={month} /> : tab === "members" ? <Members q={sp.q} /> : tab === "offerings" ? <Offerings manage={manage} /> : tab === "eligibility" ? <Eligibility manage={manage} /> : <Balances />}
    </>
  );

  async function Overview({ month }: { month: string }) {
    const o = await overview(db, month);
    const r = await financialReport(db, month);
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(`${todayLA().slice(0, 7)}-15T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - i);
      return d.toISOString().slice(0, 7);
    });
    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active members" value={o.active} sub={o.tiers.map(([n, c]) => `${n} ${c}`).join(" · ") || "None yet"} href="/admin/play-passes?tab=members" />
          <Stat label="Monthly recurring" value={<Money cents={o.mrrCents} />} sub={`${o.endingN} set to end · ${o.pendingChangesN} changing next month`} />
          <Stat label="Payment failures" value={o.failedN} tone={o.failedN || o.pastDue ? "warning" : undefined} sub={`${o.pastDue} pass${o.pastDue === 1 ? "" : "es"} past due now`} />
          <Stat label="Wallet balances owed" value={<Money cents={o.liabilityCents} />} sub="Prepaid value families can still spend" href="/admin/play-passes?tab=balances" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Payments this month" value={o.paymentsN} sub={<Money cents={o.paymentsCents} />} />
          <Stat label="Redeemed this month" value={<Money cents={o.redeemedCents} />} sub="Spent on experiences, net of returns" />
          <Stat label="Next renewals" value={<Money cents={o.upcomingRenewalCents} />} sub="Due on the 1st (passes still renewing)" />
          <Stat label="Ended this month" value={o.cancelledN} sub={`${o.changesThisMonthN} plan change${o.changesThisMonthN === 1 ? "" : "s"} requested`} />
        </div>

        <Card
          title={`Financial summary · ${fmtDate(`${month}-01`, "MMMM yyyy")}`}
          actions={
            <form className="flex items-center gap-2">
              <input type="hidden" name="tab" value="overview" />
              <select name="month" defaultValue={month} className={`${inputCls} h-8 py-0`}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {fmtDate(`${m}-01`, "MMMM yyyy")}
                  </option>
                ))}
              </select>
              <button className="text-blue">Show</button>
            </form>
          }
        >
          <p className="mb-4 text-[0.82rem] text-ink-soft">
            Cash and prepaid value are kept apart: membership payments are cash received; wallet allocations and redemptions move prepaid value and are never added to
            receipts. Ask your accountant how to recognize prepaid membership revenue.
          </p>
          <Table
            dense
            head={["", "Amount", "What it is"]}
          >
            {[
              ["1. Membership cash collected", r.membershipCashCents, `Play Pass payments received, less ${r.membershipRefundsCents ? "refunds" : "any refunds"}`],
              ["2. Wallet value allocated", r.allocatedCents, "Balances added to wallets (monthly allocations and adjustments)"],
              ["3. Wallet value redeemed", r.redeemedCents, "Spent on experiences, net of cancellations returned to wallets"],
              ["4. Unredeemed balances", r.unredeemedCents, `All wallet balances at the end of ${fmtDate(r.periodEnd, "MMMM d")}`],
              ["5. Direct booking revenue", r.directBookingCents, "Card payments for bookings with no Play Pass funds"],
              ["6. Members’ additional card payments", r.memberCardCents, "Card top-ups on bookings partly paid from a Play Pass"],
            ].map(([k, v, note]) => (
              <tr key={k as string}>
                <td className="font-medium">{k}</td>
                <td className="tabular-nums">
                  <Money cents={v as number} />
                </td>
                <td className="text-ink-soft">{note}</td>
              </tr>
            ))}
          </Table>
          {r.reversedCents ? <p className="mt-3 text-[0.8rem] text-ink-soft">Also this month: <Money cents={r.reversedCents} /> of wallet value reversed after refunded or disputed membership payments.</p> : null}
        </Card>
      </div>
    );
  }

  async function Members({ q }: { q?: string }) {
    const rows = await memberList(db, q?.slice(0, 60));
    return (
      <>
        <FilterBar action="/admin/play-passes">
          <input type="hidden" name="tab" value="members" />
          <FilterField label="Search">
            <input name="q" defaultValue={q ?? ""} placeholder="Family, guardian or email" className={inputCls} />
          </FilterField>
        </FilterBar>
        <Card padded={false}>
          {rows.length ? (
            <Table head={["Family", "Pass", "Status", "Balance", "Next renewal"]}>
              {rows.map((r) => (
                <tr key={r.f.id}>
                  <td>
                    <Link href={`/admin/play-passes/${r.f.id}`} className="font-medium text-ink hover:text-blue">
                      {r.f.name}
                    </Link>
                  </td>
                  <td>{r.plan.name}</td>
                  <td>
                    {STATUS[r.s.status] ?? r.s.status}
                    {r.s.cancelAtPeriodEnd && r.s.status === "active" ? <span className="block text-[0.75rem] text-ink-soft">Ending</span> : null}
                  </td>
                  <td className="tabular-nums">
                    <Money cents={r.balanceCents} />
                  </td>
                  <td>{r.s.nextRenewalOn && !r.s.cancelAtPeriodEnd && (r.s.status === "active" || r.s.status === "past_due") ? fmtDate(r.s.nextRenewalOn) : "—"}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="p-5">
              <Empty title={q ? "No matching members" : "No Play Pass members yet"}>Families join from the Play Passes page on the website.</Empty>
            </div>
          )}
        </Card>
      </>
    );
  }

  async function Offerings({ manage }: { manage: boolean }) {
    const all = await db.select().from(playPassPlans).orderBy(asc(playPassPlans.sortOrder), asc(playPassPlans.createdAt));
    const current = all.filter((p) => p.active);
    const retired = all.filter((p) => !p.active);
    return (
      <div className="space-y-6">
        <Notice tone="info">
          A new price or monthly amount applies to <strong>new members only</strong>. Existing members keep the pass they joined on; changing their price needs notice
          to them first, and is done in Stripe.
        </Notice>
        <div className="grid gap-4 lg:grid-cols-3">
          {current.map((p) => (
            <Card key={p.id} title={p.name}>
              <p className="font-serif text-[1.6rem]">
                <Money cents={p.priceCents} />
                <span className="text-[0.85rem] text-ink-soft"> /month</span>
              </p>
              <p className="text-[0.88rem]">
                <Money cents={p.allocationCents} /> to spend · at least {p.minExperiences} experiences
              </p>
              {manage ? (
                <div className="mt-5 border-t border-ink/8 pt-4">
                  <ActionForm action={newPlanAction} submit={{ label: "Save for new members" }} confirm={{ title: `Change ${p.name} for new members?`, body: "Existing members aren’t affected.", confirmLabel: "Save" }}>
                    <input type="hidden" name="tier" value={p.tier} />
                    <TextField name="name" label="Name" defaultValue={p.name} />
                    <MoneyField name="price" label="Monthly price" defaultValue={p.priceCents} required />
                    <MoneyField name="allocation" label="Monthly spending balance" defaultValue={p.allocationCents} required />
                    <TextField name="minExperiences" label="Experiences covered (at least)" type="number" defaultValue={p.minExperiences} />
                  </ActionForm>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
        {retired.length ? (
          <Card title="Earlier versions (still serving their members)" padded={false}>
            <Table dense head={["Pass", "Price", "Balance", "Retired"]}>
              {retired.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    <Money cents={p.priceCents} />
                  </td>
                  <td>
                    <Money cents={p.allocationCents} />
                  </td>
                  <td>{p.retiredAt ? fmtDate(p.retiredAt.toISOString().slice(0, 10)) : "—"}</td>
                </tr>
              ))}
            </Table>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Eligibility({ manage }: { manage: boolean }) {
    const rows = await db.select().from(programs).orderBy(asc(programs.name));
    return (
      <Card title="Which programs accept Play Pass funds" padded={false}>
        <p className="px-5 pt-4 text-[0.85rem] text-ink-soft">
          Both boxes must be on for families to spend their balance. Prices always come from the program and its sessions. A session can also be switched on or off
          on its own.
        </p>
        <Table head={["Program", "Play Pass eligible", "Wallet redemption allowed", ""]}>
          {rows
            .filter((p) => p.status !== "archived")
            .map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}
                  <span className="block text-[0.75rem] text-ink-soft">{p.status === "published" ? "Published" : p.status}</span>
                </td>
                <td colSpan={3}>
                  {manage ? (
                    <ActionForm action={eligibilityAction} className="flex flex-wrap items-center gap-6" submit={{ label: "Save", variant: "secondary" }}>
                      <input type="hidden" name="programId" value={p.id} />
                      <Checkbox name="eligible" label="Eligible" defaultChecked={p.playPassEligible} />
                      <Checkbox name="redemption" label="Wallet redemption" defaultChecked={p.walletRedemptionAllowed} />
                    </ActionForm>
                  ) : (
                    `${p.playPassEligible ? "Eligible" : "Not eligible"} · ${p.walletRedemptionAllowed ? "redemption allowed" : "no redemption"}`
                  )}
                </td>
              </tr>
            ))}
        </Table>
      </Card>
    );
  }

  async function Balances() {
    const rows = await outstandingBalances(db);
    const policy = await getPolicy(db, "playpass.rollover");
    return (
      <div className="space-y-5">
        <Notice tone="warning" title="Unused balances are kept">
          Nothing expires automatically. {policy === "one_month_review" ? "The intended one-month rollover is recorded for review only." : ""} Review California’s rules on
          prepaid balances before adopting an expiry policy (Settings → Policies → Play Passes).
        </Notice>
        <Card padded={false}>
          {rows.length ? (
            <Table head={["Family", "Balance", "Oldest funds"]}>
              {rows.map((r) => (
                <tr key={r.familyId}>
                  <td>
                    <Link href={`/admin/play-passes/${r.familyId}`} className="font-medium hover:text-blue">
                      {r.name}
                    </Link>
                  </td>
                  <td className={`tabular-nums ${r.n < 0 ? "text-[#8a2333]" : ""}`}>
                    <Money cents={r.n} />
                  </td>
                  <td>{fmtDate(String(r.oldest).slice(0, 10))}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="p-5">
              <Empty title="No balances yet" />
            </div>
          )}
        </Card>
      </div>
    );
  }
}
