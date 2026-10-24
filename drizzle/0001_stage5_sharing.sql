CREATE TYPE "public"."visibility" AS ENUM('everyone', 'people', 'private');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'viewer';--> statement-breakpoint
CREATE TABLE "approved_emails" (
	"email" text PRIMARY KEY NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"invite_id" uuid,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"note" text,
	"created_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "item_access" (
	"item_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "item_access_item_id_user_id_pk" PRIMARY KEY("item_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"token" text PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"password_hash" text,
	"allow_download" boolean DEFAULT true NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelf_access" (
	"shelf_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "shelf_access_shelf_id_user_id_pk" PRIMARY KEY("shelf_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "shelf_items" (
	"shelf_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelf_items_shelf_id_item_id_pk" PRIMARY KEY("shelf_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "shelves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_id" text NOT NULL,
	"visibility" "visibility" DEFAULT 'everyone' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "visibility" "visibility" DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "approved_emails" ADD CONSTRAINT "approved_emails_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approved_emails" ADD CONSTRAINT "approved_emails_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_access" ADD CONSTRAINT "item_access_item_id_media_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_access" ADD CONSTRAINT "item_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_item_id_media_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_access" ADD CONSTRAINT "shelf_access_shelf_id_shelves_id_fk" FOREIGN KEY ("shelf_id") REFERENCES "public"."shelves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_access" ADD CONSTRAINT "shelf_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_items" ADD CONSTRAINT "shelf_items_shelf_id_shelves_id_fk" FOREIGN KEY ("shelf_id") REFERENCES "public"."shelves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_items" ADD CONSTRAINT "shelf_items_item_id_media_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_access_user_idx" ON "item_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shares_item_idx" ON "shares" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "shelf_access_user_idx" ON "shelf_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shelf_items_item_idx" ON "shelf_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "shelves_owner_idx" ON "shelves" USING btree ("owner_id");