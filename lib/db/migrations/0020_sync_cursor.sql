DROP INDEX "accounts_user_updated_idx";--> statement-breakpoint
DROP INDEX "budgets_user_updated_idx";--> statement-breakpoint
DROP INDEX "categories_user_updated_idx";--> statement-breakpoint
DROP INDEX "recurring_series_user_updated_idx";--> statement-breakpoint
DROP INDEX "tx_user_updated_idx";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "sync_xid" bigint DEFAULT (pg_current_xact_id()::text::bigint) NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "sync_xid" bigint DEFAULT (pg_current_xact_id()::text::bigint) NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "sync_xid" bigint DEFAULT (pg_current_xact_id()::text::bigint) NOT NULL;--> statement-breakpoint
ALTER TABLE "category_rules" ADD COLUMN "sync_xid" bigint DEFAULT (pg_current_xact_id()::text::bigint) NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD COLUMN "sync_xid" bigint DEFAULT (pg_current_xact_id()::text::bigint) NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD COLUMN "sync_xid" bigint DEFAULT (pg_current_xact_id()::text::bigint) NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "sync_xid" bigint DEFAULT (pg_current_xact_id()::text::bigint) NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "sync_xid" bigint DEFAULT (pg_current_xact_id()::text::bigint) NOT NULL;--> statement-breakpoint
ALTER TABLE "user_category_prefs" ADD COLUMN "sync_xid" bigint DEFAULT (pg_current_xact_id()::text::bigint) NOT NULL;--> statement-breakpoint
CREATE INDEX "accounts_user_sync_idx" ON "accounts" USING btree ("user_id","sync_xid","id");--> statement-breakpoint
CREATE INDEX "budgets_user_sync_idx" ON "budgets" USING btree ("user_id","sync_xid","id");--> statement-breakpoint
CREATE INDEX "categories_user_sync_idx" ON "categories" USING btree ("user_id","sync_xid","id");--> statement-breakpoint
CREATE INDEX "category_rules_user_sync_idx" ON "category_rules" USING btree ("user_id","sync_xid","id");--> statement-breakpoint
CREATE INDEX "goal_contributions_user_sync_idx" ON "goal_contributions" USING btree ("user_id","sync_xid","id");--> statement-breakpoint
CREATE INDEX "recurring_series_user_sync_idx" ON "recurring_series" USING btree ("user_id","sync_xid","id");--> statement-breakpoint
CREATE INDEX "savings_goals_user_sync_idx" ON "savings_goals" USING btree ("user_id","sync_xid","id");--> statement-breakpoint
CREATE INDEX "tx_user_sync_idx" ON "transactions" USING btree ("user_id","sync_xid","id");--> statement-breakpoint
CREATE INDEX "user_category_prefs_user_sync_idx" ON "user_category_prefs" USING btree ("user_id","sync_xid");;--> statement-breakpoint
-- Синхронизация приложения (E2.1-T4): любое изменение строки записывает номер своей транзакции в sync_xid —
-- курсор GET /api/v1/sync. updated_at обновляется, если код не поставил его сам (массовые UPDATE, пересчёты).
-- Запись без изменений (OLD = NEW) не трогает ни то, ни другое.
CREATE OR REPLACE FUNCTION sync_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.sync_xid := pg_current_xact_id()::text::bigint;
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER accounts_sync_touch BEFORE UPDATE ON "accounts" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION sync_touch();--> statement-breakpoint
CREATE TRIGGER transactions_sync_touch BEFORE UPDATE ON "transactions" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION sync_touch();--> statement-breakpoint
CREATE TRIGGER budgets_sync_touch BEFORE UPDATE ON "budgets" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION sync_touch();--> statement-breakpoint
CREATE TRIGGER savings_goals_sync_touch BEFORE UPDATE ON "savings_goals" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION sync_touch();--> statement-breakpoint
CREATE TRIGGER goal_contributions_sync_touch BEFORE UPDATE ON "goal_contributions" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION sync_touch();--> statement-breakpoint
CREATE TRIGGER recurring_series_sync_touch BEFORE UPDATE ON "recurring_series" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION sync_touch();--> statement-breakpoint
CREATE TRIGGER categories_sync_touch BEFORE UPDATE ON "categories" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION sync_touch();--> statement-breakpoint
CREATE TRIGGER category_rules_sync_touch BEFORE UPDATE ON "category_rules" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION sync_touch();--> statement-breakpoint
CREATE TRIGGER user_category_prefs_sync_touch BEFORE UPDATE ON "user_category_prefs" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION sync_touch();
