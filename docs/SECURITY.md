# Security controls

What protects families' and children's information in this app, and what must be set up outside it.
Written after the November 2026 readiness review; see that review for evidence and remaining items.

## In the app

**Staff accounts**
- Two-step verification (an authenticator app) is required for every staff account. Until it's set
  up, the only admin page a signed-in person can reach is the setup page.
- Five wrong codes lock the account for 15 minutes; a code can't be used twice.
- Moving to a new phone needs the current password, and the old app keeps working until a code from
  the new one is confirmed.
- Lost phone: an administrator uses **Settings → Staff → Reset two-step**. If the only owner is
  locked out, someone with database access runs `npm run admin:reset-mfa -- --email <their email>`.
- Sessions: 7 days at most, 12 hours idle. Disabling an account ends its sessions.

**Family accounts**
- A new account is created only after the family confirms their email (the link works once, for 24
  hours). Until then nothing, including children's details, is saved except a short-lived pending row.
- Sessions: 30 days at most, 7 days idle. Changing the password, or "Sign out on every other device",
  ends other sessions. Turning off portal access, or archiving a family, ends theirs.
- Every family action checks that the child, booking, form or offer belongs to the signed-in family.

**Links and emails**
- Booking confirmation, waitlist offer and invoice status pages need their private link (it carries a
  key derived with `AUTH_SECRET`), the family's own sign-in, or staff access.
- The message log never stores working sign-in, reset, invitation, confirmation or private links.
- Link addresses come from `PUBLIC_BASE_URL` (or Vercel's own system address), never the request.

**Abuse limits** (database-backed, keyed by one-way hashes of email or IP address)
- Family sign-in, sign-in links, sign-ups, staff sign-in, staff password resets, bookings, waitlist
  requests, Play Pass sign-ups and handbook questions. See `lib/rate-limit.ts` for the numbers.

**Browser protections** (`next.config.ts`)
- Content Security Policy, no framing by other sites, nosniff, Referrer-Policy (no referrer on link
  pages), Permissions-Policy and HSTS.
- Vercel Analytics and Speed Insights run on public pages only, without query strings.

**Payments**
- Cards are entered only on Stripe's hosted Checkout; prices are set on the server; payment status
  changes only from signature-verified webhooks, each processed once.
- The built-in test checkout is off on every Vercel deployment unless `ALLOW_TEST_PAYMENTS=true`.

**Documents**
- Stored in the database, downloadable only by staff with document permission, every download audited.
- Accepted by their contents (PDF, JPEG, PNG, WebP, HEIC), 8 MB at most.

**Housekeeping** (nightly cron): removes rate-limit records after a day, used or expired links after
7 days, unconfirmed sign-ups after 24 hours, and ended sessions after 30 days.

## Outside the app (must be set up and kept up)

- Two-step verification on Vercel, Neon, GitHub, Stripe, Postmark and the email accounts they use.
- `PUBLIC_BASE_URL` set for Production; preview deployments on a separate database with fictional data;
  Vercel Deployment Protection on previews.
- Neon point-in-time restore on, with a restore tested.
- Postmark message retention set; Stripe PCI questionnaire completed before live payments.
- An independent penetration test and a privacy/legal review before opening bookings widely.
