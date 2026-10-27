-- E1.0-T6: удаление пользователя каскадом (152-ФЗ). Старые внешние ключи снимаем по колонке, а не по имени:
-- в базах, созданных до миграций (drizzle push), имя ограничения могло отличаться — и тогда старый ключ без каскада
-- остался бы и продолжал блокировать удаление.
DO $$
DECLARE
  target record;
  fk record;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('accounts', 'user_id', 'users'),
    ('admin_logs', 'admin_user_id', 'users'),
    ('ai_chat_sessions', 'user_id', 'users'),
    ('bank_connections', 'user_id', 'users'),
    ('budgets', 'user_id', 'users'),
    ('document_verification_history', 'document_id', 'documents'),
    ('family_group_members', 'group_id', 'family_groups'),
    ('family_group_members', 'user_id', 'users'),
    ('family_groups', 'admin_user_id', 'users'),
    ('savings_goals', 'user_id', 'users'),
    ('system_settings', 'updated_by', 'users'),
    ('transactions', 'user_id', 'users'),
    ('user_verifications', 'user_id', 'users'),
    ('verification_codes', 'user_id', 'users'),
    ('verification_requests', 'user_id', 'users'),
    ('verification_requests', 'reviewed_by', 'users')
  ) AS t(tbl, col, ref) LOOP
    FOR fk IN
      SELECT c.conname FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f' AND c.conrelid = format('public.%I', target.tbl)::regclass
        AND c.confrelid = format('public.%I', target.ref)::regclass AND a.attname = target.col
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', target.tbl, fk.conname);
    END LOOP;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "admin_logs" ALTER COLUMN "admin_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_verification_history" ADD CONSTRAINT "document_verification_history_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_group_members" ADD CONSTRAINT "family_group_members_group_id_family_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_group_members" ADD CONSTRAINT "family_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_groups" ADD CONSTRAINT "family_groups_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_verifications" ADD CONSTRAINT "user_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;