-- EDITED BY HAND. Supabase owns `auth` — these two statements were emitted as
-- bare CREATEs despite `schemaFilter: ["public"]`, which would fail against a
-- real Supabase project where both already exist. Made idempotent so this
-- migration is a no-op there and still works on a bare Postgres.
--
-- This edit is one-time: drizzle/meta records auth.users in the snapshot, so
-- later `drizzle-kit generate` runs diff against it and will not re-emit these.
-- If you ever see them return, re-apply the IF NOT EXISTS treatment.
CREATE SCHEMA IF NOT EXISTS "auth";
--> statement-breakpoint
CREATE TYPE "public"."advisor_document_type" AS ENUM('SEBI_REGISTRATION_CERTIFICATE', 'RAASB_ENLISTMENT', 'PAN_CARD', 'FIRM_INCORPORATION', 'ADDRESS_PROOF', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."billing_period" AS ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL');--> statement-breakpoint
CREATE TYPE "public"."document_review_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."experience_level" AS ENUM('BEGINNER', 'INTERMEDIATE', 'EXPERT', 'SUPER_PRO');--> statement-breakpoint
CREATE TYPE "public"."forward_test_outcome" AS ENUM('COMPLETED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."forward_test_status" AS ENUM('DRAFT', 'RUNNING', 'COMPLETED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."group_visibility" AS ENUM('PUBLIC', 'PRIVATE');--> statement-breakpoint
CREATE TYPE "public"."market_segment" AS ENUM('EQUITY', 'FNO', 'COMMODITY', 'CURRENCY');--> statement-breakpoint
CREATE TYPE "public"."risk_profile" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('BUY', 'SELL');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('UNSUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth"."users" (
	"id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advisor_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_id" uuid NOT NULL,
	"doc_type" "advisor_document_type" NOT NULL,
	"storage_ref" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_status" "document_review_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE "advisors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sebi_registration_no" text NOT NULL,
	"raasb_enlistment_no" text,
	"firm_name" text,
	"mca_no" text,
	"pan_encrypted" text,
	"registration_valid_until" timestamp with time zone,
	"verification_status" "verification_status" DEFAULT 'UNSUBMITTED' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"parrva_opted_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"segment" "market_segment" NOT NULL,
	"timeframe" text NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"hypothesis_text" text,
	"parent_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backtest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_version_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"initial_capital_paise" bigint NOT NULL,
	"cost_model" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"methodology" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forward_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_version_id" uuid NOT NULL,
	"status" "forward_test_status" DEFAULT 'DRAFT' NOT NULL,
	"declared_hypothesis" text NOT NULL,
	"initial_capital_paise" bigint NOT NULL,
	"cost_model" jsonb NOT NULL,
	"planned_sessions" integer NOT NULL,
	"started_at" timestamp with time zone,
	"planned_end_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"outcome" "forward_test_outcome",
	"abandon_reason" text,
	"final_results" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"forward_test_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"qty" integer NOT NULL,
	"entry_price" numeric(18, 4) NOT NULL,
	"entry_at" timestamp with time zone NOT NULL,
	"exit_price" numeric(18, 4),
	"exit_at" timestamp with time zone,
	"gross_pnl_paise" bigint,
	"costs_breakdown" jsonb,
	"net_pnl_paise" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_critiques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"forward_test_id" uuid NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"findings" jsonb NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"advisor_acted" boolean DEFAULT false NOT NULL,
	"resulting_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experience_level" "experience_level",
	"interests" text[],
	"risk_ack_at" timestamp with time zone,
	"suitability" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" "group_visibility" DEFAULT 'PUBLIC' NOT NULL,
	"segment" "market_segment" NOT NULL,
	"linked_strategy_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_paise" bigint NOT NULL,
	"billing_period" "billing_period" NOT NULL,
	"signal_quota" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"forward_test_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"entry_price" numeric(18, 4) NOT NULL,
	"exit_price" numeric(18, 4),
	"stop_loss" numeric(18, 4) NOT NULL,
	"timeframe" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"rationale" text,
	"risk_profile" "risk_profile" NOT NULL,
	"chart_ref" text,
	"disclosure_block" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"amends_signal_id" uuid
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'ACTIVE' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"qty" integer NOT NULL,
	"avg_price" numeric(18, 4) NOT NULL,
	"transaction_date" date NOT NULL,
	"source_signal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_table" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advisor_documents" ADD CONSTRAINT "advisor_documents_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisor_documents" ADD CONSTRAINT "advisor_documents_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisors" ADD CONSTRAINT "advisors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisors" ADD CONSTRAINT "advisors_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_runs" ADD CONSTRAINT "backtest_runs_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forward_tests" ADD CONSTRAINT "forward_tests_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_forward_test_id_forward_tests_id_fk" FOREIGN KEY ("forward_test_id") REFERENCES "public"."forward_tests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_critiques" ADD CONSTRAINT "ai_critiques_forward_test_id_forward_tests_id_fk" FOREIGN KEY ("forward_test_id") REFERENCES "public"."forward_tests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_critiques" ADD CONSTRAINT "ai_critiques_resulting_version_id_strategy_versions_id_fk" FOREIGN KEY ("resulting_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_linked_strategy_id_strategies_id_fk" FOREIGN KEY ("linked_strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ADD CONSTRAINT "pricing_tiers_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_forward_test_id_forward_tests_id_fk" FOREIGN KEY ("forward_test_id") REFERENCES "public"."forward_tests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tier_id_pricing_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."pricing_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_entries" ADD CONSTRAINT "portfolio_entries_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_entries" ADD CONSTRAINT "portfolio_entries_source_signal_id_signals_id_fk" FOREIGN KEY ("source_signal_id") REFERENCES "public"."signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advisor_documents_advisor_id_idx" ON "advisor_documents" USING btree ("advisor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "advisors_user_id_key" ON "advisors" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "advisors_sebi_registration_no_key" ON "advisors" USING btree ("sebi_registration_no");--> statement-breakpoint
CREATE INDEX "advisors_verification_status_idx" ON "advisors" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "strategies_advisor_id_idx" ON "strategies" USING btree ("advisor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_versions_strategy_id_version_no_key" ON "strategy_versions" USING btree ("strategy_id","version_no");--> statement-breakpoint
CREATE INDEX "strategy_versions_parent_idx" ON "strategy_versions" USING btree ("parent_version_id");--> statement-breakpoint
CREATE INDEX "backtest_runs_strategy_version_id_idx" ON "backtest_runs" USING btree ("strategy_version_id");--> statement-breakpoint
CREATE INDEX "forward_tests_strategy_version_id_idx" ON "forward_tests" USING btree ("strategy_version_id");--> statement-breakpoint
CREATE INDEX "forward_tests_status_idx" ON "forward_tests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "paper_trades_forward_test_id_idx" ON "paper_trades" USING btree ("forward_test_id");--> statement-breakpoint
CREATE INDEX "paper_trades_symbol_idx" ON "paper_trades" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "ai_critiques_forward_test_id_idx" ON "ai_critiques" USING btree ("forward_test_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investors_user_id_key" ON "investors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_advisor_id_idx" ON "groups" USING btree ("advisor_id");--> statement-breakpoint
CREATE INDEX "pricing_tiers_group_id_idx" ON "pricing_tiers" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "signals_group_id_idx" ON "signals" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "signals_strategy_id_idx" ON "signals" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "signals_published_at_idx" ON "signals" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "subscriptions_investor_id_idx" ON "subscriptions" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "subscriptions_group_id_idx" ON "subscriptions" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "portfolio_entries_investor_id_idx" ON "portfolio_entries" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "portfolio_entries_source_signal_id_idx" ON "portfolio_entries" USING btree ("source_signal_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_table","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");