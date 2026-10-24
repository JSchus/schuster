CREATE TABLE "playlist_access" (
	"playlist_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "playlist_access_playlist_id_user_id_pk" PRIMARY KEY("playlist_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "playlist_tracks" (
	"playlist_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playlist_tracks_playlist_id_item_id_pk" PRIMARY KEY("playlist_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_id" text NOT NULL,
	"visibility" "visibility" DEFAULT 'everyone' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shares" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "playlist_id" uuid;--> statement-breakpoint
ALTER TABLE "playlist_access" ADD CONSTRAINT "playlist_access_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_access" ADD CONSTRAINT "playlist_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_item_id_media_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playlist_access_user_idx" ON "playlist_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "playlist_tracks_item_idx" ON "playlist_tracks" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "playlists_owner_idx" ON "playlists" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shares_playlist_idx" ON "shares" USING btree ("playlist_id");--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_one_target" CHECK (("shares"."item_id" is null) <> ("shares"."playlist_id" is null));