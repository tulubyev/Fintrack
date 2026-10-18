CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"parent_id" uuid,
	"code" varchar(50),
	"name" varchar(60) NOT NULL,
	"kind" varchar(10) NOT NULL,
	"icon" varchar(40),
	"color" varchar(7),
	"tax_deduction" varchar(12),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "categories_kind_check" CHECK ("categories"."kind" in ('expense', 'income', 'transfer')),
	CONSTRAINT "categories_system_check" CHECK (("categories"."user_id" is null) = ("categories"."code" is not null))
);
--> statement-breakpoint
CREATE TABLE "user_category_prefs" (
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"custom_name" varchar(60),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_category_prefs_user_id_category_id_pk" PRIMARY KEY("user_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_category_prefs" ADD CONSTRAINT "user_category_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_category_prefs" ADD CONSTRAINT "user_category_prefs_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_code_uq" ON "categories" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_parent_name_uq" ON "categories" USING btree (coalesce("user_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name")) WHERE "categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "categories_user_updated_idx" ON "categories" USING btree ("user_id","updated_at");