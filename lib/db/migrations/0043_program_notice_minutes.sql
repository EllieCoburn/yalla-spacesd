ALTER TABLE "programs" ADD COLUMN "min_notice_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Booking notice is now kept in minutes (existing hour settings carried over). Camp days close
-- 30 minutes before they start, or sooner if every place is sold.
UPDATE "programs" SET "min_notice_minutes" = "min_notice_hours" * 60;
--> statement-breakpoint
UPDATE "programs" SET "min_notice_minutes" = 30 WHERE "kind" = 'camp';
--> statement-breakpoint
-- Camp Yalla age groups are now 18 months – 3 years, 4 – 7 years and 8 – 10 years.
UPDATE "sessions" SET "max_age_months" = 95, "title" = replace("title", '4 – 6 years', '4 – 7 years')
WHERE "min_age_months" = 48 AND "program_id" IN (SELECT "id" FROM "programs" WHERE "kind" = 'camp');
--> statement-breakpoint
UPDATE "sessions" SET "min_age_months" = 96, "title" = replace("title", '7 – 10 years', '8 – 10 years')
WHERE "min_age_months" = 84 AND "program_id" IN (SELECT "id" FROM "programs" WHERE "kind" = 'camp');
