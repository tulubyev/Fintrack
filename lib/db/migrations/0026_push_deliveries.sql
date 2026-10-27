CREATE TABLE "push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"notification_id" uuid,
	"session_id" uuid,
	"provider" varchar(10) NOT NULL,
	"status" varchar(16) NOT NULL,
	"provider_message_id" varchar(200),
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_deliveries_status_check" CHECK ("push_deliveries"."status" in ('sent', 'failed', 'invalid_token', 'no_adapter'))
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "push_processed_at" timestamp with time zone;--> statement-breakpoint
-- уведомления, созданные до push, считаем обработанными: иначе первая отправка разошлёт их задним числом
UPDATE "notifications" SET "push_processed_at" = now() WHERE "push_processed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_deliveries_user_created_idx" ON "push_deliveries" USING btree ("user_id","created_at");