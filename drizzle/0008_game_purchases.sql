CREATE TABLE "game_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"offer" text NOT NULL,
	"cents" integer NOT NULL,
	"grant" jsonb NOT NULL,
	"device_id" text NOT NULL,
	"granted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "game_purchases_device_idx" ON "game_purchases" USING btree ("device_id","offer");