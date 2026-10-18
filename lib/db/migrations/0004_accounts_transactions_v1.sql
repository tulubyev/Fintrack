CREATE TABLE "fx_rates" (
	"date" date NOT NULL,
	"currency" varchar(3) NOT NULL,
	"rate_rub" numeric(18, 6) NOT NULL,
	"source" varchar(10) DEFAULT 'cbr' NOT NULL,
	CONSTRAINT "fx_rates_date_currency_pk" PRIMARY KEY("date","currency")
);
--> statement-breakpoint
DROP INDEX "user_transaction_idx";--> statement-breakpoint
DROP INDEX "category_idx";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "bank_connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "external_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "account_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "kind" varchar(20) DEFAULT 'debit_card' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "institution_code" varchar(30);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "source" varchar(20) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "opening_balance" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "opening_balance_date" date;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "last_four" varchar(4);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "credit_limit" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "include_in_total" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "color" varchar(7);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "icon" varchar(40);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "type" varchar(12) DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "status" varchar(10) DEFAULT 'posted' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "local_date" date;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "has_time" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_source" varchar(12) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_confidence" real;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "merchant_normalized" varchar(120);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "mcc" varchar(4);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "bank_category" varchar(100);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_group_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "source" varchar(12) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "dedup_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "dedup_seq" smallint;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "original_amount" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "original_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "amount_rub" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "exclude_from_stats" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_series_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" varchar(64) DEFAULT 'Europe/Moscow' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "base_currency" varchar(3) DEFAULT 'RUB' NOT NULL;--> statement-breakpoint
-- Перенос существующих строк (вручную, E1.1 «Миграция существующих данных»). На проде они созданы прежним
-- подключением банков и есть только у тестовых аккаунтов (D16), но миграция не должна падать и на них.
UPDATE "accounts" SET
  "kind" = CASE "account_type" WHEN 'checking' THEN 'debit_card' WHEN 'savings' THEN 'savings' WHEN 'credit' THEN 'credit_card' ELSE 'other' END,
  "source" = CASE WHEN "bank_connection_id" IS NOT NULL THEN 'bank_api' ELSE 'manual' END,
  "archived_at" = CASE WHEN "is_active" = false THEN now() END,
  -- остаток не меняется: начальный остаток = текущий минус уже записанные операции
  "opening_balance" = "balance" - coalesce((SELECT sum(t."amount") FROM "transactions" t WHERE t."account_id" = "accounts"."id"), 0);--> statement-breakpoint
UPDATE "transactions" SET
  "type" = CASE WHEN "amount" < 0 THEN 'expense' WHEN "amount" > 0 THEN 'income' ELSE 'adjustment' END,
  "source" = 'bank_api',
  "local_date" = ("transaction_date" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date,
  "amount_rub" = CASE WHEN coalesce("currency", 'RUB') = 'RUB' THEN "amount" END,
  "created_at" = coalesce("processing_date" AT TIME ZONE 'UTC', now());--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "local_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_updated_idx" ON "accounts" USING btree ("user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "tx_user_date_idx" ON "transactions" USING btree ("user_id","local_date" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tx_account_date_idx" ON "transactions" USING btree ("account_id","local_date");--> statement-breakpoint
CREATE INDEX "tx_user_cat_date_idx" ON "transactions" USING btree ("user_id","category_id","local_date") WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tx_user_updated_idx" ON "transactions" USING btree ("user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "tx_transfer_group_idx" ON "transactions" USING btree ("transfer_group_id") WHERE "transactions"."transfer_group_id" is not null;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_kind_check" CHECK ("accounts"."kind" in ('cash', 'debit_card', 'credit_card', 'current', 'savings', 'deposit', 'loan', 'digital_ruble', 'brokerage', 'iis', 'other'));--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_source_check" CHECK ("accounts"."source" in ('manual', 'import', 'bank_api'));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "tx_type_check" CHECK ("transactions"."type" in ('expense', 'income', 'transfer', 'adjustment'));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "tx_status_check" CHECK ("transactions"."status" in ('posted', 'pending'));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "tx_sign_check" CHECK (("transactions"."type" = 'expense' and "transactions"."amount" < 0) or ("transactions"."type" = 'income' and "transactions"."amount" > 0) or "transactions"."type" in ('transfer', 'adjustment'));