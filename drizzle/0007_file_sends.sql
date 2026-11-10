CREATE TABLE "file_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"from_user" text NOT NULL,
	"to_user" text,
	"to_email" text,
	"note" text,
	"share_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_sends" ADD CONSTRAINT "file_sends_item_id_media_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_sends" ADD CONSTRAINT "file_sends_from_user_users_id_fk" FOREIGN KEY ("from_user") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_sends" ADD CONSTRAINT "file_sends_to_user_users_id_fk" FOREIGN KEY ("to_user") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_sends_to_user_idx" ON "file_sends" USING btree ("to_user","created_at");--> statement-breakpoint
CREATE INDEX "file_sends_from_user_idx" ON "file_sends" USING btree ("from_user","created_at");