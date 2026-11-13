import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { ChangePlanForm, PassButton, PauseForm, type TierOption } from "@/components/playpass/PassForms";
import { changeOptions } from "@/lib/playpass/changes";
import { billingPortalAction } from "@/app/(site)/play-passes/actions";
import { getDb, isDbConfigured } from "@/lib/db";
import { familyPlayPass, offeredPlans } from "@/lib/playpass/membership";
import { PORTAL_OPEN_PREVIEW } from "@/lib/portal-preview";
import { addDaysISO, fmtDate, todayLA } from "@/lib/time";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "My Play Pass", robots: { index: false } };
export const dynamic = "force-dynamic";

const usd = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ENTRY: Record<string, string> = {
  allocation: "Monthly balance added",
  booking_debit: "Booking",
  booking_refund: "Returned from a cancellation",
  adjustment: "Adjustment by Yalla",
  expiration: "Expired",
  payment_reversal: "Membership payment refunded",
};
const STATUS: Record<string, string> = { active: "Active", past_due: "Payment needed", pending: "Setting up", canceled: "Ended" };

export default async function MyPlayPass({ searchParams }: { searchParams: Promise<{ portal?: string }> }) {
  const sp = await searchParams;
  const g = isDbConfigured() ? await getGuardian() : null;
  if (!g) {
    if (!PORTAL_OPEN_PREVIEW) redirect("/portal?signin=1&next=/portal/play-pass");
    return (
      <Shell>
        <p className="max-w-xl text-ink-soft">Sign in to see your family’s Play Pass. (The open portal preview uses a sample family without one.)</p>
        <Link href="/portal?signin=1&next=/portal/play-pass" className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-6 text-[0.88rem] text-chalk hover:bg-blue">
          Sign in
        </Link>
      </Shell>
    );
  }
  const db = getDb();
  const { sub, plan, nextPlan, wallet, activity, charges } = await familyPlayPass(db, g.familyId);
  const plans = await offeredPlans(db);
  const live = sub && (sub.status === "active" || sub.status === "past_due");
  const endsOn = sub?.nextRenewalOn ? fmtDate(sub.nextRenewalOn, "MMMM d") : null;
  const opts = live ? await changeOptions(db, sub!) : null;
  const pausedNow = !!(sub?.pauseStartsOn && sub.resumeOn && sub.pauseStartsOn <= addDaysISO(sub.resumeOn, -1) && sub.pauseAppliedAt);
  const tierOptions: TierOption[] = opts
    ? plans.map((p) => {
        const up = opts.upgrades.find((u) => u.plan.id === p.id);
        const down = opts.downgrades.find((d) => d.plan.id === p.id);
        return {
          tier: p.tier,
          label: `${p.name} · ${usd(p.priceCents).replace(".00", "")}`,
          kind: up ? "upgrade" : down ? "downgrade" : "current",
          detail: up
            ? `Upgrades right away: ${usd(up.chargeCents)} now for the rest of this month, and ${usd(up.allocationCents)} more to spend. ${usd(p.priceCents)} a month from the 1st.`
            : down
              ? `With 30 days’ notice, ${p.name} starts ${fmtDate(down.startsOn, "MMMM d")}: ${usd(p.priceCents)} a month with ${usd(p.allocationCents)} to spend.`
              : "",
        } satisfies TierOption;
      })
    : [];

  return (
    <Shell>
      {sp.portal === "unavailable" ? (
        <p role="status" className="mb-6 border-l-2 border-oxblood/40 pl-4 text-[0.9rem] text-oxblood">
          Card updates open in Stripe’s secure page once live payments are switched on. Nothing has changed.
        </p>
      ) : null}
      {sub?.status === "past_due" ? (
        <div className="mb-8 border border-oxblood/30 bg-oxblood/[0.04] p-5 text-[0.92rem] text-oxblood">
          Your last Play Pass payment didn’t go through{sub.lastFailureReason ? ` (${sub.lastFailureReason})` : ""}. We’ll retry automatically. Updating your card now keeps
          your pass going. Your current balance isn’t affected.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Balance */}
        <div className="bg-mist p-8 lg:col-span-2">
          <p className="eyebrow text-[0.62rem] text-ink-soft">Your Play Pass</p>
          <p className="display mt-3 text-[2rem]">{plan && live ? `${plan.name} Membership` : sub?.status === "pending" ? "Setting up your pass" : "No active pass"}</p>
          <p className="mt-6 text-[0.8rem] tracking-[0.12em] text-ink-soft uppercase">Play Pass balance</p>
          <p className="display text-[clamp(2.6rem,2rem+2vw,3.6rem)]">{usd(wallet.passCents)}</p>
          {wallet.creditCents ? (
            <p className="text-[0.85rem] text-ink-soft">
              Plus {usd(wallet.creditCents)} in Yalla credits.{" "}
              <Link href="/portal/wallet" className="underline underline-offset-4 hover:text-blue">
                See your Yalla Wallet
              </Link>
            </p>
          ) : null}
          {wallet.reservedCents ? <p className="text-[0.85rem] text-ink-soft">{usd(wallet.reservedCents)} set aside for a booking you’re checking out</p> : null}
          {wallet.balanceCents < 0 ? <p className="mt-2 text-[0.85rem] text-oxblood">Your balance is below zero after a refunded payment. We’ll be in touch.</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/programs/yalla-happenings#calendar" className="inline-flex h-11 items-center rounded-full bg-ink px-6 text-[0.88rem] text-chalk hover:bg-blue">
              Browse experiences
            </Link>
            {!live ? (
              <Link href="/play-passes" className="inline-flex h-11 items-center rounded-full border border-ink/25 px-6 text-[0.88rem] hover:border-ink">
                Choose a Play Pass
              </Link>
            ) : null}
          </div>
        </div>

        {/* Membership facts */}
        <dl className="divide-y divide-line border-y border-line text-[0.92rem] lg:self-start">
          {[
            [
              "Status",
              sub
                ? live && sub.cancelEffectiveOn
                  ? `Active until ${fmtDate(sub.cancelEffectiveOn, "MMMM d")}`
                  : live && pausedNow
                    ? `Paused until ${fmtDate(addDaysISO(sub.resumeOn!, -1), "MMMM d")}`
                    : (STATUS[sub.status] ?? sub.status)
                : "—",
            ],
            ["Monthly price", plan && live ? usd(plan.priceCents) : "—"],
            ["Added each month", plan && live ? usd(plan.allocationCents) : "—"],
            ["Next renewal", live && endsOn && !(sub!.cancelEffectiveOn && sub!.cancelEffectiveOn < sub!.nextRenewalOn!) ? `${endsOn}${nextPlan && !sub!.downgradeEffectiveOn ? ` · ${nextPlan.name}, ${usd(nextPlan.priceCents)}` : ""}${sub!.cancelEffectiveOn && sub!.finalChargeCents ? ` · final ${usd(sub!.finalChargeCents)}` : ""}` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-3">
              <dt className="text-ink-soft">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Manage */}
      {live && opts ? (
        <section className="mt-14 border-t border-line pt-10">
          {sub!.cancelEffectiveOn || sub!.pauseStartsOn || (nextPlan && sub!.downgradeEffectiveOn) ? (
            <div className="mb-10 space-y-4">
              {sub!.cancelEffectiveOn ? (
                <div className="flex flex-wrap items-center justify-between gap-4 border border-line bg-paper p-5 text-[0.92rem]">
                  <p className="max-w-xl">
                    Your Play Pass ends on <strong className="font-medium">{fmtDate(sub!.cancelEffectiveOn, "EEEE, MMMM d")}</strong>. Regular billing continues until then
                    {sub!.finalChargeCents ? `, with a prorated final payment of ${usd(sub!.finalChargeCents)} on ${fmtDate(sub!.cancelEffectiveOn.slice(0, 8) + "01", "MMMM d")}` : ""}. Your balance stays in your wallet.
                  </p>
                  {sub!.cancelEffectiveOn >= todayLA() ? <PassButton kind="undoCancel" label="Keep my Play Pass" /> : null}
                </div>
              ) : null}
              {sub!.pauseStartsOn && sub!.resumeOn ? (
                <div className="flex flex-wrap items-center justify-between gap-4 border border-line bg-paper p-5 text-[0.92rem]">
                  <p className="max-w-xl">
                    Paused {fmtDate(sub!.pauseStartsOn, "MMMM d")} through {fmtDate(addDaysISO(sub!.resumeOn, -1), "MMMM d")}. It reactivates on {fmtDate(sub!.resumeOn, "MMMM d")}, when the rest of that month is charged. To end instead of reactivating, give notice by {fmtDate(addDaysISO(sub!.resumeOn, -30), "MMMM d")}.
                  </p>
                  {!pausedNow ? <PassButton kind="undoPause" label="Cancel the pause" /> : null}
                </div>
              ) : null}
              {nextPlan && sub!.downgradeEffectiveOn ? (
                <p className="border border-line bg-paper p-5 text-[0.92rem]">
                  Changing to {nextPlan.name} after your 30 days’ notice ({usd(nextPlan.priceCents)} a month from the first renewal on or after {fmtDate(sub!.downgradeEffectiveOn, "MMMM d")}). Choose {plan!.name} below to keep your current pass.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="display text-[1.4rem]">Change your pass</p>
              <p className="mt-1 text-[0.85rem] text-ink-soft">Upgrade anytime, right away. Downgrades need 30 days’ notice.</p>
              <div className="mt-5">
                <ChangePlanForm current={plan!.tier} options={tierOptions} />
              </div>
            </div>
            <div>
              <p className="display text-[1.4rem]">Pause</p>
              <p className="mt-1 text-[0.85rem] text-ink-soft">Up to 60 days in a row, with 30 days’ notice. No renewals while paused; it reactivates automatically.</p>
              <div className="mt-5">{sub!.pauseStartsOn || sub!.cancelEffectiveOn ? <p className="text-[0.85rem] text-ink-soft">{sub!.pauseStartsOn ? "You have a pause scheduled." : "Not available while your pass is set to end."}</p> : <PauseForm earliest={opts.pause.earliestStart} maxDays={opts.pause.maxDays} />}</div>
            </div>
            <div>
              <p className="display text-[1.4rem]">Cancel</p>
              <p className="mt-1 text-[0.85rem] text-ink-soft">
                With 30 days’ notice, your Play Pass ends {fmtDate(opts.cancel.endOn, "MMMM d")}
                {opts.cancel.final ? ` with a prorated final payment of ${usd(opts.cancel.final.chargeCents)}` : ""}. Your balance stays in your wallet.
              </p>
              <div className="mt-5">
                {sub!.cancelEffectiveOn ? (
                  <p className="text-[0.85rem] text-ink-soft">Notice received.</p>
                ) : (
                  <PassButton
                    kind="cancel"
                    label="Give 30 days’ notice"
                    confirmText={`Cancel your Play Pass? It stays active until ${fmtDate(opts.cancel.endOn, "MMMM d")}, and regular billing continues until then${opts.cancel.final ? `, with a final prorated payment of ${usd(opts.cancel.final.chargeCents)}` : ""}.`}
                  />
                )}
              </div>
            </div>
            <div>
              <p className="display text-[1.4rem]">Payment method</p>
              <p className="mt-1 text-[0.85rem] text-ink-soft">Update your card and see receipts on Stripe’s secure page.</p>
              <form action={billingPortalAction} className="mt-5">
                <button className="inline-flex h-12 items-center rounded-full border border-ink/25 px-7 text-[0.9rem] hover:border-ink">Update payment method</button>
              </form>
            </div>
          </div>
          <p className="mt-8 text-[0.8rem] text-ink-soft">
            See{" "}
            <Link href="/policies#membership-changes" className="underline underline-offset-4 hover:text-blue">
              upgrades, downgrades and pauses
            </Link>{" "}
            and{" "}
            <Link href="/policies#canceling-a-membership" className="underline underline-offset-4 hover:text-blue">
              canceling a membership
            </Link>
            .
          </p>
        </section>
      ) : null}

      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        {/* Wallet activity */}
        <section>
          <p className="display text-[1.5rem]">Recent activity</p>
          {activity.length ? (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {activity.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-4 py-3 text-[0.9rem]">
                  <span>
                    {ENTRY[e.kind] ?? e.kind}
                    {e.note ? <span className="block text-[0.78rem] text-ink-soft">{e.note}</span> : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={e.amountCents > 0 ? "text-blue" : ""}>{e.amountCents > 0 ? `+${usd(e.amountCents)}` : usd(e.amountCents)}</span>
                    <span className="block text-[0.72rem] text-ink-soft">{fmtDate(e.createdAt.toISOString().slice(0, 10), "MMM d")}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-ink-soft">Nothing yet.</p>
          )}
        </section>

        {/* Billing history */}
        <section>
          <p className="display text-[1.5rem]">Membership payments</p>
          {charges.length ? (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {charges.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-4 py-3 text-[0.9rem]">
                  <span>
                    {c.reason === "initial" ? "First month" : c.reason === "renewal" ? "Monthly renewal" : c.reason === "upgrade" ? "Upgrade" : c.reason === "resume" ? "Back from your pause" : "Payment"}
                    <span className="block text-[0.78rem] text-ink-soft">{fmtDate(c.createdAt.toISOString().slice(0, 10), "MMM d, yyyy")}</span>
                  </span>
                  <span className="text-right">
                    {usd(c.amountCents)}
                    <span className={`block text-[0.72rem] ${c.status === "failed" ? "text-oxblood" : "text-ink-soft"}`}>
                      {c.status === "paid" ? "Paid" : c.status === "pending" ? "Processing" : c.status === "failed" ? "Didn’t go through" : c.status === "refunded" ? `Refunded ${usd(c.refundedCents)}` : "Disputed"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-ink-soft">No payments yet.</p>
          )}
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-28 pb-24 lg:pt-36">
      <div className="shell">
        <Link href="/portal/home" className="eyebrow text-ink-soft hover:text-ink">
          ← Family Portal
        </Link>
        <div className="mt-6 flex items-center gap-3">
          <Mark name="sun" className="h-7 w-auto text-blue" />
          <h1 className="display text-[clamp(2.4rem,1.8rem+2.4vw,4rem)]">
            My <em>Play Pass.</em>
          </h1>
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </div>
  );
}
