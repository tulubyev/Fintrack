CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bank_connection_id" uuid NOT NULL,
	"external_account_id" varchar(100) NOT NULL,
	"account_type" varchar(50) NOT NULL,
	"account_name" varchar(100) NOT NULL,
	"balance" numeric(15, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'RUB',
	"is_active" boolean DEFAULT true,
	"last_updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(50),
	"target_id" varchar(100),
	"details" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ai_chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"messages" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" varchar(64) NOT NULL,
	"previous_token_hash" varchar(64),
	"rotated_at" timestamp,
	"device_name" varchar(200),
	"ip_address" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "auth_sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bank_code" varchar(50) NOT NULL,
	"bank_name" varchar(100) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"consent_id" varchar(100),
	"status" varchar(20) DEFAULT 'active',
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" varchar(50) NOT NULL,
	"monthly_limit" numeric(15, 2) NOT NULL,
	"current_spent" numeric(15, 2) DEFAULT '0',
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"display_name" varchar NOT NULL,
	"description" text,
	"required_fields" jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_verification_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" varchar NOT NULL,
	"previous_status" varchar NOT NULL,
	"new_status" varchar NOT NULL,
	"changed_by" varchar,
	"change_reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"document_type_id" varchar NOT NULL,
	"file_name" varchar NOT NULL,
	"file_path" varchar NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar NOT NULL,
	"checksum" varchar,
	"status" varchar DEFAULT 'uploaded' NOT NULL,
	"verification_method" varchar,
	"extracted_data" jsonb,
	"verification_notes" text,
	"verified_by" varchar,
	"verified_at" timestamp,
	"rejection_reason" text,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "family_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'member',
	"permissions" jsonb DEFAULT '{}',
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "family_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"invite_code" varchar(10),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "family_groups_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"target_amount" numeric(15, 2) NOT NULL,
	"current_amount" numeric(15, 2) DEFAULT '0',
	"target_date" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" text,
	"is_editable" boolean DEFAULT true,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"external_transaction_id" varchar(100),
	"amount" numeric(15, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'RUB',
	"description" text NOT NULL,
	"merchant" varchar(200),
	"category" varchar(50),
	"subcategory" varchar(50),
	"transaction_date" timestamp NOT NULL,
	"processing_date" timestamp DEFAULT now(),
	"is_recurring" boolean DEFAULT false,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"current_level" integer DEFAULT 1,
	"phone_verified" boolean DEFAULT false,
	"phone_verified_at" timestamp,
	"email_verified" boolean DEFAULT false,
	"email_verified_at" timestamp,
	"documents_verified" boolean DEFAULT false,
	"documents_verified_at" timestamp,
	"gosuslugi_verified" boolean DEFAULT false,
	"gosuslugi_verified_at" timestamp,
	"banking_verified" boolean DEFAULT false,
	"banking_verified_at" timestamp,
	"last_upgrade_attempt" timestamp,
	"next_upgrade_eligible" timestamp,
	"monthly_usage" numeric(15, 2) DEFAULT '0',
	"usage_reset_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"password_hash" text NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"middle_name" varchar(100),
	"phone" varchar(20) NOT NULL,
	"profile_image_url" varchar(500),
	"address" text,
	"birth_date" timestamp,
	"gender" varchar(1),
	"snils" varchar(255),
	"inn" varchar(255),
	"esia_oid" varchar(50),
	"role" varchar(20) DEFAULT 'personal',
	"admin_role" varchar(20),
	"plan_type" varchar(20) DEFAULT 'free',
	"is_verified" boolean DEFAULT false,
	"is_phone_verified" boolean DEFAULT false,
	"is_email_verified" boolean DEFAULT false,
	"verification_level_2" boolean DEFAULT false,
	"verification_level_3" boolean DEFAULT false,
	"verification_method" varchar(20),
	"two_factor_enabled" boolean DEFAULT false,
	"two_factor_secret" text,
	"two_factor_backup_codes" text[],
	"sms_code_expiry" timestamp,
	"sms_code" varchar(6),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_snils_unique" UNIQUE("snils"),
	CONSTRAINT "users_inn_unique" UNIQUE("inn"),
	CONSTRAINT "users_esia_oid_unique" UNIQUE("esia_oid")
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar NOT NULL,
	"code" varchar(10) NOT NULL,
	"target" varchar NOT NULL,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"is_used" boolean DEFAULT false,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "verification_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" integer NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"monthly_limit" numeric(15, 2) NOT NULL,
	"balance_limit" numeric(15, 2),
	"required_verifications" jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "verification_levels_level_unique" UNIQUE("level")
);
--> statement-breakpoint
CREATE TABLE "verification_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_level" integer NOT NULL,
	"current_level" integer NOT NULL,
	"status" varchar DEFAULT 'pending',
	"submitted_data" jsonb,
	"verification_results" jsonb,
	"reviewed_by" uuid,
	"review_notes" text,
	"rejection_reason" text,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_bank_connection_id_bank_connections_id_fk" FOREIGN KEY ("bank_connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_verification_history" ADD CONSTRAINT "document_verification_history_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_group_members" ADD CONSTRAINT "family_group_members_group_id_family_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_group_members" ADD CONSTRAINT "family_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_groups" ADD CONSTRAINT "family_groups_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_verifications" ADD CONSTRAINT "user_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_account_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bank_account_idx" ON "accounts" USING btree ("bank_connection_id");--> statement-breakpoint
CREATE INDEX "admin_user_idx" ON "admin_logs" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "action_idx" ON "admin_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "admin_logs_created_at_idx" ON "admin_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_session_idx" ON "ai_chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_previous_token_idx" ON "auth_sessions" USING btree ("previous_token_hash");--> statement-breakpoint
CREATE INDEX "user_bank_idx" ON "bank_connections" USING btree ("user_id","bank_code");--> statement-breakpoint
CREATE INDEX "user_budget_idx" ON "budgets" USING btree ("user_id","month","year");--> statement-breakpoint
CREATE INDEX "group_user_idx" ON "family_group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "user_goal_idx" ON "savings_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "system_settings_category_idx" ON "system_settings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "user_transaction_idx" ON "transactions" USING btree ("user_id","transaction_date");--> statement-breakpoint
CREATE INDEX "account_transaction_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "category_idx" ON "transactions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "user_verification_idx" ON "user_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "snils_idx" ON "users" USING btree ("snils");--> statement-breakpoint
CREATE INDEX "inn_idx" ON "users" USING btree ("inn");--> statement-breakpoint
CREATE INDEX "user_code_idx" ON "verification_codes" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "verification_codes_expire_idx" ON "verification_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_request_idx" ON "verification_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_request_status_idx" ON "verification_requests" USING btree ("status");