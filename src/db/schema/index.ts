/**
 * Schema barrel — the shape drizzle-kit reads.
 *
 * Before changing anything in here, read `CLAUDE.md` §8 (hard
 * invariants) and §9 (data model). Several tables are append-only and are
 * enforced as such by `drizzle/0001_invariant_constraints.sql`. If you add a
 * table that records a result, it almost certainly belongs on that list too.
 *
 * Append-only tables:
 *   strategy_versions · backtest_runs · forward_tests · paper_trades
 *   ai_critiques · audit_log
 *
 * Things that must never appear in this schema:
 *   - `deleted_at`, `is_archived`, `visible` or any other soft-delete flag on
 *     an append-only table — a bad run must not be hideable
 *   - an `include_costs` flag, or any way to record a gross-return figure
 *   - a score, grade, rating or verdict column on a strategy or a user
 *   - anything that lets one user see another's strategy, signals or results.
 *     Groups, subscriptions, published trade calls and market views all lived
 *     here and were dropped in 0009. `CLAUDE.md` §8.5 is the constraint the
 *     whole compliance structure rests on: the moment strategies cross between
 *     users we are publishing investment recommendations.
 *   - a wallet, ledger of custodied funds, or broker order record
 *
 * `instruments` and `daily_bars` are deliberately NOT append-only. They record
 * the world rather than a decision, and vendors restate history when they
 * correct a corporate action. What is immutable is each run's claim about the
 * data it read, which lives in `backtest_runs.methodology`.
 */

export * from "./_shared";
export * from "./auth";
export * from "./admins";
export * from "./advisors";
export * from "./strategies";
export * from "./testing";
export * from "./critiques";
export * from "./investors";
export * from "./portfolio";
export * from "./market-data";
export * from "./audit";
