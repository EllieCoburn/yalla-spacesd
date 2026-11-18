-- Each family's 4-digit check-in code, entered at the lobby kiosk to check children in and out of
-- everything except Yalla Flex and Club Yalla (those use Brightwheel). See lib/ops/checkin.ts.
ALTER TABLE "families" ADD COLUMN IF NOT EXISTS "checkin_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "families_checkin_code_idx" ON "families" ("checkin_code");--> statement-breakpoint
-- Kiosk sessions: staff open the check-in screen on the lobby kiosk from Admin; each lasts one day.
CREATE TABLE IF NOT EXISTS "kiosk_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "started_by" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kiosk_sessions_token_idx" ON "kiosk_sessions" ("token_hash");--> statement-breakpoint
-- Give every existing family a code: random, unique, and never easy to guess or confused with a door code.
DO $$
DECLARE r record; c text;
BEGIN
  FOR r IN SELECT id FROM families WHERE checkin_code IS NULL LOOP
    LOOP
      c := (1000 + floor(random() * 9000))::int::text;
      EXIT WHEN c !~ '^(\d)\1{3}$'
        AND c NOT IN ('1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '2252', '2424', '2022')
        AND NOT EXISTS (SELECT 1 FROM families WHERE checkin_code = c);
    END LOOP;
    UPDATE families SET checkin_code = c WHERE id = r.id;
  END LOOP;
END $$;
