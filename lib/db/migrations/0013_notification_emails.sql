ALTER TABLE "notifications" ADD COLUMN "emailed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_notifications" boolean DEFAULT true NOT NULL;