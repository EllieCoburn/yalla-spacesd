# Yalla — site & booking architecture

## Stack
- **Next.js (App Router) + TypeScript + Tailwind v4**, deployed on Vercel.
- **Postgres** (e.g. Neon via the Vercel Marketplace) with **Drizzle ORM** — schema in `lib/db/schema.ts`.
- **Stripe** for payments (one-off bookings via Checkout/Payment Element, memberships via Subscriptions).
- **Passwordless email sign-in** for the Family Portal (Auth.js or similar).

## Brand system
- `components/brand/marks.ts` — the original hand-drawn logo, vectorised and split into pieces
  (full mark, wordmark, roofline, arch, balcony, window, sun, palm). All render in `currentColor`.
- `Facade` — the logo rebuilt in photographs (tower + parapet, arched door, round window, palm).
- `WindowField` — the building's window grid redrawn as loose, hand-cut panes.
- `.roofline-edge` — the scalloped parapet used as the top edge of coloured bands.
- Palette and type (Lora / DM Sans) live in `app/globals.css` under `@theme`.

## Booking model (stage 2 backend, stage 1 UI)
| Concept | Notes |
| --- | --- |
| Family → guardians, children | One account, many logins and many children. Forms per family or per child. |
| Program | membership, drop_in, camp, parents_night, weekend. `booking_mode`: instant / request / enroll / inquire. |
| Schedule rule → sessions | Rules generate concrete sessions with capacity and age range. |
| Session group | Camps: several sessions booked as one. |
| Capacity | `sessions.spaces_taken` updated in the same transaction that row-locks the session (`SELECT … FOR UPDATE`), so the last space can't be double-booked. Age weights let infants count as more than one space if needed. |
| Holds | Checkout places short holds (`bookings.hold_expires_at`) so availability stays honest in real time; expired holds are released. |
| Recurrence | Repeat bookings ("every Tuesday for 8 weeks") materialise booking lines ahead of time; individual dates stay cancellable. |
| Waitlist | Per session, ordered; families are notified when a space opens. |
| Membership | Recurring enrollment (weekdays, full/half day, Early Bird care) billed by Stripe subscription. |
| Payments / credits | Stripe payment intents; optional session packs as family credits. |

The UI talks to the `BookingProvider` interface in `lib/booking/types.ts`. Today
`lib/booking/preview.ts` supplies **sample data** (no prices, placeholder times and spaces).
Swapping in a Postgres-backed provider + server actions doesn't change the pages.

## Stages
1. **Now:** full marketing site, Book Care explorer and checkout flow, Family Portal UI, data model.
2. Database + auth + real programs/schedules; admin for Yalla to manage sessions and capacity.
3. Stripe payments, memberships, cancellations/refunds, email confirmations, waitlist notifications.

## Review markers
Unconfirmed facts render with a dashed **To confirm** / **Draft** marker (`components/ui/Draft.tsx`).
Set `NEXT_PUBLIC_HIDE_DRAFT_MARKERS=true` to hide them.
