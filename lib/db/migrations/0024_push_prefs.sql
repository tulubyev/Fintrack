CREATE TABLE "notification_prefs" (
	"user_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"push" boolean NOT NULL,
	"email" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_prefs_user_id_type_pk" PRIMARY KEY("user_id","type"),
	CONSTRAINT "notification_prefs_type_check" CHECK ("notification_prefs"."type" in ('budget_threshold', 'recurring_upcoming', 'recurring_new', 'goal_reached', 'import', 'security_alert', 'product_news'))
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "push_provider" varchar(10);--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "push_token" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "push_token_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_hours_start" smallint DEFAULT 22 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_hours_end" smallint DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hide_push_amounts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_push_token_uq" ON "auth_sessions" USING btree ("push_token");--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_push_provider_check" CHECK ("auth_sessions"."push_provider" is null or "auth_sessions"."push_provider" in ('fcm', 'rustore', 'apns', 'webpush'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_quiet_hours_check" CHECK ("users"."quiet_hours_start" between 0 and 23 and "users"."quiet_hours_end" between 0 and 23);