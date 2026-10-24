CREATE TABLE "goal_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"date" date NOT NULL,
	"transaction_id" uuid,
	"note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "goal_contributions_amount_check" CHECK ("goal_contributions"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "savings_goals" ALTER COLUMN "target_date" SET DATA TYPE date USING "target_date"::date;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "account_baseline" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "icon" varchar(40);--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "color" varchar(7);--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_savings_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."savings_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_contrib_goal_date_idx" ON "goal_contributions" USING btree ("goal_id","date");--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Перенос старых целей (вручную): is_active=false → архив; current_amount → взнос «Начальная сумма»;
-- достигнутые — completed_at; цель с суммой ≤ 0 — удалена (иначе не пройдёт CHECK)
UPDATE "savings_goals" SET "archived_at" = coalesce("updated_at", now()) WHERE "is_active" = false;--> statement-breakpoint
UPDATE "savings_goals" SET "deleted_at" = now(), "target_amount" = 0.01 WHERE "target_amount" <= 0;--> statement-breakpoint
INSERT INTO "goal_contributions" ("goal_id", "user_id", "amount", "date", "note", "created_at", "updated_at")
SELECT "id", "user_id", "current_amount", coalesce("created_at", now())::date, 'Начальная сумма', coalesce("created_at", now()), now()
FROM "savings_goals" WHERE "current_amount" > 0;--> statement-breakpoint
UPDATE "savings_goals" SET "current_amount" = 0 WHERE "current_amount" IS NULL OR "current_amount" < 0;--> statement-breakpoint
UPDATE "savings_goals" SET "completed_at" = coalesce("updated_at", now())
WHERE "deleted_at" IS NULL AND "current_amount" >= "target_amount";--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_target_check" CHECK ("savings_goals"."target_amount" > 0);