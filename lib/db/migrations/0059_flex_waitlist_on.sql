-- Yalla Flex now has a waitlist: when a Flex day is full, families can join it, and a released
-- spot is offered to the next family straight away (see lib/ops/waitlist-chain.ts). The Flex
-- program was created with its waitlist switched off (0025), so the calendar showed no
-- "Join waitlist" button. Staff can still switch it off in Admin, Programs, Yalla Flex.
UPDATE "programs" SET "waitlist_enabled" = true WHERE "slug" = 'yalla-flex';
