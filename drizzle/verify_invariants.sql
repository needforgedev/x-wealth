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

\echo '--- signals: guards added with the 0006 relaxation ---'
-- forward_test_id is nullable only until the forward-test engine exists. When
-- it is restored to NOT NULL this check must start failing — that failure is
-- the reminder, so change it here rather than deleting it.
SELECT pg_temp.must_allow('signal with no forward test (temporary, migration 0006)',
  $$insert into signals(id,group_id,strategy_id,symbol,side,entry_price,stop_loss,
                        timeframe,valid_from,risk_profile,disclosure_block)
    values ('80000000-0000-0000-0000-0000000000fe','60000000-0000-0000-0000-0000000000ff',
            '50000000-0000-0000-0000-0000000000ff','NSE:INFY','BUY',100.0000,90.0000,
            '1d',now(),'LOW','disclosure')$$);

SELECT pg_temp.must_reject('signal with a non-positive entry price',
  $$insert into signals(group_id,strategy_id,symbol,side,entry_price,stop_loss,
                        timeframe,valid_from,risk_profile,disclosure_block)
    values ('60000000-0000-0000-0000-0000000000ff','50000000-0000-0000-0000-0000000000ff',
            'NSE:INFY','BUY',0,90.0000,'1d',now(),'LOW','disclosure')$$);

SELECT pg_temp.must_reject('signal expiring before it becomes valid',
  $$insert into signals(group_id,strategy_id,symbol,side,entry_price,stop_loss,timeframe,
                        valid_from,valid_until,risk_profile,disclosure_block)
    values ('60000000-0000-0000-0000-0000000000ff','50000000-0000-0000-0000-0000000000ff',
            'NSE:INFY','BUY',100.0000,90.0000,'1d',now(),now() - interval '1 day',
            'LOW','disclosure')$$);

SELECT pg_temp.must_reject('targets stored as anything other than an array',
  $$insert into signals(group_id,strategy_id,symbol,side,entry_price,stop_loss,timeframe,
                        valid_from,risk_profile,disclosure_block,targets)
    values ('60000000-0000-0000-0000-0000000000ff','50000000-0000-0000-0000-0000000000ff',
            'NSE:INFY','BUY',100.0000,90.0000,'1d',now(),'LOW','disclosure',
            '{"t1":"345"}'::jsonb)$$);

\echo '--- market_views: append-only, bounded, server-stamped ---'
-- Backdated on purpose; the trigger must overwrite it, exactly as for signals.
INSERT INTO market_views(id, group_id, stance, symbol, note, disclosure_block, published_at)
VALUES ('90000000-0000-0000-0000-0000000000ff', '60000000-0000-0000-0000-0000000000ff',
        'BULLISH', 'NSE:TATASTEEL', 'verification fixture', 'disclosure',
        '2001-01-01'::timestamptz);

DO $$
DECLARE stamped timestamptz;
BEGIN
  SELECT published_at INTO stamped FROM market_views WHERE id='90000000-0000-0000-0000-0000000000ff';
  IF stamped < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'INVARIANT BROKEN: a market view can be backdated.';
  END IF;
  RAISE NOTICE '  blocked   backdating a market view';
END;
$$;

SELECT pg_temp.must_reject('UPDATE a published market view',
  $$update market_views set stance='BEARISH' where id='90000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('DELETE a published market view',
  $$delete from market_views where id='90000000-0000-0000-0000-0000000000ff'$$);

-- The cap is what keeps this from being the free-form advice channel that
-- x-wealth-product.md 8 cuts. If this check ever passes, it has become one.
SELECT pg_temp.must_reject('a note longer than 280 characters',
  $$insert into market_views(group_id,stance,note,disclosure_block)
    values ('60000000-0000-0000-0000-0000000000ff','NEUTRAL',repeat('x',281),'disclosure')$$);
SELECT pg_temp.must_reject('a whitespace-only note',
  $$insert into market_views(group_id,stance,note,disclosure_block)
    values ('60000000-0000-0000-0000-0000000000ff','NEUTRAL','   ','disclosure')$$);
SELECT pg_temp.must_reject('an unqualified symbol on a market view',
  $$insert into market_views(group_id,stance,symbol,disclosure_block)
    values ('60000000-0000-0000-0000-0000000000ff','BEARISH','TATASTEEL','disclosure')$$);
SELECT pg_temp.must_allow('a view about the market rather than one instrument',
  $$insert into market_views(group_id,stance,disclosure_block)
    values ('60000000-0000-0000-0000-0000000000ff','NEUTRAL','disclosure')$$);

\echo '--- group_strategies: one live link, history kept ---'
INSERT INTO group_strategies(id, group_id, strategy_id) VALUES
  ('a1000000-0000-0000-0000-0000000000ff', '60000000-0000-0000-0000-0000000000ff',
   '50000000-0000-0000-0000-0000000000ff');

SELECT pg_temp.must_reject('publishing the same strategy to a group twice',
  $$insert into group_strategies(group_id,strategy_id)
    values ('60000000-0000-0000-0000-0000000000ff','50000000-0000-0000-0000-0000000000ff')$$);
SELECT pg_temp.must_reject('a link removed before it was published',
  $$insert into group_strategies(group_id,strategy_id,published_at,removed_at)
    values ('60000000-0000-0000-0000-0000000000ff','50000000-0000-0000-0000-0000000000ff',
            now(), now() - interval '1 day')$$);

-- Withdrawing and re-publishing must work, and must leave the old row behind.
UPDATE group_strategies SET removed_at = now()
  WHERE id='a1000000-0000-0000-0000-0000000000ff';
SELECT pg_temp.must_allow('re-publishing a withdrawn strategy',
  $$insert into group_strategies(group_id,strategy_id)
    values ('60000000-0000-0000-0000-0000000000ff','50000000-0000-0000-0000-0000000000ff')$$);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM group_strategies
   WHERE group_id='60000000-0000-0000-0000-0000000000ff';
  IF n <> 2 THEN
    RAISE EXCEPTION 'INVARIANT BROKEN: withdrawing a strategy erased the earlier link (found % rows).', n;
  END IF;
  RAISE NOTICE '  allowed   withdrawal keeps the earlier link as history';
END;
$$;

\echo '--- subscriptions: one active membership per investor per group ---'
INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-0000000000fe')
  ON CONFLICT DO NOTHING;
INSERT INTO investors(id, user_id) VALUES
  ('e0000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000fe');
INSERT INTO pricing_tiers(id, group_id, name, price_paise, billing_period) VALUES
  ('d0000000-0000-0000-0000-0000000000ff', '60000000-0000-0000-0000-0000000000ff',
   'Free', 0, 'MONTHLY');
INSERT INTO subscriptions(id, investor_id, group_id, tier_id) VALUES
  ('c1000000-0000-0000-0000-0000000000ff', 'e0000000-0000-0000-0000-0000000000ff',
   '60000000-0000-0000-0000-0000000000ff', 'd0000000-0000-0000-0000-0000000000ff');

SELECT pg_temp.must_reject('joining a group twice',
  $$insert into subscriptions(investor_id,group_id,tier_id)
    values ('e0000000-0000-0000-0000-0000000000ff','60000000-0000-0000-0000-0000000000ff',
            'd0000000-0000-0000-0000-0000000000ff')$$);

-- Leaving and rejoining is a normal thing to do, and the cancelled row stays.
UPDATE subscriptions SET status='CANCELLED', ends_at=now()
  WHERE id='c1000000-0000-0000-0000-0000000000ff';
SELECT pg_temp.must_allow('rejoining after leaving',
  $$insert into subscriptions(investor_id,group_id,tier_id)
    values ('e0000000-0000-0000-0000-0000000000ff','60000000-0000-0000-0000-0000000000ff',
            'd0000000-0000-0000-0000-0000000000ff')$$);

\echo '--- signals: an amendment chain, not a tree (0007) ---'
SELECT pg_temp.must_allow('amending a published call',
  $$insert into signals(id,group_id,strategy_id,symbol,side,entry_price,stop_loss,timeframe,
                        valid_from,risk_profile,disclosure_block,amends_signal_id)
    values ('81000000-0000-0000-0000-0000000000ff','60000000-0000-0000-0000-0000000000ff',
            '50000000-0000-0000-0000-0000000000ff','NSE:TATASTEEL','BUY',150.0000,130.0000,
            '1d',now(),'MEDIUM','disclosure','80000000-0000-0000-0000-0000000000ff')$$);

-- Two amendments of one call leave a reader with two contradictory "current"
-- versions and no rule for picking. Correcting a correction amends the
-- amendment instead, so the chain stays a line.
SELECT pg_temp.must_reject('amending the same call twice',
  $$insert into signals(group_id,strategy_id,symbol,side,entry_price,stop_loss,timeframe,
                        valid_from,risk_profile,disclosure_block,amends_signal_id)
    values ('60000000-0000-0000-0000-0000000000ff','50000000-0000-0000-0000-0000000000ff',
            'NSE:TATASTEEL','BUY',151.0000,130.0000,'1d',now(),'MEDIUM','disclosure',
            '80000000-0000-0000-0000-0000000000ff')$$);

-- An amendment that could change the instrument would be an unrelated call
-- wearing the history of the one it points at.
-- Fixture ...fe is NSE:INFY / BUY; each of these changes exactly one inherited
-- field, so a pass proves the trigger and not a coincidence.
SELECT pg_temp.must_reject('an amendment that changes the instrument',
  $$insert into signals(group_id,strategy_id,symbol,side,entry_price,stop_loss,timeframe,
                        valid_from,risk_profile,disclosure_block,amends_signal_id)
    values ('60000000-0000-0000-0000-0000000000ff','50000000-0000-0000-0000-0000000000ff',
            'NSE:TATASTEEL','BUY',150.0000,130.0000,'1d',now(),'MEDIUM','disclosure',
            '80000000-0000-0000-0000-0000000000fe')$$);

SELECT pg_temp.must_reject('an amendment that flips the side',
  $$insert into signals(group_id,strategy_id,symbol,side,entry_price,stop_loss,timeframe,
                        valid_from,risk_profile,disclosure_block,amends_signal_id)
    values ('60000000-0000-0000-0000-0000000000ff','50000000-0000-0000-0000-0000000000ff',
            'NSE:INFY','SELL',150.0000,170.0000,'1d',now(),'MEDIUM','disclosure',
            '80000000-0000-0000-0000-0000000000fe')$$);

SELECT pg_temp.must_reject('amending a call that does not exist',
  $$insert into signals(group_id,strategy_id,symbol,side,entry_price,stop_loss,timeframe,
                        valid_from,risk_profile,disclosure_block,amends_signal_id)
    values ('60000000-0000-0000-0000-0000000000ff','50000000-0000-0000-0000-0000000000ff',
            'NSE:TATASTEEL','BUY',150.0000,130.0000,'1d',now(),'MEDIUM','disclosure',
            '8f000000-0000-0000-0000-0000000000ff')$$);

\echo '--- group_invitations: one way in, one way out (0007) ---'
INSERT INTO group_invitations(id, group_id, invited_phone) VALUES
  ('11000000-0000-0000-0000-0000000000ff', '60000000-0000-0000-0000-0000000000ff', '+919999900001');

SELECT pg_temp.must_reject('an invitation to a number that is not E.164',
  $$insert into group_invitations(group_id,invited_phone)
    values ('60000000-0000-0000-0000-0000000000ff','9999900002')$$);
SELECT pg_temp.must_reject('two open invitations for the same number',
  $$insert into group_invitations(group_id,invited_phone)
    values ('60000000-0000-0000-0000-0000000000ff','+919999900001')$$);
SELECT pg_temp.must_reject('accepting without recording who accepted',
  $$update group_invitations set status='ACCEPTED', accepted_at=now()
    where id='11000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('repointing an invitation at another group',
  $$update group_invitations set group_id='60000000-0000-0000-0000-0000000000ff'::uuid,
        invited_phone='+919999900009'
    where id='11000000-0000-0000-0000-0000000000ff'$$);

-- Revoking is final. If it were not, a private group could be re-entered after
-- the advisor closed the door.
SELECT pg_temp.must_allow('revoking an open invitation',
  $$update group_invitations set status='REVOKED', revoked_at=now()
    where id='11000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('un-revoking it',
  $$update group_invitations set status='PENDING', revoked_at=null
    where id='11000000-0000-0000-0000-0000000000ff'$$);
SELECT pg_temp.must_reject('accepting a revoked invitation',
  $$update group_invitations set status='ACCEPTED', revoked_at=null, accepted_at=now(),
        accepted_by_investor_id='e0000000-0000-0000-0000-0000000000ff'::uuid
    where id='11000000-0000-0000-0000-0000000000ff'$$);

-- A revoked invitation is history, so the same person can be invited again.
SELECT pg_temp.must_allow('re-inviting a revoked number',
  $$insert into group_invitations(group_id,invited_phone)
    values ('60000000-0000-0000-0000-0000000000ff','+919999900001')$$);

\echo '--- soft-delete guard (5.1) ---'
SELECT pg_temp.must_allow('assert_no_soft_delete_columns() on a clean schema',
  $$select assert_no_soft_delete_columns()$$);

\echo ''
\echo 'All invariants hold.'

ROLLBACK;
