-- NEWTOYALLA: 20% off a new family's first Yalla booking of anything bookable online (Yalla Flex,
-- Camp Yalla, Happenings and the rest), once per family. Play Passes are bought through their own
-- membership checkout, which takes no coupon codes, so the code never applies to them. A family who
-- already has a confirmed booking, a Club Yalla membership or a Play Pass isn't new. Codes aren't
-- case-sensitive. Safe to re-run.
INSERT INTO "discounts" ("id", "code", "name", "kind", "value", "program_id", "program_ids", "active", "once_per_family", "first_booking_only")
VALUES (gen_random_uuid()::text, 'NEWTOYALLA', 'New to Yalla: 20% off a new family''s first booking', 'percent', 20, NULL, NULL, true, true, true)
ON CONFLICT ("code") DO NOTHING;
