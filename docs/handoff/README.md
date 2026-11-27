# Yalla software guide

**For another team, or another AI coding session, that wants to understand this system, build it into its own product, or make a similar one for a different business.**

The repository is a complete booking, billing and operations platform for a childcare and coworking business. It has three parts:

- a public **marketing site** with live availability and checkout;
- a **Family Portal** where parents manage children, bookings, forms, payments and a prepaid wallet;
- a **staff admin app** for rosters, check-in, billing, schedules, programs, reports and a daily photo feed for families.

Everything in this guide comes from reading the code. File paths are relative to the repository root. The screenshots in [`screenshots/`](screenshots/) were taken on a local copy filled with **made-up sample data**: no real families appear.

---

## Contents

1. [What it looks like](#1-what-it-looks-like)
2. [Stack and repository map](#2-stack-and-repository-map)
3. [Core ideas](#3-core-ideas)
4. [Family side](#4-family-side)
5. [Staff side](#5-staff-side)
6. [Money](#6-money)
7. [Background jobs and email](#7-background-jobs-and-email)
8. [Security](#8-security)
9. [Data model](#9-data-model)
10. [Running it locally](#10-running-it-locally)
11. [Tests](#11-tests)
12. [Reusing this for another business](#12-reusing-this-for-another-business)
13. [Rules learned the hard way](#13-rules-learned-the-hard-way)

---

## 1. What it looks like

### Public site

| Home | Programs | A program page with live dates |
| --- | --- | --- |
| ![Home](screenshots/site-home.jpg) | ![Programs](screenshots/site-programs.jpg) | ![Camp](screenshots/site-camp.jpg) |

| Booking explorer | Play Pass (monthly prepaid plan) | FAQ |
| --- | --- | --- |
| ![Book](screenshots/site-book.jpg) | ![Play Passes](screenshots/site-play-passes.jpg) | ![FAQ](screenshots/site-faq.jpg) |

### Family Portal

| Portal home | Wallet | Account |
| --- | --- | --- |
| ![Portal](screenshots/portal-home.jpg) | ![Wallet](screenshots/portal-wallet.jpg) | ![Account](screenshots/portal-account.jpg) |

| Mobile: site | Mobile: portal |
| --- | --- |
| ![Mobile home](screenshots/mobile-home.jpg) | ![Mobile portal](screenshots/mobile-portal.jpg) |

### Staff admin

| Today dashboard | Enrollment calendar | Bookings |
| --- | --- | --- |
| ![Dashboard](screenshots/admin-dashboard.jpg) | ![Calendar](screenshots/admin-calendar.jpg) | ![Bookings](screenshots/admin-bookings.jpg) |

| Families | One family | Billing |
| --- | --- | --- |
| ![Families](screenshots/admin-families.jpg) | ![Family](screenshots/admin-family.jpg) | ![Billing](screenshots/admin-billing.jpg) |

| Roster and check-in | Schedule | Programs |
| --- | --- | --- |
| ![Roster](screenshots/admin-roster.jpg) | ![Schedule](screenshots/admin-schedule.jpg) | ![Programs](screenshots/admin-programs.jpg) |

| Day feed (staff) | Late pickups awaiting review | Reports |
| --- | --- | --- |
| ![My day](screenshots/admin-my-day.jpg) | ![Late fees](screenshots/admin-late-fees.jpg) | ![Reports](screenshots/admin-reports.jpg) |

| Communications (email log and templates) | Settings |
| --- | --- |
| ![Communications](screenshots/admin-communications.jpg) | ![Settings](screenshots/admin-settings.jpg) |

**Visual language.** The look is warm and editorial:

- **Type:** Lora (a serif, with italic accents) for headings and DM Sans for body text.
- **Colour:** periwinkle `#6065F2`, ink `#292C45`, cream and sand backgrounds, and oxblood for amounts due.
- **Shape:** soft rounded cards and letter-spaced small-caps labels ("eyebrows").
- **Logo:** a hand-drawn mark, vectorised.

Palette and fonts are defined in `app/globals.css` under `@theme`. Brand pieces are in `components/brand/`. Invoices and emails reuse the same palette.

---

## 2. Stack and repository map

- **Framework:** Next.js 16 (App Router, server actions), React 19 and TypeScript. Next 16 differs from older versions; read `node_modules/next/dist/docs/` before changing framework code (see `AGENTS.md`).
- **Styling:** Tailwind CSS v4.
- **Database:** Postgres through Drizzle ORM and postgres.js. Hosted on Neon in production.
- **Payments:** Stripe Checkout and subscriptions, behind a provider interface. A built-in **test provider** is the default, so nothing is ever charged during development.
- **Email:** Postmark, behind a "captured" test mode in which nothing is sent.
- **PDFs:** invoices, receipts and rosters are drawn with pdf-lib and fontkit.
- **Hosting:** Vercel, with two daily scheduled jobs.
- **Tests:** Vitest against a real Postgres test database (60 test files).

```
app/
  (site)/           public site + Family Portal (/portal/*)
  admin/(app)/      staff admin, one folder per section, each with page.tsx + actions.ts
  admin/(auth)/     staff sign-in, two-step code, password reset
  admin/export/     CSV and PDF exports
  kiosk/            lobby check-in screen
  api/              availability, cart, webhooks (Stripe + test), cron jobs
components/         UI by area: site, booking, portal, admin, feed, forms, brand, ui
content/            all public copy: programs, FAQ, policies, pricing, handbook, team
lib/
  db/               schema.ts (75 tables), migrations/ (hand-checked SQL), client
  ops/              business logic, one file per domain (bookings, billing, attendance…)
  payments/         provider interface, Stripe + test providers, webhook processing
  playpass/         wallet ledger, Play Pass memberships, credit notices
  billing/          invoice and receipt PDFs
  notify/           email templates, rendering, delivery, test capture
  auth/             staff auth, roles, permissions, crypto helpers
  booking/          client-side cart, ages, add-ons, family rate
  spaces/           coworking desk reservations
  forms/, handbook/ form field engine, handbook search
scripts/            migrate, seed (synthetic data), create-admin, jobs, reset-mfa
tests/              Vitest suites + helpers
docs/               this guide, admin manual, security notes, Play Pass notes
```

**The main architectural rule:** pages and server actions stay thin, and every business rule lives in `lib/ops/*` (plus `lib/playpass`, `lib/payments`). Each ops function takes `(db, actor, input)`. It runs in a transaction, locks what it changes, writes an audit entry and throws `OpsError` with a family-friendly message. That is why the same rules apply whether an action comes from the public site, the portal, staff or a scheduled job, and why the tests can exercise the real logic directly.

---

## 3. Core ideas

| Concept | What it is | Where |
| --- | --- | --- |
| **Family** | The account. It has many guardians (logins) and many children. | `lib/ops/families.ts` |
| **Guardian flags** | `isPrimary`, `canBook`, `canViewBilling`, `canViewSensitive` limit what each adult sees and does. | `lib/db/schema.ts` |
| **Program** | Something you can book. Kinds: `membership`, `drop_in`, `camp`, `happening`, `parents_night`, and others. Each has a `bookingMode` (instant, request, enroll or inquire), prices per age group, and required forms. | `lib/ops/programs.ts` |
| **Cohort** | An age group with its own staffing ratio and maximum size. | `cohorts` |
| **Capacity pool** | Shared room or staffing capacity that several programs draw from. | `capacity_pools` |
| **Schedule series → sessions** | A repeating schedule generates dated sessions, each with capacity and an age range. Blackout dates remove days. | `lib/ops/schedule.ts` |
| **Booking** | One family's order. It has **booking items**, one per child per session. | `lib/ops/bookings.ts` |
| **Hold** | A booking reserves its spaces for a short time (default 35 minutes) while the family pays. | `createHold` |
| **Invoice** | Built from lines. Totals and balances are always **calculated from the lines and payments**, never stored. | `lib/ops/billing.ts` |
| **Wallet** | A prepaid balance in an append-only ledger with two pools: Play Pass funds and credits. | `lib/playpass/wallet.ts` |
| **Policy settings** | Business rules (hold minutes, cancellation cutoff, sibling %, late-fee rates) are stored settings with safe defaults, editable in Admin → Settings. | `lib/ops/settings.ts` |
| **Actor** | Who is acting: staff, family, system or webhook. Passed to every ops function and recorded in the audit log. | `lib/audit.ts` |

---

## 4. Family side

### 4.1 Public site (`app/(site)`)

- **Content as code.** Program pages, FAQ, policies, pricing, team and handbook text live in `content/*.ts`. Staff can override FAQ entries from the admin.
- **Live availability.** The home page shows the next 14 days (`AvailabilityGlance`). Program pages list real dates (`components/site/ProgramDates.tsx`). Both read `GET /api/availability`, which calls `listPublicSessions` in `lib/ops/public-booking.ts`.
- **Coupon links.** `?coupon=CODE` on any URL is remembered (`lib/booking/saved-coupon.ts`) and applied at checkout. `/coupon/[code]` shows a code with a copy button.
- **Enquiry forms** (tours, applications, questions) land in the admin **Inbox**.

### 4.2 Booking and checkout

1. **Explore.** `/book` renders `components/booking/BookingExplorer.tsx`. The family filters by program and age, and picks sessions, children and extras. Session state (open, few left, full) comes from `lib/ops/capacity.ts`. It counts booked items, unexpired holds, membership spaces and spaces kept for the waitlist.
2. **Cart.** The cart lives in localStorage (`lib/booking/cart.ts`: 7-day lifetime, 60 items at most). A copy is posted to `/api/cart` so staff can see open and abandoned carts.
3. **Checkout** (`components/booking/Checkout.tsx`):
   - It asks each child's allergies and medications before payment.
   - It collects required agreements: initials and drawn signatures.
   - It accepts discount codes and shows the sibling discount once a second child is added.
   - It shows the wallet balance that will be used.
   - If the email already has a portal account, the family must sign in first.
4. **Submit** (`submitBookingAction` → `submitPublicBooking`). The steps are rate-limited by IP and email:
   1. Validate care answers and check the coupon.
   2. Find or create the family. A new family has no portal access until it has paid.
   3. Add or update children.
   4. Expand multi-day programs such as camps, so all days are booked together.
   5. Sign agreements.
   6. `createHold`, then `startCheckout`.

   If any step fails, a family created during this request is removed again.
5. **Capacity is never oversold.** `createHold` locks the sessions and their capacity pools (`SELECT … FOR UPDATE`, in id order to avoid deadlocks). Inside that transaction it re-checks remaining spaces and records the prices on the server. Staff overrides are logged separately and can never exceed hard capacity.
6. **Pay.**
   1. `startCheckout` first reserves wallet funds.
   2. If anything is left, it creates a Stripe Checkout (or test-provider) payment with an idempotency key.
   3. If the wallet covers everything, the booking is confirmed immediately.
   4. The webhook confirms the booking, captures the wallet reservation and emails a receipt.
   5. `confirmBooking` re-locks the sessions. If a hold expired and the space is gone, the booking is flagged `needs_attention` rather than oversold.
7. **Confirmation.** `/book/confirmation/[ref]` refreshes until the payment is recorded. A new family can then claim portal access once, using the private link.

### 4.3 Family Portal (`/portal/*`)

- **Signing in** (`lib/family-auth.ts`):
  - Ways in: email and password, a single-use magic link (valid 20 minutes), a staff invite, or claiming access after a purchase.
  - There is no open sign-up.
  - Sessions are stored hashed: 30 days at most, 7 days idle.
- **Home tabs:** Overview, Children, Bookings, Memberships, Yalla Wallet, Forms, Payments, Book a Space, What to bring.
- **Today's feed.** On a booked day the Overview shows the child's photos, meals, naps and potty notes posted by staff. Parents can reply.
- **Check-in code.** Each family has a 4-digit code for the lobby kiosk.
- **Cancelling.** A family can cancel a booking item before it starts:
  - At least the cutoff ahead (default 24 hours): the value goes back to the wallet as credit.
  - Later than that: no credit.
  - There are no cash refunds from the portal.
- **When the business cancels,** the family chooses either wallet credit plus a bonus (default 5%) or a refund to their card (`cancellation_offers`).
- **Extras on a booked day:** add-ons and coworking desk time (`/portal/extras/[date]`).
- **Forms:** sign required forms online. Each form version is immutable; a submission stores the exact text, a content hash, the signer's IP and the browser.
- **Invoices and receipts** download as branded PDFs.
- **Handbook search:** a BM25 ranker over the handbook text that runs in the browser (`lib/handbook/search.ts`). If nothing matches, the question goes to the staff inbox.

### 4.4 Lobby kiosk (`app/kiosk`)

- Staff open the kiosk from the admin. It runs on a tablet and expires at midnight.
- Families enter their 4-digit code, choose children, and on the way out choose who is collecting them. Only guardians and authorised pickups who aren't restricted can be chosen.
- Codes are random, with no runs, no four of a kind and no common door codes. Lookups are rate-limited.
- Records go to `attendance_records`. The kiosk shows children's first names only.

---

## 5. Staff side

### 5.1 Roles and permissions

- **Permissions** are fine-grained strings (`lib/auth/permissions.ts`), grouped by area:
  - **Programs and bookings:** `dashboard.view`, `programs.view`, `programs.manage`, `schedule.manage`, `capacity.override`, `bookings.view`, `bookings.manage`, `waitlist.manage`, `memberships.view`, `memberships.manage`.
  - **Families and children:** `families.view`, `families.manage`, `children.care`, `children.staffNotes`.
  - **Daily operations:** `flexclub.view`, `ops.lists`, `spaces.view`, `spaces.manage`, `spaces.configure`, `roster.view`, `attendance.manage`, `dropins.view`, `feed.post`, `feed.manage`.
  - **Forms:** `forms.view`, `forms.documents`, `forms.manage`.
  - **Money:** `billing.view`, `billing.manage`, `billing.refund`, `playpass.view`, `playpass.manage`.
  - **Admin:** `communications.view`, `communications.manage`, `reports.view`, `reports.financial`, `reports.export`, `content.manage`, `settings.manage`, `staff.manage`, `audit.view`.
- **Roles** are editable sets of permissions stored in the database. The defaults are owner, operations, educator, cohort_team, club_ops_director, session_team and billing. The owner role always has every permission, and the last active owner can't be disabled or demoted.
- **Every server action** is wrapped in `adminAction(permission(s), fn)` (`lib/admin/action.ts`). The wrapper:
  - requires a two-step-verified session;
  - checks **all** listed permissions;
  - gives the function form helpers, the database and the actor;
  - shows `OpsError` messages to staff, and logs other errors without personal data.

  Pages call `requirePermission(…)`.

### 5.2 Admin sections (`app/admin/(app)/*`)

| Section | What staff do there |
| --- | --- |
| **Today** | Dashboard: expected and present children, paperwork gaps, waitlist, money this month, today's sessions, carts. Global search with ⌘K. |
| **Roster** | Check children in and out, mark absent, undo, correct times afterwards ("left at 2:55"), print or download a day roster PDF. Approve or dismiss late pickups. |
| **Calendar** | Month and day enrollment views per program. Money figures only with `reports.financial`. |
| **Day feed (My day)** | Staff post photos, food, naps (start and end), potty and notes for the children in their assigned sessions. `feed.manage` assigns the team for each session. |
| **Bookings** | Create bookings for families; cancel, move (with a preview), add a child, record an absence, extend care, apply a code, pay from the wallet, send a payment link. |
| **Families / Children** | Families, guardians, children, emergency contacts, authorised pickups, notes and invites. Care and medical fields need extra permissions. |
| **Billing** | Invoices, payments, refunds, credits, discount codes, scheduled charges and late pickups. Corrections are added as adjustment lines; existing lines are never edited. |
| **Play Passes** | Monthly prepaid plans: plan versions, wallet adjustments, courtesy credits (with a reason emailed to the family). |
| **Memberships** | Recurring enrollments, with plan changes and exceptions (absence, closure, pause, make-up). |
| **Programs / Schedule / Sessions** | Program rules, prices per age group, required forms. Session series, blackouts, single-session edits with a preview of who is affected. |
| **Waitlist** | Offer spaces (held bookings that expire), expire offers, remove entries. One drop-in program has an automatic chain that offers the next family every 15 minutes. |
| **Forms** | Templates, immutable published versions, requirements by program and age, outstanding paperwork, reminders. |
| **Space reservations** | Coworking desks: rates, blocks, free daily time per family. |
| **Inbox** | Website enquiries, turned into family invites. |
| **Communications** | Every email the system sent or captured, plus the template editor with live preview. |
| **Reports** | Bookings, occupancy, attendance, cancellations, waitlist, memberships, families, and (financial) payments, refunds, outstanding balances. Screen and CSV share the same columns. Every export is audited. |
| **Settings** | Locations, hours, policies, cohorts, capacity pools, notices, staff accounts and roles. |
| **Audit** | A searchable trail of every change. Sensitive fields are logged only as "changed", never with their values. |

---

## 6. Money

### 6.1 Invoices (`lib/ops/billing.ts`)

- **Totals are calculated, never stored.** total = sum of lines; balance = total − paid − credit applied + refunded. This makes the ledger impossible to get out of sync.
- **Line kinds:** charge, discount, fee, tax, adjustment. Mistakes are fixed with a new adjustment line, never by editing a line.
- **Wallet first.** `createInvoice` applies the family's wallet automatically (`autoApplyWallet`); only the remainder is charged to a card. Payment links apply the wallet first, too.
- **Voiding** is refused once any money has been applied.
- **Numbers** look like `INV-1042-XK`. They are kept unique by a database constraint plus a random suffix.
- **PDFs:** `lib/billing/invoice-pdf.ts` draws a branded US Letter invoice with the issuer details, a summary panel, Bill to, the line items, totals and the payment history.

### 6.2 Payments (`lib/payments/*`)

- **One `PaymentProvider` interface** with `createCheckout`, `refund`, `parseWebhook` and optional `checkPayment` and `expireCheckout`. There are two implementations:
  - **test:** the default. It has its own checkout page and signed webhooks, and a refund can be made to fail on purpose to test error handling.
  - **stripe:** hosted Checkout, with idempotency keys on every create and refund.

  Stripe is only used when both its keys are set. A live key also needs an explicit "live enabled" flag.
- **Webhooks are processed exactly once.**
  1. The event id goes into `webhook_events`, and that row is locked.
  2. Events already processed are skipped.
  3. A failure is marked and returns 500, so the provider retries.
  4. A daily check asks Stripe about pending checkouts, in case a webhook was missed.
- **Refunds** are idempotent and capped at what remains refundable. Each refund goes back the way the money came: wallet payments to the wallet, card payments to the card, offline payments recorded as returned by staff.

### 6.3 Wallet (`lib/playpass/wallet.ts`)

- **An append-only ledger** (`wallet_entries`). Each family's changes run under a row lock on the family.
- **Two pools:**
  - **Play Pass funds:** from a monthly plan. They never expire and pay only for eligible sessions.
  - **Credits:** from cancellations or staff goodwill. They pay for anything and expire after 24 months.
- **Spending:** `debit` spends Play Pass funds first (oldest first), then credits (soonest expiry first).
- **At checkout:** funds are reserved at checkout, captured on confirmation and released if the hold ends unpaid.
- **Credit emails.** Every credit writes a notice row in the **same transaction** (`wallet_credit_notices`, unique per transaction). A sender emails the family the amount, the reason and the new balance, retries up to 5 times, and also runs in the daily job. A credit stands even if its email fails.

### 6.4 Discounts

- **Codes** (`lib/ops/coupons.ts`):
  - percent or fixed amount;
  - date window and maximum uses;
  - once per family;
  - first booking only;
  - limited to certain programs.

  A first-booking code that covers every program also refuses families who already have a membership or a Play Pass.
- **Sibling discount:** a policy percentage (default 10%) for each additional child at the same program on the same day. The highest-priced child pays full price. It **stacks** with codes.
- **Family rate:** one evening program charges a flat family rate instead (`lib/booking/family-rate.ts`).

### 6.5 Memberships and Play Pass

- **Play Pass** (`lib/playpass/membership.ts`):
  - Monthly plans renew on the 1st, and the first month is prorated.
  - Funds are added only when a verified "invoice paid" event arrives, once per provider invoice.
  - Cancelling or downgrading needs 30 days' notice; pauses last up to 60 days.
  - Plans are versioned, so they are never repriced.
- **Club memberships** (`lib/ops/memberships.ts`) reserve cohort capacity. In-app billing for them is **switched off on purpose** (`CLUB_YALLA_BILLED_HERE = false`): that business bills memberships manually, outside the portal, and the code must never charge them.

---

## 7. Background jobs and email

### 7.1 Scheduled jobs (`vercel.json`, `lib/jobs.ts`)

There are two daily jobs, the limit on the hosting plan. Both need `Authorization: Bearer <CRON_SECRET>`.

**Housekeeping** runs in the morning, in this order:
1. First-day welcome emails.
2. Check pending payments with Stripe.
3. Expire holds.
4. Advance waitlists and expire offers.
5. Retry wallet-credit emails.
6. Apply membership changes, expire old credits, apply Play Pass schedules, prepare upcoming drop-in days.
7. Prune old security records and carts.
8. Offer freed spaces to waitlisted families.

**Reminders** runs in the evening: welcome letters and reminders for tomorrow's bookings, sent once per booking.

### 7.2 Email (`lib/notify/*`)

- **Templates.** There are about 46 templates, each with a subject, a body, an `essential` flag and an audience (family, billing or staff). Staff can edit any of them in the admin; resetting restores the default.
- **Rendering.** `{{variables}}` are filled in, and the plain text is turned into branded HTML. Lines starting `|| ` are shown verbatim in a card, which is how a staff member's reason for a credit is quoted exactly.
- **Logging.** Every message is logged in `messages` before delivery. Sign-in links are removed from the logged copy.
- **Safe by default.** Nothing is sent unless `NOTIFICATIONS_MODE=live` and the Postmark settings are present. Otherwise messages are captured and visible in Admin → Communications. Admin pages show a banner saying payments are in test mode and emails are captured, not sent.

---

## 8. Security

- **Staff sign-in:**
  - Passwords are hashed with scrypt. Accounts lock for 15 minutes after 5 failures.
  - Two-step codes (TOTP) are **mandatory**. The secret is stored encrypted, and a code can't be used twice.
  - Sessions are stored hashed and end after 12 hours idle, or 7 days at most.
- **Families** have separate auth, cookies and sessions, with per-guardian flags.
- **Rate limits** apply to booking, sign-in, kiosk lookups and enquiries, using hashed buckets (`lib/rate-limit.ts`).
- **The audit log** records every change and every export (`lib/audit.ts`). Medical and care fields are recorded only as "changed".
- **Booking status pages** are visible only to the owning family, staff, or someone holding the private link.
- See also `docs/SECURITY.md`.

---

## 9. Data model

The schema is `lib/db/schema.ts` (75 tables). Conventions: text UUID keys, `timestamptz` everywhere, statuses as text with comments, and **money always in integer cents**.

| Area | Tables |
| --- | --- |
| Staff and audit | `roles`, `staff_users`, `staff_sessions`, `auth_tokens`, `audit_log`, `rate_events` |
| Settings and content | `settings`, `faq_entries`, `locations`, `cohorts`, `capacity_pools` |
| Programs and schedule | `programs`, `program_cohorts`, `program_prices`, `schedule_series`, `sessions`, `flex_days`, `blackout_dates` |
| Families | `families`, `guardians`, `children`, `emergency_contacts`, `authorized_pickups`, `family_notes`, `family_auth_tokens`, `family_invites`, `family_sessions` |
| Memberships | `memberships`, `membership_changes`, `membership_exceptions` |
| Bookings | `bookings`, `booking_items`, `booking_extras`, `booking_events`, `carts`, `capacity_overrides`, `waitlist_entries`, `waitlist_chains` |
| Attendance | `kiosk_sessions`, `attendance_records`, `late_fees`, `session_staff`, `day_feed_entries`, `day_feed_photos` |
| Forms | `form_templates`, `form_versions`, `form_requirements`, `form_submissions`, `documents` |
| Billing | `discounts`, `invoices`, `invoice_lines`, `payments`, `refunds`, `credits`, `scheduled_charges`, `cancellation_offers`, `webhook_events` |
| Wallet and Play Pass | `play_pass_plans`, `play_pass_subscriptions`, `play_pass_charges`, `wallet_allocations`, `wallet_entries`, `wallet_reservations`, `wallet_credit_notices` |
| Email | `message_templates`, `messages` |
| Coworking | `workspaces`, `workspace_rates`, `workspace_blocks`, `space_reservation_groups`, `space_reservations`, `space_entitlements` |
| Other | `enquiries`, `ops_requests` |

**Migrations** are SQL files in `lib/db/migrations/` (`0000`–`0087`), with Drizzle snapshots and a journal. Many of them also seed data such as coupons and FAQ entries. `npm run build` applies pending migrations before building (`scripts/migrate.mts`, which uses the unpooled connection).

---

## 10. Running it locally

```bash
npm install
cp .env.example .env.local      # fill in DATABASE_URL, TEST_DATABASE_URL, AUTH_SECRET (32+ chars)
npm run db:migrate
npm run db:seed                 # invented families, programs, schedule, bookings, staff
npm run dev
```

- The seed prints the sample staff sign-ins. Staff sign-in needs a two-step code: use `npm run admin:create` to make an owner, and `npm run admin:reset-mfa` if needed.
- Without Stripe or Postmark keys, the app runs on the **test payment provider** and **captures emails** instead of sending them. Nothing real can happen by accident.

**Environment variables (names only):**
- **Database:** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `TEST_DATABASE_URL`.
- **Auth and admin:** `AUTH_SECRET`, `ADMIN_SETUP_TOKEN`, `CRON_SECRET`.
- **Payments:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYMENTS_LIVE_ENABLED`, `ALLOW_TEST_PAYMENTS`.
- **Email:** `POSTMARK_SERVER_TOKEN`, `NOTIFICATIONS_MODE`, `NOTIFICATIONS_FROM`.
- **URLs:** `PUBLIC_BASE_URL`.

Never commit values.

---

## 11. Tests

- **Running them:** `npm test` runs Vitest (`tests/**/*.test.ts`, 60 files) one file at a time against a real Postgres database. `tests/setup.ts` refuses to run unless `TEST_DATABASE_URL` contains "test", forces email test mode and removes any Stripe key.
- **Fixtures:** `tests/helpers.ts` provides `program`, `session`, `family` and `owner` actors, plus `reset()`, which truncates every table and re-seeds the default roles.
- **What's covered:**
  - booking and capacity races;
  - coupons and sibling discounts;
  - wallet-first invoicing and credit emails;
  - late fees (never charged without an admin);
  - the day-feed access window;
  - roster PDFs, payment checks;
  - security rules;
  - Play Pass renewals.
- **Type-checking:** `npm run lint` runs `tsc --noEmit`.

---

## 12. Reusing this for another business

The engine is general: families or clients, people they book for, programs, sessions, capacity, holds, checkout, wallet, invoices, forms, attendance, staff roles, audit. Most of the Yalla-specific parts sit in a few places.

**Brand and copy (replace them):**
- `content/*.ts`: every public word, including programs, FAQ, policies, pricing, handbook and team.
- `components/brand/*` and `public/` images: the logo and motifs.
- `app/globals.css`: colours and fonts.
- `lib/billing/assets/`: invoice fonts and logo.
- `content/site.ts`: the issuer name and address printed on invoices.
- The default email templates in `lib/notify/index.ts`.

**Business rules (review them, all in settings or `lib/ops`):**
- Program kinds and booking modes (`lib/ops/programs.ts`). Rename `children` and `guardians` if your customers aren't families.
- Policy settings: hold minutes, cancellation cutoff, credit bonus, sibling %, late-fee grace and rate, tax %.
- Age bands, cohorts and capacity pools, if you don't group people by age.
- Program-specific modules you may not need: the drop-in waitlist chain, the coworking desks (`lib/spaces`), the Play Pass, the club membership with billing switched off.

**A good order to build your own version, using this as a reference:**
1. Schema + `lib/ops` for families, programs, sessions, bookings and holds, with the locking pattern from `createHold`.
2. Invoices with calculated totals, plus the provider interface with a test provider first.
3. Public checkout and portal.
4. Admin with roles, permissions and `adminAction`.
5. Wallet, attendance, forms, email templates and jobs.
6. Port the tests next to each piece. They are the clearest description of the rules.

**Pointing another AI coding session at this repo:** add this repository to the session and ask it to read `docs/handoff/README.md` first, then `lib/db/schema.ts`, `lib/ops/bookings.ts`, `lib/ops/billing.ts` and `lib/playpass/wallet.ts`. Those five files show most of the patterns.

---

## 13. Rules learned the hard way

These are deliberate. Keep them, or decide consciously to change them.

1. **Late fees are never charged or emailed automatically.** A late pickup is only *flagged*. An admin with `billing.manage` must approve it before any invoice or email exists, and can dismiss it instead (`lib/ops/late-fees.ts`, with a test). Voiding a late-fee invoice also dismisses the fee.
2. **The wallet always pays first.** Every new invoice uses the wallet balance automatically; only the remainder goes to a card.
3. **Some products are never billed in the app.** A flag prevents any charge for them; keep that kind of switch explicit.
4. **One credit, one email, never lost.** The notice is written in the same transaction as the credit and retried until it is sent.
5. **Nothing real during development.** The test payment provider and captured emails are the defaults. Live mode needs explicit flags.
6. **Never oversell.** Lock sessions in id order, re-check inside the transaction, and flag rather than overbook when a payment arrives late.
7. **Totals are calculated, and fixes are new lines.** No stored balances, no edited history.
8. **Every money call has an idempotency key:** checkouts, refunds, wallet debits, webhooks.
9. **Family-friendly errors.** `OpsError` messages are written for parents and staff; technical errors are logged without personal data.
10. **Synthetic data only outside production.** The seed uses example.com emails and 555 phone numbers. Never copy real family records into development or screenshots.

---

*Related docs: `docs/ADMIN.md` (staff manual), `docs/SECURITY.md`, `docs/PLAY_PASS.md`, `docs/LAUNCH_CHECKLIST.md`. `docs/ARCHITECTURE.md` describes the original stage-1 plan and is kept for history.*
