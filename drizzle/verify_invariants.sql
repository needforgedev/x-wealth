-- ---------------------------------------------------------------------------
-- Invariant verification (W1-05).
--
-- Proves that the constraints in 0001 actually hold. Run it after every
-- migration, in CI, and against a fresh Supabase project before trusting it:
--
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f drizzle/verify_invariants.sql
--
-- Run it a second time as `service_role`. That role bypasses row-level
-- security, so if any of this were expressed as an RLS policy it would sail
-- straight through. It is triggers precisely so that it does not — and this
-- script is how you confirm that, rather than assume it.
--
-- Everything happens inside a transaction that rolls back, so it leaves no
-- residue and is safe to run against a populated database.
--
-- ⚠️  A row-level trigger does not fire on a statement that matches no rows.
--     Every check below inserts its own fixture first. A "guard works!" test
--     against an empty table is a false pass — this suite was written after
--     exactly that mistake.
-- ---------------------------------------------------------------------------

BEGIN;

-- Fixtures -------------------------------------------------------------------

INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-0000000000ff')
  ON CONFLICT DO NOTHING;

INSERT INTO users(id, auth_user_id, contact_name) VALUES
  ('a0000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000ff', 'verify');

INSERT INTO strategies(id, user_id, name, segment, timeframe) VALUES
  ('50000000-0000-0000-0000-0000000000ff', 'a0000000-0000-0000-0000-0000000000ff', 'verify', 'EQUITY', '1d');

INSERT INTO strategy_versions(id, strategy_id, version_no, definition) VALUES
  -- A real definition, not '{}'. `strategy_versions_definition_complete`
  -- rejects an empty object, which is the constraint doing its job — a fixture
  -- that could not be saved through the app must not be saveable here either.
  ('c0000000-0000-0000-0000-0000000000ff', '50000000-0000-0000-0000-0000000000ff', 1,
   '{"version": 1, "instruments": ["NSE:RELIANCE"], "timeframe": "1d", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "stopLossPercent": 5, "positionSizePercent": 25, "initialCapitalPaise": 10000000}'::jsonb);

INSERT INTO backtest_runs(id, strategy_version_id, period_start, period_end,
                          initial_capital_paise, cost_model, results, methodology) VALUES
  ('b0000000-0000-0000-0000-0000000000ff', 'c0000000-0000-0000-0000-0000000000ff',
   '2020-01-01', '2024-01-01', 10000000, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb);

INSERT INTO forward_tests(id, strategy_version_id, declared_hypothesis,
                          initial_capital_paise, cost_model, planned_sessions) VALUES
  ('f0000000-0000-0000-0000-0000000000ff', 'c0000000-0000-0000-0000-0000000000ff',
   'verification fixture', 10000000, '{}'::jsonb, 60);


-- Each check: the statement must raise. If it does not, we raise instead. -----

CREATE OR REPLACE FUNCTION pg_temp.must_reject(label text, stmt text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN others THEN
    RAISE NOTICE '  blocked   %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'INVARIANT BROKEN: "%" was permitted and must not be.', label;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.must_allow(label text, stmt text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE NOTICE '  allowed   %', label;
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'LEGITIMATE OPERATION BLOCKED: "%" — %', label, SQLERRM;
END;
$$;

\echo '--- append-only (x-wealth-product.md 5.1) ---'
SELECT pg_temp.must_reject('UPDATE strategy_versions',
  $$update strategy_versions set definition='{"x":1}'::jsonb where id='c0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('DELETE strategy_versions',
  $$delete from strategy_versions where id='c0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('UPDATE backtest_runs',
  $$update backtest_runs set results='{"x":1}'::jsonb where id='b0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('DELETE backtest_runs',
  $$delete from backtest_runs where id='b0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('DELETE forward_tests',
  $$delete from forward_tests where id='f0000000-0000-0000-0000-0000000000ff'$$);

\echo '--- forward-test parameter freeze (5.2) ---'
SELECT pg_temp.must_allow('DRAFT -> RUNNING',
  $$update forward_tests set status='RUNNING', started_at=now() where id='f0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('change declared_hypothesis while RUNNING',
  $$update forward_tests set declared_hypothesis='reworded' where id='f0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('change cost_model while RUNNING',
  $$update forward_tests set cost_model='{"z":1}'::jsonb where id='f0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('change initial capital while RUNNING',
  $$update forward_tests set initial_capital_paise=1 where id='f0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('RUNNING -> DRAFT (backwards)',
  $$update forward_tests set status='DRAFT' where id='f0000000-0000-0000-0000-0000000000ff'$$);

\echo '--- paper trades: closed once (5.1) ---'
INSERT INTO paper_trades(id, forward_test_id, symbol, side, qty, entry_price, entry_at) VALUES
  ('70000000-0000-0000-0000-0000000000ff', 'f0000000-0000-0000-0000-0000000000ff',
   'NSE:RELIANCE', 'BUY', 10, 2500.0000, now());

SELECT pg_temp.must_reject('partial exit (price recorded without its costs)',
  $$update paper_trades set exit_price=2600.0000 where id='70000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_allow('record the close, once',
  $$update paper_trades set exit_price=2600.0000, exit_at=now(), gross_pnl_paise=100000,
    costs_breakdown='{}'::jsonb, net_pnl_paise=95000 where id='70000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('re-close an already closed trade',
  $$update paper_trades set net_pnl_paise=999999 where id='70000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('alter a recorded entry',
  $$update paper_trades set entry_price=1.0000 where id='70000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('DELETE a recorded trade',
  $$delete from paper_trades where id='70000000-0000-0000-0000-0000000000ff'$$);

\echo '--- domain checks (10) ---'
SELECT pg_temp.must_reject('unqualified symbol (RELIANCE, not NSE:RELIANCE)',
  $$insert into paper_trades(forward_test_id,symbol,side,qty,entry_price,entry_at)
    values ('f0000000-0000-0000-0000-0000000000ff','RELIANCE','BUY',1,10.0000,now())$$);
SELECT pg_temp.must_reject('negative quantity',
  $$insert into paper_trades(forward_test_id,symbol,side,qty,entry_price,entry_at)
    values ('f0000000-0000-0000-0000-0000000000ff','NSE:INFY','BUY',-5,10.0000,now())$$);
SELECT pg_temp.must_reject('non-positive initial capital',
  $$insert into forward_tests(strategy_version_id,declared_hypothesis,initial_capital_paise,cost_model,planned_sessions)
    values ('c0000000-0000-0000-0000-0000000000ff','h',0,'{}'::jsonb,60)$$);


-- The sections that stood here verified the distribution schema: signal
-- immutability and its server-stamped published_at, the amendment chain, the
-- market_views bounds, group_strategies' one-live-link rule, subscription
-- uniqueness, and the invitation lifecycle. Those tables were dropped in 0009
-- (CLAUDE.md 8.5 — strategies and signals are private to their author), so the
-- checks went with them rather than being left to fail.
--
-- Nothing was relaxed. Every invariant removed here belonged to a table that no
-- longer exists; the ones that guard what remains are all still above.

\echo '--- strategy definitions: the six mandatory components (7.3) ---'
-- Universe, entry, exit, stop-loss, sizing, timeframe. The validator refuses
-- an incomplete one and the TypeScript type makes it unconstructable; this is
-- the layer that depends on neither, because a jsonb column takes what it is
-- given (CLAUDE.md 7.3, and 8 on invariants that rely on discipline).
SELECT pg_temp.must_allow('a complete v2 definition',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',90,'{"version": 2, "universe": {"instruments": ["NSE:RELIANCE"], "minAvgTurnoverPaise": null}, "timeframe": "1d", "direction": "LONG", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "targetPercent": null, "stopLossPercent": 5, "sizing": {"kind": "RISK_PERCENT", "riskPercent": 1}, "maxConcurrentPositions": 1, "maxExposurePercent": 100, "initialCapitalPaise": 10000000}'::jsonb)$$);
SELECT pg_temp.must_allow('a v1 definition recorded before v2 existed',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',91,'{"version": 1, "instruments": ["NSE:RELIANCE"], "timeframe": "1d", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "stopLossPercent": 5, "positionSizePercent": 25, "initialCapitalPaise": 10000000}'::jsonb)$$);
SELECT pg_temp.must_reject('a definition with no stop-loss',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',92,'{"version": 2, "universe": {"instruments": ["NSE:RELIANCE"], "minAvgTurnoverPaise": null}, "timeframe": "1d", "direction": "LONG", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "targetPercent": null, "sizing": {"kind": "RISK_PERCENT", "riskPercent": 1}, "maxConcurrentPositions": 1, "maxExposurePercent": 100, "initialCapitalPaise": 10000000}'::jsonb)$$);
SELECT pg_temp.must_reject('a stop-loss of zero, which is the absence of one',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',93,'{"version": 2, "universe": {"instruments": ["NSE:RELIANCE"], "minAvgTurnoverPaise": null}, "timeframe": "1d", "direction": "LONG", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "targetPercent": null, "stopLossPercent": 0, "sizing": {"kind": "RISK_PERCENT", "riskPercent": 1}, "maxConcurrentPositions": 1, "maxExposurePercent": 100, "initialCapitalPaise": 10000000}'::jsonb)$$);
SELECT pg_temp.must_reject('a definition with no sizing rule',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',94,'{"version": 2, "universe": {"instruments": ["NSE:RELIANCE"], "minAvgTurnoverPaise": null}, "timeframe": "1d", "direction": "LONG", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "targetPercent": null, "stopLossPercent": 5, "maxConcurrentPositions": 1, "maxExposurePercent": 100, "initialCapitalPaise": 10000000}'::jsonb)$$);
SELECT pg_temp.must_reject('sizing by an unknown kind',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',95,'{"version": 2, "universe": {"instruments": ["NSE:RELIANCE"], "minAvgTurnoverPaise": null}, "timeframe": "1d", "direction": "LONG", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "targetPercent": null, "stopLossPercent": 5, "sizing": {"kind": "BY_CONVICTION"}, "maxConcurrentPositions": 1, "maxExposurePercent": 100, "initialCapitalPaise": 10000000}'::jsonb)$$);
SELECT pg_temp.must_reject('an empty universe',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',96,'{"version": 2, "universe": {"instruments": [], "minAvgTurnoverPaise": null}, "timeframe": "1d", "direction": "LONG", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "targetPercent": null, "stopLossPercent": 5, "sizing": {"kind": "RISK_PERCENT", "riskPercent": 1}, "maxConcurrentPositions": 1, "maxExposurePercent": 100, "initialCapitalPaise": 10000000}'::jsonb)$$);
SELECT pg_temp.must_reject('a universe never asked about liquidity',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',97,'{"version": 2, "universe": {"instruments": ["NSE:TCS"]}, "timeframe": "1d", "direction": "LONG", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "targetPercent": null, "stopLossPercent": 5, "sizing": {"kind": "RISK_PERCENT", "riskPercent": 1}, "maxConcurrentPositions": 1, "maxExposurePercent": 100, "initialCapitalPaise": 10000000}'::jsonb)$$);
SELECT pg_temp.must_reject('a definition with no exit condition',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',98,'{"version": 2, "universe": {"instruments": ["NSE:RELIANCE"], "minAvgTurnoverPaise": null}, "timeframe": "1d", "direction": "LONG", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "targetPercent": null, "stopLossPercent": 5, "sizing": {"kind": "RISK_PERCENT", "riskPercent": 1}, "maxConcurrentPositions": 1, "maxExposurePercent": 100, "initialCapitalPaise": 10000000}'::jsonb)$$);
SELECT pg_temp.must_reject('a definition with no timeframe',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',99,'{"version": 2, "universe": {"instruments": ["NSE:RELIANCE"], "minAvgTurnoverPaise": null}, "direction": "LONG", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "targetPercent": null, "stopLossPercent": 5, "sizing": {"kind": "RISK_PERCENT", "riskPercent": 1}, "maxConcurrentPositions": 1, "maxExposurePercent": 100, "initialCapitalPaise": 10000000}'::jsonb)$$);
SELECT pg_temp.must_reject('a direction the engine cannot execute',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',100,'{"version": 2, "universe": {"instruments": ["NSE:RELIANCE"], "minAvgTurnoverPaise": null}, "timeframe": "1d", "direction": "SHORT", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "targetPercent": null, "stopLossPercent": 5, "sizing": {"kind": "RISK_PERCENT", "riskPercent": 1}, "maxConcurrentPositions": 1, "maxExposurePercent": 100, "initialCapitalPaise": 10000000}'::jsonb)$$);
SELECT pg_temp.must_reject('a version this build does not understand',
  $$insert into strategy_versions(strategy_id,version_no,definition) values ('50000000-0000-0000-0000-0000000000ff',101,'{"version": 3, "universe": {"instruments": ["NSE:RELIANCE"], "minAvgTurnoverPaise": null}, "timeframe": "1d", "direction": "LONG", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "targetPercent": null, "stopLossPercent": 5, "sizing": {"kind": "RISK_PERCENT", "riskPercent": 1}, "maxConcurrentPositions": 1, "maxExposurePercent": 100, "initialCapitalPaise": 10000000}'::jsonb)$$);

\echo '--- ai_interactions: the log is the evidence (3 fact 2, 8.6) ---'
-- W15-02 / AD-20. Every AI call is recorded before its output is shown, and the
-- record cannot afterwards be changed into a different one. `user_acted` and
-- `resulting_version_id` are the two exceptions: they are set once, by the
-- user's own action, and are unknowable at insert time.
INSERT INTO ai_interactions(id, user_id, context_type, input_snapshot, output,
                            model_id, prompt_version) VALUES
  ('e0000000-0000-0000-0000-0000000000ff', 'a0000000-0000-0000-0000-0000000000ff',
   'HYPOTHESIS', '{"idea": "verification fixture"}'::jsonb,
   '{"kind": "HYPOTHESIS"}'::jsonb, 'stub-0', 'verify/1');

SELECT pg_temp.must_reject('rewrite what the model was shown',
  $$update ai_interactions set input_snapshot='{"idea":"something else"}'::jsonb where id='e0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('rewrite what the model returned',
  $$update ai_interactions set output='{"kind":"HYPOTHESIS","edited":true}'::jsonb where id='e0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('attribute the call to a different model',
  $$update ai_interactions set model_id='something-better' where id='e0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('re-file the call under a different context',
  $$update ai_interactions set context_type='CRITIQUE' where id='e0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('DELETE a recorded interaction',
  $$delete from ai_interactions where id='e0000000-0000-0000-0000-0000000000ff'$$);

SELECT pg_temp.must_allow('record that the user acted, once',
  $$update ai_interactions set user_acted=true, resulting_version_id='c0000000-0000-0000-0000-0000000000ff' where id='e0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('un-record that the user acted',
  $$update ai_interactions set user_acted=false where id='e0000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('point the outcome at a different version',
  $$update ai_interactions set resulting_version_id=null where id='e0000000-0000-0000-0000-0000000000ff'$$);

-- 7.2: a hypothesis written against a strategy you have already backtested is a
-- rationalisation. The workbench may not be anchored to one, and that holds in
-- the database rather than in the prompt.
SELECT pg_temp.must_reject('a hypothesis anchored to an existing version',
  $$insert into ai_interactions(user_id,context_type,input_snapshot,output,model_id,prompt_version,strategy_version_id)
    values ('a0000000-0000-0000-0000-0000000000ff','HYPOTHESIS','{}'::jsonb,'{"kind":"HYPOTHESIS"}'::jsonb,'stub-0','verify/1','c0000000-0000-0000-0000-0000000000ff')$$);
SELECT pg_temp.must_reject('a digest about one forward test',
  $$insert into ai_interactions(user_id,context_type,input_snapshot,output,model_id,prompt_version,forward_test_id)
    values ('a0000000-0000-0000-0000-0000000000ff','DIGEST','{}'::jsonb,'{"kind":"DIGEST"}'::jsonb,'stub-0','verify/1','f0000000-0000-0000-0000-0000000000ff')$$);
SELECT pg_temp.must_reject('a post-mortem of nothing',
  $$insert into ai_interactions(user_id,context_type,input_snapshot,output,model_id,prompt_version)
    values ('a0000000-0000-0000-0000-0000000000ff','POST_MORTEM','{}'::jsonb,'{"kind":"POST_MORTEM"}'::jsonb,'stub-0','verify/1')$$);
SELECT pg_temp.must_reject('a version authored off an interaction nobody acted on',
  $$insert into ai_interactions(user_id,context_type,input_snapshot,output,model_id,prompt_version,resulting_version_id)
    values ('a0000000-0000-0000-0000-0000000000ff','COMPILE','{}'::jsonb,'{"kind":"COMPILE"}'::jsonb,'stub-0','verify/1','c0000000-0000-0000-0000-0000000000ff')$$);
SELECT pg_temp.must_allow('a post-mortem of its own forward test',
  $$insert into ai_interactions(user_id,context_type,input_snapshot,output,model_id,prompt_version,forward_test_id)
    values ('a0000000-0000-0000-0000-0000000000ff','POST_MORTEM','{}'::jsonb,'{"kind":"POST_MORTEM"}'::jsonb,'stub-0','verify/1','f0000000-0000-0000-0000-0000000000ff')$$);

\echo '--- soft-delete guard (5.1) ---'
SELECT pg_temp.must_allow('assert_no_soft_delete_columns() on a clean schema',
  $$select assert_no_soft_delete_columns()$$);

\echo ''
\echo 'All invariants hold.'

ROLLBACK;