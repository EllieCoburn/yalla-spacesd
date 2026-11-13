# Yalla Play Passes

Monthly family memberships for Yalla Happenings. Each pass funds a dollar wallet on the 1st of the month; families spend it on eligible experiences in the normal booking checkout. **Status: built and tested in test mode. Live charging is not switched on.**

## How it fits the existing site

| Existing piece | How Play Passes use it |
| --- | --- |
| One booking engine (`lib/ops/bookings.ts`): holds, capacity locks, invoices, confirmation | Unchanged flow. At checkout the wallet is reserved against the booking's invoice before the card is charged; the card pays only the rest. Confirmation spends the reservation. |
| Invoices and payments (`lib/ops/billing.ts`) | A Play Pass payment is a `payments` row with `method = "wallet"`, alongside card, offline and credit. Invoice totals count it (`walletApplied`). Refunding it returns funds to the wallet. |
| Payment providers and signed webhooks (`lib/payments`) | Membership billing is a sibling adapter (`lib/playpass/provider.ts`) for Stripe Billing or the test sandbox. Membership events go through the same webhook route, signature check and once-only event table. |
| Family accounts and magic-link sign-in (`lib/family-auth.ts`) | Signup requires a signed-in guardian who manages billing. New families create an account on the join page and confirm by email. |
| Audit log, staff roles, settings, notifications | Every wallet change is audited. New permissions `playpass.view` and `playpass.manage`. Policies under Settings → Policies → Play Passes. Four new email templates. |

## Data model (migration `0015_play_passes`)

- `play_pass_plans`: Play $120/$135, Gather $180/$200, Belong $240/$270. A price change creates a **new version** for new members; old versions keep serving their members.
- `play_pass_subscriptions`: one per family that isn't ended (enforced by a unique partial index). Stores the first-month proration, terms version and acceptance, Stripe references and a pending next-renewal plan change.
- `wallet_allocations`: each month's (or adjustment's) funding, with period, amount, source (unique per paid provider invoice, so a payment funds the wallet once) and an `expires_on` that stays empty until an expiry policy is adopted.
- `wallet_entries`: the append-only ledger in integer cents. Balance = sum of entries. Debits name the allocation they draw from (oldest first).
- `wallet_reservations`: funds set aside during checkout (held → captured or released).
- `play_pass_charges`: membership invoices (paid, failed, refunded, disputed) for history, receipts and reconciliation.
- Program flags `play_pass_eligible` and `wallet_redemption_allowed` (both off by default; turned on for Immersive Play, Weekend Play and After Hours), plus a per-session override.

## Billing rules

- Renewals on the 1st (America/Los_Angeles). Stripe subscription with `billing_cycle_anchor` = next 1st and `proration_behavior: none`; the partial first month is a one-time line computed here, so the charge is exact.
- First month: remaining days ÷ days in month, counting the join day, applied to both charge and allocation with the same half-up rounding. Gather on Nov 16 (30-day month) = $90 paid, $100 allocated.
- Allocation happens only on a verified `invoice.paid`, once per invoice. Failed renewals mark the pass "payment failed" and add nothing; Stripe retries.
- Plan changes apply from the next renewal (Stripe price swapped with no proration). Cancelling stops future renewals; paid funds stay in the wallet.
- A refunded or lost-dispute membership payment reverses the matching share of that month's allocation, once.

## Booking rules

- Only eligible sessions can use the wallet. Families get the published per-child price; the After Hours family rate (part of the published price) still applies. The percentage sibling discount doesn't stack on wallet spending unless Settings says so.
- Two checkouts can't spend the same dollars: reservations count against the available balance, under a per-family row lock.
- Abandoned or expired holds release both the spots and the reserved funds (hold expiry job).
- Family cancellation in the portal (inside the program's cancellation window) returns the Play Pass portion automatically (setting, on by default). Staff refunds of wallet payments return funds the same way.

## Tests (`tests/playpass.test.ts`, run `npx vitest run`)

Scenarios from the brief: 1 nonmember card booking · 2 fully covered by wallet · 3 partial wallet + card ($40 + $25) · 4 two children · 5 join on the 1st · 6 join midmonth (30- and 31-day months, year end) · 7 renewal · 8 failed renewal then recovery · 9 duplicate webhooks · 10 simultaneous checkouts · 11 last space race · 12 family cancellation restores funds · 13 cancel membership · 14 tier change · 15 admin adjustment (+ idempotent, can't overdraw, needs a reason) · 16 ineligible program · 17 failed card · 18 abandoned checkout · 19 refund and lost dispute · 20 cross-family isolation. Plus: signup requires terms, one pass per family, new pricing doesn't affect existing members, report keeps cash and wallet value apart.

The full journey was also exercised in a browser in test mode: join (prorated $108 / $120 on Nov 13), welcome, My Play Pass, an After Hours booking paid entirely from the wallet, confirmation page and email, admin adjustment and simulated renewal.

## Decisions for Yalla (the system works around each; nothing is assumed)

1. **Unused balance / expiry.** Funds never expire today. The intended "roll over one month, up to one month's allocation" is recorded as a policy option for review only. Get California guidance on prepaid balances before enabling any expiry.
2. **Billing terms wording.** `content/playpass.ts` (`billingTerms`, FAQ) states plainly how billing works. Have it reviewed (California's automatic renewal law requires clear terms, affirmative consent, an acknowledgment and easy online cancellation; the flow provides each, but the wording is yours to approve). Bump `TERMS_VERSION` in `lib/playpass/membership.ts` when it changes.
3. **Coworking pricing.** The brief lists "three-hour childcare and coworking, $60 per child". The site today prices Immersive Play at $45 per child plus a $15 coworking add-on per family. Prices come from the booking system and weren't changed.
4. **Sibling discounts on wallet spending.** Off by default (Settings → Play Passes).
5. **Refunds of membership fees when cancelling.** Not offered automatically; staff refund in Stripe if they choose, and the matching wallet value is reversed.
6. **Which programs accept Play Pass.** Immersive Play, Weekend Play and After Hours are on; camps, Flex, pop-ups and others are off. Change in Admin → Play Passes → Eligible programs.

## Deployment checklist

1. **Database**: deploy; `npm run build` runs migrations (0015 adds the tables, the three plans and eligibility). Check Admin → Play Passes shows three passes.
2. **Stay in test mode first** (no `STRIPE_SECRET_KEY`): try signup, a booking with the wallet, a cancellation and a simulated renewal on the preview deployment.
3. **Stripe test mode**: set `STRIPE_SECRET_KEY` (sk_test_…) and `STRIPE_WEBHOOK_SECRET`. In the Stripe webhook endpoint (`/api/webhooks/stripe`) add, in addition to the booking events: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. Enable the **Customer portal** (Settings → Billing → Customer portal: payment method updates, invoice history; turn off plan switching and cancellation there so changes go through Yalla). Configure Smart Retries and failed-payment emails as preferred. Products and prices are created automatically on first signup.
4. **Test in Stripe test mode**: signup midmonth with card 4242…, renewal using a Stripe test clock, a declined renewal (card 4000 0000 0000 0341), refund and dispute from the dashboard; confirm wallet and admin numbers.
5. **Email**: Postmark live (`NOTIFICATIONS_MODE=live`) so welcome, renewal, failure and change emails send.
6. **Go live (needs explicit approval)**: live keys, `PAYMENTS_LIVE_ENABLED=true`, live webhook with the same events, live customer portal settings. Do one small real signup and refund it.
7. **Grant staff access**: owners have it automatically; give `playpass.view` / `playpass.manage` to other roles in Settings → Staff & roles.

## Rollback

- To stop new signups: set every plan inactive (or remove the Play Passes link). Existing members are unaffected.
- To stop wallet spending: turn off eligibility for the programs. Balances are kept.
- Stripe subscriptions are managed in Stripe; cancelling them there is reflected here by webhook. Nothing in the ledger is ever deleted.
- The migration only adds tables and columns; reverting the code leaves them unused and harmless.
