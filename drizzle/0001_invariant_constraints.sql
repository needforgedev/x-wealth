-- ---------------------------------------------------------------------------
-- Invariant constraints
--
-- Hand-written. drizzle-kit generates tables and columns; it does not generate
-- triggers, grants or CHECKs, so everything that actually enforces the product's
-- hard invariants lives here and is versioned alongside the schema.
--
-- Source of truth: `x-wealth-product.md` §5. Read it before editing this file.
--
-- WHY TRIGGERS AND NOT RLS: Supabase's `service_role` bypasses row-level
-- security entirely. Anything holding the service key would walk straight
-- through an RLS-only policy. Triggers fire for every role including
-- `service_role` and the table owner, so they are the real enforcement. The
-- revoked grants below are a second layer, and RLS (added in W1-17) is a third.
--
-- These constraints are not a formality. The entire product proposition is that
-- a bad result cannot be made to disappear. If any of this is relaxed, the
-- product no longer does the one thing it claims to do.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 0. Deferred foreign keys
--
-- Three self- and mutual-references drizzle-kit could not emit: strategies and
-- strategy_versions point at each other, and two tables point at themselves.
-- ===========================================================================

ALTER TABLE "strategies"
  ADD CONSTRAINT "strategies_current_version_id_fk"
  FOREIGN KEY ("current_version_id") REFERENCES "strategy_versions"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "strategy_versions"
  ADD CONSTRAINT "strategy_versions_parent_version_id_fk"
  FOREIGN KEY ("parent_version_id") REFERENCES "strategy_versions"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint

-- An amendment is a new signal pointing at the one it supersedes. The original
-- is never edited (`x-wealth-product.md` §5.5).
ALTER TABLE "signals"
  ADD CONSTRAINT "signals_amends_signal_id_fk"
  FOREIGN KEY ("amends_signal_id") REFERENCES "signals"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint


-- ===========================================================================
-- 1. Append-only enforcement
--
-- No UPDATE. No DELETE. No soft-delete. Corrections happen by appending a new
-- record that references the old one (`x-wealth-product.md` §5.1).
-- ===========================================================================

CREATE OR REPLACE FUNCTION enforce_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only: % is not permitted. Append a new record that references the old one instead.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER strategy_versions_append_only
  BEFORE UPDATE OR DELETE ON "strategy_versions"
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE TRIGGER backtest_runs_append_only
  BEFORE UPDATE OR DELETE ON "backtest_runs"
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE TRIGGER ai_critiques_append_only
  BEFORE DELETE ON "ai_critiques"
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE TRIGGER signals_append_only
  BEFORE UPDATE OR DELETE ON "signals"
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint


-- ===========================================================================
-- 2. ai_critiques — the one permitted mutation
--
-- `advisor_acted` and `resulting_version_id` record what the *advisor* did
-- after reading a critique. They are set once, by the advisor's action, never
-- by the model. The findings themselves can never change.
-- ===========================================================================

CREATE OR REPLACE FUNCTION enforce_ai_critique_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.forward_test_id IS DISTINCT FROM OLD.forward_test_id
     OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
     OR NEW.findings IS DISTINCT FROM OLD.findings
     OR NEW.model_id IS DISTINCT FROM OLD.model_id
     OR NEW.prompt_version IS DISTINCT FROM OLD.prompt_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'ai_critiques is append-only: only advisor_acted and resulting_version_id may be set, once.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.advisor_acted IS TRUE AND NEW.advisor_acted IS DISTINCT FROM OLD.advisor_acted THEN
    RAISE EXCEPTION 'ai_critiques.advisor_acted is already recorded and cannot be changed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.resulting_version_id IS NOT NULL
     AND NEW.resulting_version_id IS DISTINCT FROM OLD.resulting_version_id THEN
    RAISE EXCEPTION 'ai_critiques.resulting_version_id is already recorded and cannot be changed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER ai_critiques_immutable
  BEFORE UPDATE ON "ai_critiques"
  FOR EACH ROW EXECUTE FUNCTION enforce_ai_critique_immutability();
--> statement-breakpoint


-- ===========================================================================
-- 3. forward_tests — parameter freeze and one-way lifecycle
--
-- `x-wealth-product.md` §5.2. Once a forward test moves to RUNNING its
-- strategy_version_id is frozen, along with everything else that defines the
-- test. Any parameter change requires abandoning this test and starting a new
-- one, and the abandoned test remains permanently visible.
--
-- Enforced here rather than in application logic, because application logic is
-- exactly what fails under deadline pressure.
-- ===========================================================================

CREATE OR REPLACE FUNCTION enforce_forward_test_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- A forward test is never deleted, in any state.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'forward_tests is append-only: abandon the test instead. An abandoned test stays visible.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Status moves forward only, along the permitted edges.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'DRAFT'   AND NEW.status IN ('RUNNING', 'ABANDONED')) OR
      (OLD.status = 'RUNNING' AND NEW.status IN ('COMPLETED', 'ABANDONED'))
    ) THEN
      RAISE EXCEPTION 'forward_tests: illegal status transition % -> %.', OLD.status, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  -- The defining parameters freeze the moment the window opens.
  IF OLD.status <> 'DRAFT' THEN
    IF NEW.strategy_version_id IS DISTINCT FROM OLD.strategy_version_id THEN
      RAISE EXCEPTION
        'forward_tests.strategy_version_id is frozen once the test is RUNNING. Abandon and start a new test.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.declared_hypothesis   IS DISTINCT FROM OLD.declared_hypothesis
       OR NEW.initial_capital_paise IS DISTINCT FROM OLD.initial_capital_paise
       OR NEW.cost_model         IS DISTINCT FROM OLD.cost_model
       OR NEW.planned_sessions   IS DISTINCT FROM OLD.planned_sessions
       OR NEW.started_at         IS DISTINCT FROM OLD.started_at
       OR NEW.planned_end_at     IS DISTINCT FROM OLD.planned_end_at THEN
      RAISE EXCEPTION
        'forward_tests: test parameters are frozen once RUNNING. Abandon and start a new test.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  -- A recorded ending is recorded once.
  IF OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at THEN
    RAISE EXCEPTION 'forward_tests.ended_at is already recorded and cannot be changed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.outcome IS NOT NULL AND NEW.outcome IS DISTINCT FROM OLD.outcome THEN
    RAISE EXCEPTION 'forward_tests.outcome is already recorded and cannot be changed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.final_results IS NOT NULL AND NEW.final_results IS DISTINCT FROM OLD.final_results THEN
    RAISE EXCEPTION 'forward_tests.final_results is already recorded and cannot be changed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'forward_tests.created_at cannot be changed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER forward_tests_lifecycle
  BEFORE UPDATE OR DELETE ON "forward_tests"
  FOR EACH ROW EXECUTE FUNCTION enforce_forward_test_lifecycle();
--> statement-breakpoint

-- A terminal test must say how it ended; a live one must not pretend to have.
ALTER TABLE "forward_tests"
  ADD CONSTRAINT "forward_tests_terminal_state_ck" CHECK (
    (status IN ('COMPLETED', 'ABANDONED') AND outcome IS NOT NULL AND ended_at IS NOT NULL)
    OR
    (status IN ('DRAFT', 'RUNNING') AND outcome IS NULL AND ended_at IS NULL)
  );
--> statement-breakpoint

ALTER TABLE "forward_tests"
  ADD CONSTRAINT "forward_tests_running_has_start_ck" CHECK (
    status = 'DRAFT' OR started_at IS NOT NULL
  );
--> statement-breakpoint


-- ===========================================================================
-- 4. paper_trades — closed once
--
-- A trade is inserted when it opens and closed exactly once. Only the exit
-- columns may go from NULL to a value; nothing already recorded can change.
-- ===========================================================================

CREATE OR REPLACE FUNCTION enforce_paper_trade_close_once()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'paper_trades is append-only: a recorded trade cannot be deleted.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Nothing about the entry, or the trade's identity, may ever change.
  IF NEW.id             IS DISTINCT FROM OLD.id
     OR NEW.forward_test_id IS DISTINCT FROM OLD.forward_test_id
     OR NEW.symbol      IS DISTINCT FROM OLD.symbol
     OR NEW.side        IS DISTINCT FROM OLD.side
     OR NEW.qty         IS DISTINCT FROM OLD.qty
     OR NEW.entry_price IS DISTINCT FROM OLD.entry_price
     OR NEW.entry_at    IS DISTINCT FROM OLD.entry_at
     OR NEW.created_at  IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'paper_trades: entry details are immutable once recorded.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- The exit is written once. An already-closed trade is closed.
  IF OLD.exit_at IS NOT NULL THEN
    RAISE EXCEPTION 'paper_trades: this trade is already closed and cannot be modified.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER paper_trades_close_once
  BEFORE UPDATE OR DELETE ON "paper_trades"
  FOR EACH ROW EXECUTE FUNCTION enforce_paper_trade_close_once();
--> statement-breakpoint

-- A closed trade is fully accounted for: price, time, gross, costs and net all
-- present together, or all absent. There is no half-recorded result, and no
-- path that yields a gross figure without its costs (`x-wealth-product.md` §5.3).
ALTER TABLE "paper_trades"
  ADD CONSTRAINT "paper_trades_exit_complete_ck" CHECK (
    (exit_at IS NULL AND exit_price IS NULL AND gross_pnl_paise IS NULL
      AND costs_breakdown IS NULL AND net_pnl_paise IS NULL)
    OR
    (exit_at IS NOT NULL AND exit_price IS NOT NULL AND gross_pnl_paise IS NOT NULL
      AND costs_breakdown IS NOT NULL AND net_pnl_paise IS NOT NULL)
  );
--> statement-breakpoint


-- ===========================================================================
-- 5. signals — server-generated publish time
--
-- `published_at` is never client-supplied and backdating is impossible
-- (`x-wealth-product.md` §5.5). The UPDATE/DELETE ban is already covered by the
-- append-only trigger above.
-- ===========================================================================

CREATE OR REPLACE FUNCTION enforce_signal_published_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.published_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER signals_server_published_at
  BEFORE INSERT ON "signals"
  FOR EACH ROW EXECUTE FUNCTION enforce_signal_published_at();
--> statement-breakpoint


-- ===========================================================================
-- 6. Domain CHECKs
-- ===========================================================================

-- Symbols are exchange-qualified: NSE:RELIANCE, never RELIANCE. NSE:RELIANCE
-- and BSE:RELIANCE are different instruments (`x-wealth-product.md` §10).
ALTER TABLE "paper_trades"
  ADD CONSTRAINT "paper_trades_symbol_qualified_ck"
  CHECK (symbol ~ '^[A-Z]{2,6}:[A-Z0-9&._-]{1,32}$');
--> statement-breakpoint

ALTER TABLE "signals"
  ADD CONSTRAINT "signals_symbol_qualified_ck"
  CHECK (symbol ~ '^[A-Z]{2,6}:[A-Z0-9&._-]{1,32}$');
--> statement-breakpoint

ALTER TABLE "portfolio_entries"
  ADD CONSTRAINT "portfolio_entries_symbol_qualified_ck"
  CHECK (symbol ~ '^[A-Z]{2,6}:[A-Z0-9&._-]{1,32}$');
--> statement-breakpoint

-- Money is a non-negative count of paise; quantities and prices are positive.
ALTER TABLE "backtest_runs"
  ADD CONSTRAINT "backtest_runs_capital_positive_ck" CHECK (initial_capital_paise > 0);
--> statement-breakpoint

ALTER TABLE "forward_tests"
  ADD CONSTRAINT "forward_tests_capital_positive_ck" CHECK (initial_capital_paise > 0);
--> statement-breakpoint

ALTER TABLE "forward_tests"
  ADD CONSTRAINT "forward_tests_sessions_positive_ck" CHECK (planned_sessions > 0);
--> statement-breakpoint

ALTER TABLE "paper_trades"
  ADD CONSTRAINT "paper_trades_qty_positive_ck" CHECK (qty > 0);
--> statement-breakpoint

ALTER TABLE "paper_trades"
  ADD CONSTRAINT "paper_trades_entry_price_positive_ck" CHECK (entry_price > 0);
--> statement-breakpoint

ALTER TABLE "pricing_tiers"
  ADD CONSTRAINT "pricing_tiers_price_non_negative_ck" CHECK (price_paise >= 0);
--> statement-breakpoint

ALTER TABLE "portfolio_entries"
  ADD CONSTRAINT "portfolio_entries_qty_positive_ck" CHECK (qty > 0);
--> statement-breakpoint

ALTER TABLE "backtest_runs"
  ADD CONSTRAINT "backtest_runs_period_ordered_ck" CHECK (period_end > period_start);
--> statement-breakpoint

-- A signal cannot amend itself.
ALTER TABLE "signals"
  ADD CONSTRAINT "signals_no_self_amend_ck" CHECK (amends_signal_id IS DISTINCT FROM id);
--> statement-breakpoint

-- A strategy version cannot be its own parent.
ALTER TABLE "strategy_versions"
  ADD CONSTRAINT "strategy_versions_no_self_parent_ck" CHECK (parent_version_id IS DISTINCT FROM id);
--> statement-breakpoint


-- ===========================================================================
-- 7. Revoked grants — the second layer
--
-- Triggers are the real enforcement because they fire for every role. These
-- grants stop the mutation earlier and make intent explicit to anyone reading
-- the database rather than the code.
--
-- `service_role` is included deliberately. It bypasses RLS, so leaving it with
-- UPDATE/DELETE here would mean the invariants rest on trigger code alone.
-- ===========================================================================

REVOKE UPDATE, DELETE ON "strategy_versions" FROM anon, authenticated, service_role;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "backtest_runs"     FROM anon, authenticated, service_role;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "signals"           FROM anon, authenticated, service_role;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "audit_log"         FROM anon, authenticated, service_role;
--> statement-breakpoint
REVOKE DELETE ON "forward_tests" FROM anon, authenticated, service_role;
--> statement-breakpoint
REVOKE DELETE ON "paper_trades"  FROM anon, authenticated, service_role;
--> statement-breakpoint
REVOKE DELETE ON "ai_critiques"  FROM anon, authenticated, service_role;
--> statement-breakpoint


-- ===========================================================================
-- 8. Assertion: no soft-delete columns on append-only tables
--
-- `x-wealth-product.md` §5.1: soft-delete is forbidden. There is no
-- `deleted_at`, no `is_archived`, no `visible` flag that would let a bad run be
-- hidden.
--
-- The natural enforcement would be a DDL event trigger, but `CREATE EVENT
-- TRIGGER` requires superuser and Supabase's `postgres` role is not one. So
-- this is a callable assertion instead: CI runs `SELECT
-- assert_no_soft_delete_columns();` on every migration, and the build fails if
-- someone adds one. Same outcome, one step later — the column would exist for
-- as long as it takes CI to run.
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
       'paper_trades', 'ai_critiques', 'signals', 'audit_log'
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

-- Fails this migration immediately if the schema is already wrong.
SELECT assert_no_soft_delete_columns();
