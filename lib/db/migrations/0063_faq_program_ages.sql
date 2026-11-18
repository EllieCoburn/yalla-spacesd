-- "What ages are eligible for each offering?" lists every program, so it belongs on the general FAQ
-- page only; the Camp Yalla and Happenings pages now have their own age questions. Apply the same to
-- a saved (edited) copy of these questions, if Yalla has one.
UPDATE "faq_entries" SET "pages" = ("pages" - 'camp') - 'happenings' WHERE "id" = 'ages-by-offering';--> statement-breakpoint
UPDATE "faq_entries" SET "pages" = jsonb_set("pages", '{camp}', '1') WHERE "id" = 'what-is-camp' AND "pages" ? 'camp';
