CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"file_sha256" varchar(64) NOT NULL,
	"file_type" varchar(10) NOT NULL,
	"stored_path" varchar(300),
	"parser_code" varchar(40),
	"institution_code" varchar(30),
	"status" varchar(16) DEFAULT 'uploaded' NOT NULL,
	"error_code" varchar(40),
	"error_message" text,
	"column_mapping" jsonb,
	"parse_result" jsonb,
	"period_from" date,
	"period_to" date,
	"statement_opening_balance" numeric(15, 2),
	"statement_closing_balance" numeric(15, 2),
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parsed_at" timestamp with time zone,
	"committed_at" timestamp with time zone,
	"undone_at" timestamp with time zone,
	CONSTRAINT "import_batches_status_check" CHECK ("import_batches"."status" in ('uploaded', 'parsing', 'needs_mapping', 'preview', 'committing', 'done', 'failed', 'cancelled', 'undone')),
	CONSTRAINT "import_batches_file_type_check" CHECK ("import_batches"."file_type" in ('csv', 'xlsx', 'pdf'))
);
--> statement-breakpoint
CREATE TABLE "import_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"header_fingerprint" varchar(64) NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"parsed" jsonb NOT NULL,
	"raw" jsonb,
	"status" varchar(20) NOT NULL,
	"decision" varchar(10),
	"match_transaction_id" uuid,
	"suggested_category_id" uuid,
	"error_message" text,
	"transaction_id" uuid,
	CONSTRAINT "import_rows_status_check" CHECK ("import_rows"."status" in ('new', 'duplicate', 'possible_duplicate', 'skipped', 'error')),
	CONSTRAINT "import_rows_decision_check" CHECK ("import_rows"."decision" is null or "import_rows"."decision" in ('import', 'skip', 'merge'))
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_mappings" ADD CONSTRAINT "import_mappings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_user_created_idx" ON "import_batches" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "import_batches_user_sha_idx" ON "import_batches" USING btree ("user_id","file_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "import_mappings_user_fp_uq" ON "import_mappings" USING btree ("user_id","header_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_batch_row_uq" ON "import_rows" USING btree ("batch_id","row_index");--> statement-breakpoint
CREATE INDEX "import_rows_batch_status_idx" ON "import_rows" USING btree ("batch_id","status");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tx_dedup_uq" ON "transactions" USING btree ("account_id","dedup_hash","dedup_seq") WHERE "transactions"."deleted_at" is null and "transactions"."dedup_hash" is not null;--> statement-breakpoint
CREATE INDEX "tx_import_batch_idx" ON "transactions" USING btree ("import_batch_id") WHERE "transactions"."import_batch_id" is not null;