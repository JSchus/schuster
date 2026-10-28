CREATE TABLE "short_links" (
	"slug" text PRIMARY KEY NOT NULL,
	"target_url" text NOT NULL,
	"owner_id" text NOT NULL,
	"note" text,
	"password_hash" text,
	"expires_at" timestamp with time zone,
	"clicks" integer DEFAULT 0 NOT NULL,
	"last_clicked_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "short_links_owner_idx" ON "short_links" USING btree ("owner_id");