CREATE TABLE "budget_alerts" (
	"budget_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"threshold" integer NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_alerts_budget_id_period_start_threshold_pk" PRIMARY KEY("budget_id","period_start","threshold")
);
--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;