DROP INDEX "user_budget_idx";--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "monthly_limit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "month" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "amount" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "period" varchar(10) DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "effective_from" date;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "effective_to" date;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "rollover" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "excluded_category_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "alert_thresholds" integer[] DEFAULT '{80,100}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
-- Перенос бюджетов v1 (строковая категория, месяц и год) в v2. Категория ищется по названию: сначала
-- системная, потом своя; если такой нет — создаётся своя категория расходов, чтобы бюджет не потерялся.
INSERT INTO "categories" ("user_id", "name", "kind")
SELECT DISTINCT ON (b."user_id", lower(btrim(b."category"))) b."user_id", left(btrim(b."category"), 60), 'expense'
FROM "budgets" b
WHERE btrim(coalesce(b."category", '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "categories" c
    WHERE c."deleted_at" IS NULL AND lower(c."name") = lower(btrim(b."category")) AND (c."user_id" IS NULL OR c."user_id" = b."user_id")
  );--> statement-breakpoint
UPDATE "budgets" b SET "category_id" = (
  SELECT c."id" FROM "categories" c
  WHERE c."deleted_at" IS NULL AND lower(c."name") = lower(btrim(b."category")) AND (c."user_id" IS NULL OR c."user_id" = b."user_id")
  ORDER BY (c."user_id" IS NULL) DESC, (c."parent_id" IS NULL) DESC
  LIMIT 1
) WHERE btrim(coalesce(b."category", '')) <> '';--> statement-breakpoint
UPDATE "budgets" SET "amount" = "monthly_limit";--> statement-breakpoint
UPDATE "budgets" SET
  "effective_from" = make_date("year", "month", 1),
  "effective_to" = (make_date("year", "month", 1) + interval '1 month' - interval '1 day')::date
WHERE "month" BETWEEN 1 AND 12 AND "year" BETWEEN 2000 AND 2100;--> statement-breakpoint
-- непригодные строки v1 (нет месяца, нет суммы, без категории, выключенные) сохраняются удалёнными
UPDATE "budgets" SET
  "effective_from" = date_trunc('month', now())::date,
  "effective_to" = (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date,
  "deleted_at" = now()
WHERE "effective_from" IS NULL;--> statement-breakpoint
UPDATE "budgets" SET "amount" = 0.01, "deleted_at" = coalesce("deleted_at", now()) WHERE "amount" IS NULL OR "amount" <= 0;--> statement-breakpoint
UPDATE "budgets" SET "deleted_at" = coalesce("deleted_at", now()) WHERE "is_active" = false OR "category_id" IS NULL;--> statement-breakpoint
-- две строки v1 на одну категорию и месяц: оставляем одну
UPDATE "budgets" b SET "deleted_at" = now()
WHERE b."deleted_at" IS NULL AND EXISTS (
  SELECT 1 FROM "budgets" o
  WHERE o."deleted_at" IS NULL AND o."user_id" = b."user_id" AND o."category_id" = b."category_id"
    AND o."effective_from" = b."effective_from" AND o."id" < b."id"
);--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "effective_from" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_user_period_idx" ON "budgets" USING btree ("user_id","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "budgets_user_updated_idx" ON "budgets" USING btree ("user_id","updated_at");--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_amount_check" CHECK ("budgets"."amount" > 0);--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_period_check" CHECK ("budgets"."period" = 'month');--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_month_start_check" CHECK (extract(day from "budgets"."effective_from") = 1);--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_range_check" CHECK ("budgets"."effective_to" is null or "budgets"."effective_to" >= "budgets"."effective_from");