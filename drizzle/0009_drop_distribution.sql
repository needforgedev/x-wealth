-- ---------------------------------------------------------------------------
-- Drop the distribution schema. `plan.md` W10-06.
--
-- The v2 direction (`CLAUDE.md` §8.5) makes a user's strategies and signals
-- private to them. §2 records why that is not a product preference: under
-- SEBI's retail algo framework an algo developed by a retail investor may be
-- used only by that investor and immediate family — not sold, rented, shared or
-- given away free. Groups, subscriptions and published trade calls are the
-- mechanism for exactly that, so they go.
--
-- The application code was removed first (commit "Remove the distribution
-- surface"). These tables have been orphaned since; nothing reads them.
--
-- ## Order matters
--
-- Children before parents, `groups` last. `DROP TABLE` takes its own triggers,
-- indexes, constraints and grants with it — including the `REVOKE UPDATE,
-- DELETE` that `0001` applied — so there is nothing to unwind by hand at the
-- table level. What it does *not* take is the trigger functions, which would
-- otherwise sit in `public` forever with no trigger attached. Those are dropped
-- explicitly below.
--
-- ## What is deliberately NOT dropped
--
-- `enforce_append_only` — shared with `strategy_versions`, `backtest_runs`,
-- `forward_tests` and `ai_critiques`. It loses two of its six triggers here and
-- keeps four.
--
-- `market_segment` and `trade_side` — `strategies.segment` and
-- `paper_trades.side` still use them.
--
-- ## `portfolio_entries.source_signal_id`
--
-- The only foreign key into this schema from outside it. In v1 it linked an
-- investor's real trade back to the signal that prompted it, and the spec
-- called it the most valuable dataset the platform would generate.
--
-- The idea survives and gets stronger; the column does not. v2 measures whether
-- a trader followed **their own** strategy — `signal_events` against
-- `execution_records`, computed into `execution_gaps` (W21). That is both more
-- useful and legally uncomplicated, because nothing crosses between users.
-- ---------------------------------------------------------------------------

ALTER TABLE "portfolio_entries" DROP COLUMN IF EXISTS "source_signal_id";

DROP TABLE IF EXISTS "group_strategies";
DROP TABLE IF EXISTS "group_invitations";
DROP TABLE IF EXISTS "subscriptions";
DROP TABLE IF EXISTS "pricing_tiers";
DROP TABLE IF EXISTS "market_views";
DROP TABLE IF EXISTS "signals";
DROP TABLE IF EXISTS "groups";

-- Trigger functions with nothing left to fire on.
DROP FUNCTION IF EXISTS "enforce_amendment_scope"();
DROP FUNCTION IF EXISTS "enforce_invitation_lifecycle"();
DROP FUNCTION IF EXISTS "enforce_market_view_published_at"();
DROP FUNCTION IF EXISTS "enforce_signal_published_at"();

-- Enums with no remaining column. Verified against pg_attribute before writing
-- this: every one of these had exactly one user, and it was a table above.
DROP TYPE IF EXISTS "billing_period";
DROP TYPE IF EXISTS "group_visibility";
DROP TYPE IF EXISTS "invitation_status";
DROP TYPE IF EXISTS "market_stance";
DROP TYPE IF EXISTS "risk_profile";
DROP TYPE IF EXISTS "subscription_status";
