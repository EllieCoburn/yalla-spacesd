# Prompt: make the Yalla Flex waitlist seamless

You're working on the Yalla Childcare & Coworking website (Next.js 16, Postgres + Drizzle, Stripe, Postmark), repo `EllieCoburn/yalla-spacesd`. Families book Yalla Flex days (drop-in childcare plus coworking) by age group. A Flex day is full until staff release spots. When a day is full, families can join its waitlist.

## Why this matters

Flex spots open at short notice, often the evening before or the morning of a day. A family on the waitlist wants that spot, and if it takes them more than a minute or two to get from "a spot opened" to "booked", the spot goes unused or the family misses out. The waitlist has to feel instant and effortless:

- the email arrives the moment a spot opens
- one tap takes the family straight to checkout with the spot already held for them
- everyone in line is treated fairly and kept informed, without being spammed

## What exists today (read these first)

- `lib/ops/waitlist.ts`: `joinWaitlist`, `makeOffer` (creates a held booking for the family and sends `waitlist_offer`), `expireOffers`, `autoOffer` (offers freed spots in queue order, only when the program's `waitlistAutoOffer` is on).
- `autoOffer` only runs from the daily housekeeping cron (`lib/jobs.ts`, `runHousekeeping`), so today offers go out once a day, not immediately.
- Offer window: `programs.offerWindowHours` (default 24 hours).
- Ways a Flex spot opens:
  - `lib/ops/flex.ts`: `adjustFlexSpots` and `setWeeklyVacancies` (staff release spots), `ensureFlexDays` (new days added to the calendar)
  - cancellations in `lib/ops/bookings.ts` and `lib/ops/public-booking.ts`
  - expired holds (`expireHolds`)
- Flex booking closes at 8:00am on the day (`FLEX_HOURS.bookBy` in `lib/booking/flex.ts`).
- Offer page and checkout: `offerPath()` in `lib/links.ts`, `app/(site)/book/offer/[ref]`. Held bookings go through `startCheckout`.
- Email: the `waitlist_offer` template in `lib/notify/index.ts` (DEFAULT_TEMPLATES, TEMPLATE_VARIABLES, SAMPLE_VARIABLES), rendered by `lib/notify/html.ts`. A bare URL on its own line becomes a button; the label comes from `BUTTON[key]`.

## What to build

### 1. Offer immediately

The moment a spot opens on a Flex day that has families waiting, the next family in line gets the offer email. "Opens" means any of:

- staff release a spot or change weekly vacancies
- a new Flex day is added with room
- a booking is cancelled
- a held booking expires

Trigger the offer from those code paths directly; don't wait for the daily cron. Keep the cron as a safety net. If several spots open at once, offer as many families as there are spots, in queue order, respecting party size.

### 2. The offer email: one tap to book

- Subject and first line say plainly that a spot is open for their child and that they've come off the waitlist.
- One big **Book spot now** button. It opens the held booking and takes them straight into checkout: details prefilled, nothing to re-select. Only steps that are truly still needed (e.g. a missing agreement) appear.
- Show the day, the time, and the child or children.

### 3. The 15-minute line, and the note

Each offer holds the spot for that family for **15 minutes** (Flex only; keep other programs' windows as they are).

If there is at least one more family behind them in line, the email includes a note:

> There is currently more than one family on the waitlist for this spot. You have 15 minutes to check out before the next family is given the opportunity to book it.

The **last** family in line gets no note. Examples:

- 1 family waiting: family 1 has no note.
- 2 families: family 1 has the note; family 2 has none.
- 4 families: families 1, 2 and 3 have the note; family 4 has none.

After 15 minutes without a booking, the next family gets their offer (with or without the note, by the same rule). Earlier families are **not** emailed at that point.

### 4. Earlier families can still book while the spot is open

When the window passes to the next family, earlier families' **Book spot now** links keep working for as long as the spot is still open. If they click it, they can still check out; whoever completes checkout first gets the spot.

If the spot is still open, earlier families are never told anything: they find out by clicking. Make sure two families can never both pay for the same spot. The capacity check at checkout and payment must hold, and anyone who loses the race sees a clear, friendly message, never a charge.

### 5. When a later family takes the spot

Only when the spot is actually booked by a later family on the waitlist, send each earlier family who was offered it (and didn't book) a short courtesy email:

- **Before 8:00am on the day of the session:** "The spot was booked by another family, and you've been placed back on the waitlist for this day." Put their entry back to waiting at their original place in line.
- **At or after 8:00am on the day:** "The waitlist for this Flex session is now closed." Include a link to book another Flex day.

Do **not** send this when the spot stays open, when the family who was offered it books it themselves, or when someone outside the waitlist books it. (If that last case can happen while offers are out, say how you'd handle it and ask.)

## Things to decide with Yalla before building (ask, don't guess)

- Does the 15-minute window apply to all Flex waitlist offers, any time of day, including overnight? A spot that opens at 11pm would pass through several families before anyone's awake.
- Should released Flex spots always auto-offer, or only when the program's automatic offers setting is on?
- What happens to the queue at the 8:00am cutoff: everyone still waiting gets the "closed" email, or nothing?

## Ground rules

- Never send real emails, texts or payments while developing or testing. Use synthetic data and the test payment provider.
- Wording: never "classroom", "daycare", "school", "teacher" or "preschoolers". There is no front desk (families check in at the kiosk in the lobby).
- Every email uses the branded templates, editable in Admin → Communications, with sample variables for the preview.
- Add tests (Vitest, `tests/`) for:
  - the note rule for 1, 2 and 4 families
  - the 15-minute hand-off
  - an earlier family still booking while the spot is open
  - no double booking
  - courtesy emails only when a later family books
  - the before and after 8:00am wording
- Run `npx tsc --noEmit`, `npx vitest run` and `npm run build`.
- Commit to `claude/youthful-davinci-2vog19`, push, and tell me the commit to promote in Vercel.
