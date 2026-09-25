-- ---------------------------------------------------------------------------
-- A CRITIQUE names the strategy version it is of. `plan.md` W7-01/W7-03…07.
--
-- `0013` left CRITIQUE and COMPILE deliberately unconstrained: *"W7's shape is
-- not settled, and a constraint encoding a guess about it would be 0011
-- again."* W7's critique landed on 25 Sep 2026 and its shape is now a fact —
-- a critique reads one recorded backtest run, and a run belongs to exactly one
-- strategy version. An interaction row claiming to be a critique of nothing
-- would be a finding that cannot be traced to what it criticised, which is the
-- reproducibility failure `model_id` and `prompt_version` exist to prevent,
-- one column over.
--
-- The run itself is carried as `backtestRunId` inside `input_snapshot` rather
-- than as a column: `ai_interactions` is the generic log of every AI surface,
-- and growing one nullable FK per context is how the old `ai_critiques` table
-- ended up anchored to the one thing four of five contexts do not have
-- (AD-20). The version FK already exists and is the invariant worth enforcing;
-- the snapshot carries the rest, verbatim, as it does for every context.
--
-- COMPILE stays unconstrained on purpose — a compile of a brand-new idea has
-- no version to name until the user saves one, and `resulting_version_id` is
-- how acting on it is recorded afterwards.
--
-- `coalesce(..., false)` as always: a CHECK passes when its expression is
-- NULL, and anything unknown has to be turned into a rejection explicitly
-- (the 0012 lesson).
-- ---------------------------------------------------------------------------

ALTER TABLE "ai_interactions"
  ADD CONSTRAINT "ai_interactions_critique_has_a_version" CHECK (
    coalesce(
      "context_type" <> 'CRITIQUE' OR "strategy_version_id" IS NOT NULL,
      false
    )
  );
