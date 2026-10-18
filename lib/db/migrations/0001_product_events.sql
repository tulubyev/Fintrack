CREATE TABLE "product_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"anonymous_id" varchar(64),
	"session_id" varchar(64),
	"name" varchar(64) NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"platform" varchar(10) NOT NULL,
	"app_version" varchar(20),
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_events_name_time_idx" ON "product_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "product_events_user_time_idx" ON "product_events" USING btree ("user_id","occurred_at");