-- ---------------------------------------------------------------------------
-- Fix the definition CHECK from 0011, which did not actually reject anything.
-- `plan.md` W4-08.
--
-- ## What was wrong
--
-- **A CHECK constraint passes when its expression evaluates to NULL.** Only
-- FALSE rejects a row. Every leaf in 0011 was of the form
--
--     jsonb_typeof("definition"->'stopLossPercent') = 'number'
--
-- and for a *missing* key `->` yields SQL NULL, `jsonb_typeof(NULL)` yields
-- NULL, and `NULL = 'number'` is NULL rather than FALSE. The NULL propagated up
-- through every AND and OR, so a definition with no stop-loss — the exact case
-- the constraint exists to prevent — was admitted.
--
-- The constraint rejected malformed *values* and accepted missing *keys*, which
-- is close to the opposite of the requirement.
--
-- ## Why it was not caught immediately
--
-- The ad-hoc check written alongside 0011 reused one `version_no` for every
-- attempt. `strategy_versions_strategy_id_version_no_key` is unique, so the
-- first insert succeeded and every later one failed on the duplicate — and a
-- test that treats any error as success reported twelve passes for a constraint
-- that was enforcing nothing. `verify_invariants.sql`, which numbers each
-- attempt distinctly, failed on the second case immediately.
--
-- Worth remembering: a negative test that does not distinguish *why* it failed
-- is not a negative test.
--
-- ## The fix
--
-- `coalesce(..., false)` around the whole predicate, so anything unknown is
-- treated as a violation rather than a pass. Existence is also asserted
-- explicitly with `jsonb_exists`, which returns a real boolean for a missing
-- key instead of NULL.
-- ---------------------------------------------------------------------------

ALTER TABLE "strategy_versions" DROP CONSTRAINT IF EXISTS "strategy_versions_definition_complete";

ALTER TABLE "strategy_versions"
  ADD CONSTRAINT "strategy_versions_definition_complete" CHECK (
    coalesce(
      jsonb_typeof("definition") = 'object'
      AND (
        -- Recorded before V2 existed. Readable forever, writable by nothing.
        "definition"->>'version' = '1'

        OR (
          "definition"->>'version' = '2'

          -- 1. Universe, with its liquidity filter. A non-empty instrument
          --    list, and the floor present — null is a decision the author
          --    made, an absent key is a question never asked.
          AND jsonb_exists("definition", 'universe')
          AND jsonb_typeof("definition"->'universe'->'instruments') = 'array'
          AND jsonb_array_length("definition"->'universe'->'instruments') >= 1
          AND jsonb_exists("definition"->'universe', 'minAvgTurnoverPaise')

          -- 2. Entry, and 3. exit.
          AND jsonb_exists("definition", 'entry')
          AND jsonb_typeof("definition"->'entry') = 'object'
          AND jsonb_exists("definition", 'exit')
          AND jsonb_typeof("definition"->'exit') = 'object'

          -- 4. Stop-loss. Present, numeric, above zero — a stop of zero is not
          --    a loose stop, it is the absence of one wearing a number.
          AND jsonb_exists("definition", 'stopLossPercent')
          AND jsonb_typeof("definition"->'stopLossPercent') = 'number'
          AND ("definition"->>'stopLossPercent')::numeric > 0

          -- 5. Position sizing, as a tagged rule rather than a bare number.
          AND jsonb_exists("definition", 'sizing')
          AND jsonb_typeof("definition"->'sizing') = 'object'
          AND "definition"->'sizing'->>'kind' IN ('RISK_PERCENT', 'CAPITAL_PERCENT')

          -- 6. Timeframe.
          AND jsonb_exists("definition", 'timeframe')
          AND jsonb_typeof("definition"->'timeframe') = 'string'

          -- Everything else V2 requires. `targetPercent` may be null, but the
          -- key has to be there, for the same reason as the liquidity floor.
          AND "definition"->>'direction' = 'LONG'
          AND jsonb_exists("definition", 'targetPercent')
          AND jsonb_typeof("definition"->'maxConcurrentPositions') = 'number'
          AND jsonb_typeof("definition"->'maxExposurePercent') = 'number'
          AND jsonb_typeof("definition"->'initialCapitalPaise') = 'number'
        )
      ),
      false
    )
  );
