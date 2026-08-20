CREATE TYPE "public"."market_stance" AS ENUM('BULLISH', 'BEARISH', 'NEUTRAL');--> statement-breakpoint
CREATE TABLE "group_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "market_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"stance" "market_stance" NOT NULL,
	"symbol" text,
	"note" text,
	"disclosure_block" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" DROP CONSTRAINT "groups_linked_strategy_id_strategies_id_fk";
--> statement-breakpoint
ALTER TABLE "signals" ALTER COLUMN "forward_test_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "targets" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "group_strategies" ADD CONSTRAINT "group_strategies_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_strategies" ADD CONSTRAINT "group_strategies_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_views" ADD CONSTRAINT "market_views_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_strategies_group_id_idx" ON "group_strategies" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_strategies_strategy_id_idx" ON "group_strategies" USING btree ("strategy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_strategies_live_link_key" ON "group_strategies" USING btree ("group_id","strategy_id") WHERE "group_strategies"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "market_views_group_id_idx" ON "market_views" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "market_views_published_at_idx" ON "market_views" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_active_membership_key" ON "subscriptions" USING btree ("investor_id","group_id") WHERE "subscriptions"."status" = 'ACTIVE';--> statement-breakpoint
ALTER TABLE "groups" DROP COLUMN "linked_strategy_id";--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Hand-written constraints for this migration.
--
-- Everything above is drizzle-kit output: tables, columns, indexes. drizzle-kit
-- does not generate triggers, CHECKs or grants, so the parts that actually hold
-- the invariants are written here, in the same file, deliberately.
--
-- Read `drizzle/0001_invariant_constraints.sql` first — this extends it.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. market_views — append-only, exactly like signals
--
-- A published view is a public statement by a registered RA. It cannot be
-- edited into something else after the market moves, and it cannot be deleted
-- when it turns out wrong. That is the same reason `signals` is append-only,
-- and it applies here for the same reason.
-- ===========================================================================

CREATE TRIGGER market_views_append_only
  BEFORE UPDATE OR DELETE ON "market_views"
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

-- `published_at` is server-generated. Backdating a view is backdating a call.
CREATE OR REPLACE FUNCTION enforce_market_view_published_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.published_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER market_views_server_published_at
  BEFORE INSERT ON "market_views"
  FOR EACH ROW EXECUTE FUNCTION enforce_market_view_published_at();
--> statement-breakpoint

-- Same exchange-qualified symbol rule as everywhere else, when one is given.
ALTER TABLE "market_views"
  ADD CONSTRAINT "market_views_symbol_qualified_ck"
  CHECK (symbol IS NULL OR symbol ~ '^[A-Z]{2,6}:[A-Z0-9&._-]{1,32}$');
--> statement-breakpoint

-- The 280-character cap is load-bearing, not cosmetic. `market_views` is
-- permitted to exist at all because it is structured and bounded; an unbounded
-- text column posted into a group by an RA is the free-form advice channel that
-- `x-wealth-product.md` §8 cuts from v1. A blank note is stored as NULL rather
-- than as an empty string, so "no note" has one representation.
ALTER TABLE "market_views"
  ADD CONSTRAINT "market_views_note_bounded_ck"
  CHECK (note IS NULL OR (length(note) BETWEEN 1 AND 280 AND btrim(note) <> ''));
--> statement-breakpoint

REVOKE UPDATE, DELETE ON "market_views" FROM anon, authenticated, service_role;
--> statement-breakpoint


-- ===========================================================================
-- 2. signals — price sanity, now that rows can actually be inserted
--
-- These were never added because nothing could write to this table: every
-- insert needed a `forward_test_id` and no forward test has ever existed. This
-- migration makes that column nullable, so the first real signals arrive now
-- and the usual guards have to be in place before they do.
-- ===========================================================================

ALTER TABLE "signals"
  ADD CONSTRAINT "signals_entry_price_positive_ck" CHECK (entry_price > 0);
--> statement-breakpoint

ALTER TABLE "signals"
  ADD CONSTRAINT "signals_stop_loss_positive_ck" CHECK (stop_loss > 0);
--> statement-breakpoint

ALTER TABLE "signals"
  ADD CONSTRAINT "signals_exit_price_positive_ck"
  CHECK (exit_price IS NULL OR exit_price > 0);
--> statement-breakpoint

ALTER TABLE "signals"
  ADD CONSTRAINT "signals_validity_ordered_ck"
  CHECK (valid_until IS NULL OR valid_until > valid_from);
--> statement-breakpoint

-- `targets` is a JSON array or it is nothing. Without this a client could store
-- an object or a string and every reader would have to defend against it.
ALTER TABLE "signals"
  ADD CONSTRAINT "signals_targets_is_array_ck"
  CHECK (jsonb_typeof(targets) = 'array' AND jsonb_array_length(targets) <= 10);
--> statement-breakpoint


-- ===========================================================================
-- 3. group_strategies — a link cannot be removed before it was published
-- ===========================================================================

ALTER TABLE "group_strategies"
  ADD CONSTRAINT "group_strategies_removal_ordered_ck"
  CHECK (removed_at IS NULL OR removed_at >= published_at);
--> statement-breakpoint


-- ===========================================================================
-- 4. Extend the soft-delete assertion to cover market_views
--
-- The list of append-only tables in `assert_no_soft_delete_columns()` is
-- hardcoded, so a new append-only table is silently uncovered until it is added
-- here. CI runs this function on every migration.
-- ===========================================================================

CREATE OR REPLACE FUNCTION assert_no_soft_delete_columns()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(format('%s.%s', c.relname, a.attname), ', ')
    INTO offending
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attname IN (
       'deleted_at', 'is_archived', 'archived_at', 'visible', 'is_hidden', 'hidden_at'
     )
     AND c.relname IN (
       'strategy_versions', 'backtest_runs', 'forward_tests',
       'paper_trades', 'ai_critiques', 'signals', 'market_views', 'audit_log'
     );

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'Soft-delete is forbidden on append-only tables (x-wealth-product.md §5.1). Offending: %',
      offending
      USING ERRCODE = 'restrict_violation';
  END IF;
END;
$$;
--> statement-breakpoint

SELECT assert_no_soft_delete_columns();
