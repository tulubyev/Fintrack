CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"title" varchar(140) NOT NULL,
	"body" text,
	"deep_link" varchar(300),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedup_key" varchar(120),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('budget_threshold', 'recurring_upcoming', 'recurring_new', 'import_done', 'goal_reached', 'system')),
	CONSTRAINT "notifications_deep_link_check" CHECK ("notifications"."deep_link" is null or ("notifications"."deep_link" like '/%' and "notifications"."deep_link" not like '//%'))
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedup_uq" ON "notifications" USING btree ("user_id","dedup_key");