# Pre-launch security checklist

Saved from the November 2026 security review so it can be finished before launch.
Code fixes are done (see `docs/SECURITY.md`); everything below needs action outside the code or a decision.
Tick items off as you go. Never paste keys or passwords into chat or this file.

## 1. Right after promoting the security deployment (b0212e9 or later)

- [ ] Have an authenticator app ready (1Password, Google Authenticator, Authy). The admin asks every staff member to set up two-step verification at their next sign-in.
- [ ] Tell staff to expect that step.
- [ ] Vercel → Settings → Environment Variables: check `ALLOW_TEST_PAYMENTS`.
  - Production: should **not** be `true` (otherwise anyone can "pay" with the free test checkout).
  - A preview used for booking tests (on a test database): set it to `true` there only.

## 2. Accounts and access (do soon; doesn't depend on the code)

- [ ] Two-step verification on: **Vercel**, **Neon**, **GitHub**, **Stripe**, **Postmark**, and the email account those services use.
- [ ] Ask everyone else with access to those accounts to turn it on too.
- [ ] Remove anyone who no longer needs access; give the rest the lowest role that works.

## 3. Vercel settings

- [ ] Set `PUBLIC_BASE_URL` = `https://www.yallaspacesd.com` for **Production**.
- [ ] Confirm **Preview** does **not** use the production `DATABASE_URL` (previews should use a separate database with fictional data).
- [ ] Send Claude a screenshot of the environment variable **names and environments only** (values hidden).
- [ ] Turn on **Deployment Protection** for preview deployments.
- [ ] If your plan has the Vercel Firewall: add rate-limit rules for `/portal`, `/admin/login`, `/book` (ask Claude for exact paths).

## 4. Database (Neon)

- [ ] Confirm point-in-time restore is on; note how many days it covers.
- [ ] Do one test restore into a scratch branch.
- [ ] If previews share the production database, create a separate branch with fictional data for previews.

## 5. GitHub

- [ ] Turn on branch protection for `main`.
- [ ] Turn on secret scanning.

## 6. Questions to answer for Claude

- [ ] Is real families' data already in production? Was any of it ever in a preview deployment?
- [ ] How long should we keep: email logs, signed agreements/forms, and IP addresses recorded with signatures? (Claude will set up automatic deletion once decided.)
- [ ] Does Club Yalla still offer 4:30–5:00pm extended care, or only Early Bird? (Handbook)
- [ ] Should the emergency line 626.633.7483 appear in the handbook for Club Yalla families?
- [ ] Seedlings snacks: do families send them (handbook) or does Yalla provide them to solid eaters (Flex agreement)?
- [ ] Should the Family Handbook and Illness Policy be readable without signing in (families sign agreements that link to them before they have an account)?

## 7. After promoting: quick checks with Claude

- [ ] Ask Claude to check the live site's security headers.
- [ ] Ask Claude to confirm emailed links use www.yallaspacesd.com.

## 8. Before families rely on it / before live payments

- [ ] Postmark: set a message retention period (emails include children's names).
- [ ] Stripe: complete the PCI self-assessment questionnaire in the dashboard before live payments.
- [ ] Stripe: confirm the webhook endpoint and subscribed events; 2FA for all team members.
- [ ] Arrange an **independent penetration test**.
- [ ] Arrange a **privacy/legal review** (children's data, signatures, photo consent, license-exemption wording in agreements).

## 9. Optional code improvements (ask Claude when ready)

- [ ] Bot protection (Cloudflare Turnstile) on sign-up and booking — needs a Turnstile account and keys added in Vercel.
- [ ] Malware scanning for uploaded documents — needs a scanning service.
- [ ] Stricter Content Security Policy using per-request nonces (trade-off: every page becomes dynamic).
- [ ] Automatic deletion for email logs / signatures / IPs once retention periods are decided (section 6).
