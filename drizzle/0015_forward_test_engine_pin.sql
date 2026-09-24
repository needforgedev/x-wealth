-- ---------------------------------------------------------------------------
-- The engine a forward test is pinned to. `plan.md` W6-17, `CLAUDE.md` §8.2.
--
-- ## The problem this closes
--
-- `backtest_runs` records its whole `methodology`, engine vintage included, so
-- a run written by `backtest-1` is never silently reread as though `backtest-2`
-- produced it. `forward_tests` recorded `cost_model` and nothing else about the
-- machinery — and a forward test needs that fact *more* than a backtest does,
-- not less.
--
-- A backtest is one computation over fixed history. A forward test is
-- re-derived every evening for a quarter: `advanceForwardTest` replays the
-- entire window from `started_at` and diffs the result against `paper_trades`
-- (`src/server/forward-test/advance.ts`). That design is deliberate and good —
-- the ledger stays the only source of truth, a missed evening self-heals, and
-- running twice is a no-op. It has one consequence nobody had written down:
--
--   **the engine can change underneath a window that is already running.**
--
-- When it does, the replay produces trades the ledger does not contain, the
-- diff reports them as `unexplained`, and the job halts the test — correctly,
-- because `paper_trades` is append-only and there is no correction to apply,
-- only more rows written on top of a disagreement. Two open items would have
-- done exactly this: `W6-05` (circuit limits, liquidity caps, intraday
-- square-off) and `W5-17` (1-minute bars, which is a different `fill_model`).
--
-- Without these columns that halt is a mystery: the ledger and the engine
-- disagree and nothing on the row says why. With them it is a diagnosis —
-- this window was pinned to `backtest-2` under `STOP_FIRST_WHEN_AMBIGUOUS`,
-- and the engine replaying it is not that.
--
-- ## What pinning does and does not do
--
-- It **records** which behaviour was in force. It does not **restore** it —
-- there are no versioned engine code paths, and inventing them for a vintage
-- nobody has written yet would be speculative. What it buys is that a completed
-- forward test is interpretable years later on the same terms a backtest
-- already is, and that `W5-17` has a value to branch on rather than a global
-- switch that reinterprets every window ever run.
--
-- ## NOT NULL with no default, deliberately
--
-- `forward_tests` held zero rows when this was written, verified against the
-- live database, so there is nothing to backfill and no vintage to invent. If
-- this migration ever meets a populated table it will fail loudly rather than
-- stamp `backtest-2` onto a window that ran under something else — which is the
-- `W5-11` rule (a missing measurement renders as missing, never as a default
-- that reads like a measurement) applied at the point of writing.
-- ---------------------------------------------------------------------------

CREATE TYPE "public"."fill_model" AS ENUM('STOP_FIRST_WHEN_AMBIGUOUS', 'INTRABAR_1M');--> statement-breakpoint

ALTER TABLE "forward_tests" ADD COLUMN "engine_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "forward_tests" ADD COLUMN "fill_model" "public"."fill_model" NOT NULL;--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- Both columns join the freeze.
--
-- `enforce_forward_test_lifecycle` is replaced rather than added to, because a
-- second trigger on the same table would leave the order it fires in
-- unspecified. The only change is the parameter list in the freeze block: the
-- lifecycle rules, the close-once rules and the error messages are byte
-- identical to `0001`.
--
-- These two belong in that list for the same reason `cost_model` does. A test
-- whose recorded engine could be edited after the window opened would let a
-- divergence be resolved by rewriting the claim about what produced it, which
-- is the one repair this system must never offer.
-- ---------------------------------------------------------------------------

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
       OR NEW.engine_version     IS DISTINCT FROM OLD.engine_version
       OR NEW.fill_model         IS DISTINCT FROM OLD.fill_model
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
