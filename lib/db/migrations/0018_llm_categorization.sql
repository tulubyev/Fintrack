CREATE TABLE "llm_category_cache" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"category_code" varchar(50),
	"confidence" real NOT NULL,
	"model" varchar(60) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_usage_daily" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"cost_kopecks" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "llm_usage_daily_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "suggested_category_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "llm_categorization" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_usage_daily" ADD CONSTRAINT "llm_usage_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_suggested_category_id_categories_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;