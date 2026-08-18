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

INSERT INTO advisors(id, user_id, sebi_registration_no) VALUES
  ('a0000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000ff', 'INH_VERIFY_ONLY');

INSERT INTO strategies(id, advisor_id, name, segment, timeframe) VALUES
  ('50000000-0000-0000-0000-0000000000ff', 'a0000000-0000-0000-0000-0000000000ff', 'verify', 'EQUITY', '1d');

INSERT INTO strategy_versions(id, strategy_id, version_no, definition) VALUES
  ('c0000000-0000-0000-0000-0000000000ff', '50000000-0000-0000-0000-0000000000ff', 1, '{}'::jsonb);

INSERT INTO backtest_runs(id, strategy_version_id, period_start, period_end,
                          initial_capital_paise, cost_model, results, methodology) VALUES
  ('b0000000-0000-0000-0000-0000000000ff', 'c0000000-0000-0000-0000-0000000000ff',
   '2020-01-01', '2024-01-01', 10000000, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb);

INSERT INTO forward_tests(id, strategy_version_id, declared_hypothesis,
                          initial_capital_paise, cost_model, planned_sessions) VALUES
  ('f0000000-0000-0000-0000-0000000000ff', 'c0000000-0000-0000-0000-0000000000ff',
   'verification fixture', 10000000, '{}'::jsonb, 60);

INSERT INTO groups(id, advisor_id, name, segment) VALUES
  ('60000000-0000-0000-0000-0000000000ff', 'a0000000-0000-0000-0000-0000000000ff', 'verify', 'EQUITY');

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

\echo '--- signals: immutable and server-stamped (5.5) ---'
UPDATE forward_tests SET status='COMPLETED', outcome='COMPLETED', ended_at=now()
  WHERE id='f0000000-0000-0000-0000-0000000000ff';

-- published_at is deliberately backdated here; the trigger must overwrite it.
INSERT INTO signals(id, group_id, strategy_id, forward_test_id, symbol, side, entry_price,
                    stop_loss, timeframe, valid_from, risk_profile, disclosure_block, published_at)
VALUES ('80000000-0000-0000-0000-0000000000ff', '60000000-0000-0000-0000-0000000000ff',
        '50000000-0000-0000-0000-0000000000ff', 'f0000000-0000-0000-0000-0000000000ff',
        'NSE:TATASTEEL', 'BUY', 145.0000, 130.0000, '1d', now(), 'MEDIUM', 'disclosure',
        '2001-01-01'::timestamptz);

DO $$
DECLARE stamped timestamptz;
BEGIN
  SELECT published_at INTO stamped FROM signals WHERE id='80000000-0000-0000-0000-0000000000ff';
  IF stamped < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'INVARIANT BROKEN: client-supplied published_at was honoured — backdating is possible.';
  END IF;
  RAISE NOTICE '  blocked   backdating (published_at overwritten server-side)';
END;
$$;

SELECT pg_temp.must_reject('UPDATE a published signal',
  $$update signals set entry_price=1.0000 where id='80000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('DELETE a published signal',
  $$delete from signals where id='80000000-0000-0000-0000-0000000000ff'$$);

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

\echo '--- soft-delete guard (5.1) ---'
SELECT pg_temp.must_allow('assert_no_soft_delete_columns() on a clean schema',
  $$select assert_no_soft_delete_columns()$$);

\echo ''
\echo 'All invariants hold.'

ROLLBACK;
