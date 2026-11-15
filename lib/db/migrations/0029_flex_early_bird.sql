CREATE TABLE "flex_days" (
	"local_date" date PRIMARY KEY NOT NULL,
	"early_bird_seats" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
