-- ---------------------------------------------------------------------------
-- The six mandatory components, enforced at the data layer. `plan.md` W4-08.
--
-- `CLAUDE.md` §7.3: a strategy missing any of universe (with its liquidity
-- filter), entry, exit, stop-loss, position sizing or timeframe **cannot be
-- saved**. The validator already refuses one, and the TypeScript type makes an
-- incomplete V2 unconstructable — but §8 is explicit that an invariant relying
-- on developer discipline will eventually be violated. A jsonb column accepts
-- whatever a caller sends; this is the layer that does not.
--
-- ## Version 1 rows are accepted unchanged
--
-- Six of them exist, one frozen inside a RUNNING forward test, and they are
-- append-only. The constraint therefore admits `version = 1` without further
-- inspection: it governs what may be *written* from now on, and V1 can no
-- longer be written because nothing authors it.
--
-- ## `jsonb_exists(...)` rather than the `?` operator
--
-- `definition ? 'entry'` is the idiomatic spelling and would be a trap here.
-- `?` is a parameter placeholder in several drivers, so the same statement that
-- works in psql can arrive at the server mangled — or fail to arrive. The
-- function form is exactly equivalent and has no such ambiguity.
--
-- ## What is deliberately not checked
--
-- Ranges. Whether a stop of 40% is sensible is a judgement the validator makes
-- and an author can argue with; whether a stop *exists* is not. A CHECK that
-- encoded opinions about good strategy would be enforcing taste at the data
-- layer, and `LIMITS` is where taste belongs. The one numeric assertion below —
-- a positive stop — is there because a stop of zero is not a loose stop, it is
-- the absence of one wearing a number.
-- ---------------------------------------------------------------------------

ALTER TABLE "strategy_versions"
  ADD CONSTRAINT "strategy_versions_definition_complete" CHECK (
    jsonb_typeof("definition") = 'object'
    AND (
      -- Recorded before V2 existed. Readable forever, writable by nothing.
      "definition"->>'version' = '1'

      OR (
        "definition"->>'version' = '2'

        -- 1. Universe, with its liquidity filter. The instrument list must be a
        --    non-empty array, and the floor must be *present* — null is a
        --    decision the author made, an absent key is a question never asked.
        AND jsonb_exists("definition", 'universe')
        AND jsonb_typeof("definition"->'universe'->'instruments') = 'array'
        AND jsonb_array_length("definition"->'universe'->'instruments') >= 1
        AND jsonb_exists("definition"->'universe', 'minAvgTurnoverPaise')

        -- 2. Entry, and 3. exit.
        AND jsonb_typeof("definition"->'entry') = 'object'
        AND jsonb_typeof("definition"->'exit') = 'object'

        -- 4. Stop-loss. Present, numeric, and greater than zero.
        AND jsonb_typeof("definition"->'stopLossPercent') = 'number'
        AND ("definition"->>'stopLossPercent')::numeric > 0

        -- 5. Position sizing, as a tagged rule rather than a bare number.
        AND jsonb_typeof("definition"->'sizing') = 'object'
        AND "definition"->'sizing'->>'kind' IN ('RISK_PERCENT', 'CAPITAL_PERCENT')

        -- 6. Timeframe.
        AND jsonb_typeof("definition"->'timeframe') = 'string'

        -- Everything else V2 requires. `targetPercent` may be null but the key
        -- has to be there, for the same reason as the liquidity floor.
        AND "definition"->>'direction' = 'LONG'
        AND jsonb_exists("definition", 'targetPercent')
        AND jsonb_typeof("definition"->'maxConcurrentPositions') = 'number'
        AND jsonb_typeof("definition"->'maxExposurePercent') = 'number'
        AND jsonb_typeof("definition"->'initialCapitalPaise') = 'number'
      )
    )
  );
