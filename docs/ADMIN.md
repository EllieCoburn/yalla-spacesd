# Yalla Admin — setup & operations

The admin portal lives at **/admin**. It shares one Postgres database with the public booking
experience and the Family Portal, so availability, bookings, families, paperwork and payments are
the same records everywhere.

```
Public site (/book, /portal) ─┐
                              ├─ lib/ops/*  (capacity, bookings, billing, forms, schedule, …) ── Postgres
Admin portal (/admin) ────────┘          │
                                         ├─ lib/payments  (test sandbox · Stripe) ← signed webhooks
                                         └─ lib/notify    (outbox · test capture · Resend)
```

## 1. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string. On Vercel, add **Neon** from the Marketplace and it's set for you. |
| `AUTH_SECRET` | Yes | 32+ random characters. Encrypts two-step secrets and signs test webhooks. Generate with `openssl rand -base64 48`. |
| `ADMIN_SETUP_TOKEN` | First run | A one-time secret you type on `/admin/setup` to create the first owner. Remove after setup. |
| `PUBLIC_BASE_URL` | Recommended | e.g. `https://yallaspacesd.com`. Used in emails and payment links. |
| `CRON_SECRET` | For jobs | Protects `/api/cron/housekeeping` (expires holds/offers, applies membership changes, reminders). |
| `NOTIFICATIONS_MODE` | Optional | `test` (default — nothing is sent, messages are captured in Admin → Messages) or `live`. |
| `RESEND_API_KEY`, `NOTIFICATIONS_FROM` | For live email | Email delivery via Resend. Both required, plus `NOTIFICATIONS_MODE=live`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | For Stripe | Without these the built-in **test payment sandbox** is used. Start with Stripe *test* keys (`sk_test_…`). |
| `PAYMENTS_LIVE_ENABLED` | For real charges | Must be `true` before a live key (`sk_live_…`) is used. Prevents accidental real charges. |
| `DATABASE_POOL_SIZE` | Optional | Connections per server instance (default 5). |

Never commit secrets. `.env.local` is git-ignored; see `.env.example`.

## 2. Database & migrations

- Schema: `lib/db/schema.ts`. Migrations: `lib/db/migrations` (generated with `npm run db:generate`).
- `npm run build` runs `scripts/migrate.mts` first when `DATABASE_URL` is set, so every Vercel deploy applies pending migrations before the new code goes live.
- Manually: `npm run db:migrate`.

### Synthetic data (development & previews only)

`npm run db:seed -- --reset` loads invented families (example.com emails, 555 numbers), Yalla's programs,
cohorts and published rates, eight weeks of sessions, memberships, bookings, test payments, forms and
a waitlist. It refuses to run on production. Local staff logins (password `yalla-local-dev-only`):

| Email | Role |
| --- | --- |
| owner@yalla.test | Owner / Administrator |
| ops@yalla.test | Operations |
| educator@yalla.test | Educator |
| billing@yalla.test | Billing |

For a shared preview database set `SEED_STAFF_PASSWORD` first.

## 3. First administrator

1. Set `DATABASE_URL`, `AUTH_SECRET` and `ADMIN_SETUP_TOKEN`; deploy.
2. Visit `/admin/setup`, enter the setup token, your name, email and a 12+ character password.
3. Sign in, open **Account & security**, and turn on two-step verification (required for owners on production).
4. Invite the team from **Settings → Staff & roles**. Each person gets their own account and role.
5. Remove `ADMIN_SETUP_TOKEN`. (The setup page also disappears once any staff account exists.)

Alternative: `npm run admin:create` from a machine with `DATABASE_URL` set.

### Troubleshooting setup

- **"The admin portal needs a database"** or **"ADMIN_SETUP_TOKEN isn’t set"**: environment variables only reach deployments built *after* they were saved. Open the newest deployment (or push a change) rather than an older deployment link.
- **Vercel "Redeploy" rebuilds the same commit** it's clicked on. Redeploying an old entry brings back old code. Use the newest deployment, and "Promote to Production" if it was built as a preview.
- The setup page shows which deployment you're on and whether `ADMIN_SETUP_TOKEN` and `AUTH_SECRET` are visible to it.

## 4. Security model

- Staff accounts are separate from family accounts; families can never reach `/admin`.
- Passwords are scrypt-hashed; 5 failed attempts lock an account for 15 minutes.
- Sessions are server-side (hashed tokens), expire after 7 days or 12 idle hours, and can be signed out per device.
- Two-step verification (authenticator app, TOTP). Secrets are encrypted at rest with `AUTH_SECRET`.
- Password reset and invitations use single-use, expiring links.
- **Permissions are enforced on the server** in every page, data loader and action — not by hiding buttons. Roles are editable sets of permissions (Settings → Staff & roles). Defaults: Owner, Operations, Educator (rosters, attendance, allergies & pickups — no billing), Billing.
- Uploaded documents and signed forms are stored privately and streamed only to staff with the "Open completed forms and documents" permission. There are no public file URLs.
- The audit trail records who changed what and when. Sensitive values (care notes, signatures, document contents) are never written to it — only the fact that they changed.

## 5. Payments

- **Test sandbox (default):** checkout happens on `/pay/test/…`. Results arrive as signed webhooks through the same verification and idempotency path as Stripe. No money moves.
- **Stripe:** set test keys, create a webhook endpoint at `https://<your-domain>/api/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.closed`, and copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
- Payment status changes only from verified provider events — never from a customer reaching a success page.
- Duplicate webhook deliveries are ignored (event ids are recorded once).
- Payments arriving after a checkout hold expired re-check capacity; if the spot is gone the booking is flagged **Needs attention** instead of overbooking.
- Card details are collected on the provider's hosted page; the app never sees card numbers.
- Recurring membership charges are currently created as **scheduled charges** that staff turn into invoices. Automatic card-on-file billing (Stripe subscriptions) needs your billing policy decisions first.

### Yalla After Hours

- Runs the second Friday of every month, 5:00–9:00pm. Migration `0003_after_hours_schedule` creates the program (if missing) and
  November 2026 – October 2027 evenings on deploy. Each evening is three sessions, one per age group: 18 months – 4 years
  (8 children), 4 – 6 years (8) and 7 – 10 years (10).
- To add later months: Programs → Yalla After Hours → Schedule → **Repeating monthly**, "Second" "Friday", 17:00–21:00, once per
  age group with its capacity and age range in months (18–47, 48–83, 84–131). Or use "Copy this schedule to new dates".
- Price is $65 per child. Siblings on the same evening are capped at the family rate ($85 for up to three children, +$25 each
  additional child) as a discount line on the invoice. The rule lives in `lib/booking/family-rate.ts`.

### Camp Yalla

- Migration `0005_camp_yalla_dates` adds the confirmed 2026–27 camp days (Nov 11, 25, 27; Dec 21–23, 28–30; Jan 18; Feb 15),
  9:00am–3:00pm, each as three sessions by age group (18 months – 4 years: 8; 4 – 6 years: 8; 7 – 10 years: 10) at $160 per
  child. Days are booked individually. Add more days in Programs → Camp Yalla → Schedule (single date, with the age group fields).
- Early Bird (8:00–9:00am, $20) and a late stay (3:00–4:30pm, $30) are per-child extras chosen at checkout. They are invoiced as
  their own lines and shown on the roster. Extras and prices live in `lib/booking/addons.ts`.

### Yalla Weekends

- Migration `0007_yalla_weekends_schedule` adds monthly schedules for the first and second Saturday of every month (November
  2026 – October 2027): an AM play session (9:00am–12:00pm) and a PM play session (1:00–4:00pm), each as three sessions by age
  group (18 months – 4 years: 8; 4 – 7 years: 12; 7 – 10 years: 14) at $60 per child per play session.
- Extend or adjust the schedules in Programs → Yalla Weekends → Schedule ("Repeating monthly", with the age group fields).

## 6. Background jobs

`/api/cron/housekeeping` (with `Authorization: Bearer $CRON_SECRET`) expires lapsed holds and waitlist offers,
applies planned membership changes, makes automatic waitlist offers where enabled, and queues next-day
reminders. `vercel.json` schedules it. Vercel's Hobby plan only allows daily cron jobs. Capacity is always
computed live, so an expired hold stops counting immediately even before the job runs.

## 7. Decisions Yalla needs to make

These policies start with conservative defaults and are flagged **Needs your decision** in Settings → Policies:

- What happens financially when a booking is cancelled (prompt staff / suggest credit / nothing).
- Whether a Club Yalla absence releases the spot for drop-in resale.
- Makeup days, proration for partial months, and membership pauses.
- Sibling discount percentage, tax rate, deposits & installment plans.
- Automatic waitlist offers.

Also needed:

- **Waiver and policy language.** The seeded forms contain placeholder text. Yalla must supply reviewed language. The built-in typed e-signature records signer, relationship, timestamp, IP, user agent and the exact version signed. It is a documented workflow, not a guarantee of legal compliance. A dedicated signature provider (e.g. Dropbox Sign or DocuSign) can be connected later.
- **Cohort age ranges, programme ages, schedules and prices** for programmes other than Club Yalla and Yalla Flex.
- **Stripe account** (for real payments) and a **Resend account + verified sending domain** (for real email).
- Street address, parking and arrival instructions.

## 8. Tests

`npm test` runs end-to-end tests against a real Postgres database named in `TEST_DATABASE_URL` (its name must contain "test").
They cover: two customers racing for the last spot, multi-child bookings with insufficient capacity, failed and
delayed payments, duplicate payment notifications, cancellation releasing capacity, memberships occupying drop-in
inventory, new waiver versions requiring re-signature, staff permission boundaries, schedules across daylight saving
time, refunds failing partway and booking changes that fail without partial effects.
