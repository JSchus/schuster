CREATE TABLE "mail_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_part" text NOT NULL,
	"owner_id" text NOT NULL,
	"label" text,
	"kind" text DEFAULT 'personal' NOT NULL,
	"member_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"paused_reason" text,
	"expires_at" timestamp with time zone,
	"received" integer DEFAULT 0 NOT NULL,
	"blocked" integer DEFAULT 0 NOT NULL,
	"last_received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_aliases_local_part_unique" UNIQUE("local_part")
);
--> statement-breakpoint
CREATE TABLE "mail_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"from_addr" text NOT NULL,
	"to_addr" text NOT NULL,
	"subject" text,
	"s3_key" text,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_reverse" (
	"token" text PRIMARY KEY NOT NULL,
	"alias_id" uuid NOT NULL,
	"external_address" text NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_aliases" ADD CONSTRAINT "mail_aliases_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_log" ADD CONSTRAINT "mail_log_alias_id_mail_aliases_id_fk" FOREIGN KEY ("alias_id") REFERENCES "public"."mail_aliases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_reverse" ADD CONSTRAINT "mail_reverse_alias_id_mail_aliases_id_fk" FOREIGN KEY ("alias_id") REFERENCES "public"."mail_aliases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_aliases_owner_idx" ON "mail_aliases" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "mail_log_alias_idx" ON "mail_log" USING btree ("alias_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_reverse_alias_addr_idx" ON "mail_reverse" USING btree ("alias_id","external_address");