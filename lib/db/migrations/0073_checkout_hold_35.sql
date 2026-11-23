-- Checkout holds: 15 → 35 minutes, so a family still on Stripe's payment page (open for at least 31
-- minutes) never loses their spot mid-payment. A different value staff chose is kept.
UPDATE "settings" SET "value" = '35'::jsonb, "updated_by" = 'Checkout hold now matches Stripe' WHERE "key" = 'booking.holdMinutes' AND "value" = '15'::jsonb;
