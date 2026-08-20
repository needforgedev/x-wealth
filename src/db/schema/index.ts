/**
 * Schema barrel — the shape drizzle-kit reads.
 *
 * Before changing anything in here, read `x-wealth-product.md` §5 (hard
 * invariants) and §6 (data model). Several tables are append-only and are
 * enforced as such by `drizzle/9000_append_only_constraints.sql`. If you add a
 * table that records a result, it almost certainly belongs on that list too.
 *
 * Append-only tables:
 *   strategy_versions · backtest_runs · forward_tests · paper_trades
 *   ai_critiques · signals · market_views · audit_log
 *
 * Things that must never appear in this schema:
 *   - `deleted_at`, `is_archived`, `visible` or any other soft-delete flag on
 *     an append-only table — a bad run must not be hideable
 *   - an `include_costs` flag, or any way to record a gross-return figure
 *   - a score, grade, rating or verdict column on a strategy or advisor
 *   - a messages table (free-form group chat is cut for v1). `market_views`
 *     is not one: a closed stance enum, an optional symbol and a 280-character
 *     note, append-only and disclosure-bearing. If anyone ever relaxes those
 *     three constraints, it has become the thing this line forbids.
 *   - a wallet, ledger of custodied funds, or broker order record
 */

export * from "./_shared";
export * from "./auth";
export * from "./admins";
export * from "./advisors";
export * from "./strategies";
export * from "./testing";
export * from "./critiques";
export * from "./investors";
export * from "./distribution";
export * from "./portfolio";
export * from "./audit";
