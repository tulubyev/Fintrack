ALTER TABLE "import_rows" ADD COLUMN "categorization" jsonb;--> statement-breakpoint
ALTER TABLE "import_rows" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;