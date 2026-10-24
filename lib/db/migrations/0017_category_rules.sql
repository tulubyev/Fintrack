CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"field" varchar(12) NOT NULL,
	"op" varchar(11) NOT NULL,
	"pattern" varchar(200) NOT NULL,
	"account_id" uuid,
	"direction" varchar(3),
	"amount_min" numeric(15, 2),
	"amount_max" numeric(15, 2),
	"category_id" uuid NOT NULL,
	"rename_merchant_to" varchar(120),
	"priority" integer DEFAULT 100 NOT NULL,
	"source" varchar(12) NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "category_rules_field_check" CHECK ("category_rules"."field" in ('merchant', 'description', 'mcc')),
	CONSTRAINT "category_rules_op_check" CHECK ("category_rules"."op" in ('equals', 'contains', 'starts_with')),
	CONSTRAINT "category_rules_direction_check" CHECK ("category_rules"."direction" is null or "category_rules"."direction" in ('in', 'out')),
	CONSTRAINT "category_rules_source_check" CHECK ("category_rules"."source" in ('correction', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_rules_user_idx" ON "category_rules" USING btree ("user_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "category_rules_uq" ON "category_rules" USING btree ("user_id","field","op","pattern",coalesce("account_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "category_rules"."deleted_at" is null;