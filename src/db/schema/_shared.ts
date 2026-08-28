import { sql } from "drizzle-orm";
import { bigint, numeric, pgEnum, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Shared column builders and enums.
 *
 * Read `x-wealth-product.md` §5 (hard invariants) and §10 (technical notes)
 * before changing anything here. Several choices below look like overkill and
 * are not:
 *
 * - Money is an integer count of paise. Never a float, never a numeric with a
 *   currency meaning. `x-wealth-product.md` §10.
 * - Prices are fixed-precision decimals, which is a different thing from money.
 * - Every timestamp is `timestamptz`. Store UTC, display IST. There is no
 *   24-hour market; session arithmetic needs the exchange holiday calendar.
 */

/** Money, always in paise. ₹1 = 100. */
export const paise = (name: string) => bigint(name, { mode: "number" });

/** An instrument price. Fixed precision — not money, not a float. */
export const price = (name: string) => numeric(name, { precision: 18, scale: 4 });

/** Created/updated stamps. UTC in the column, IST at the edge. */
export const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const createdAt = () => timestampTz("created_at").notNull().defaultNow();

/**
 * Exchange-qualified instrument symbol — `NSE:RELIANCE`, never `RELIANCE`.
 * `NSE:RELIANCE` and `BSE:RELIANCE` are different instruments and can trade at
 * different prices. The format is enforced by a CHECK in the constraints
 * migration, not just by convention.
 */
export const symbol = (name = "symbol") => text(name);

export const SYMBOL_PATTERN = "^[A-Z]{2,6}:[A-Z0-9&._-]{1,32}$";

/** Reusable SQL fragment for the symbol CHECK constraint. */
export const symbolCheck = (column: string) =>
  sql.raw(`${column} ~ '${SYMBOL_PATTERN}'`);

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Forward-test lifecycle. Transitions are one-way and enforced in the database
 * — see the constraints migration. `strategy_version_id` freezes at RUNNING
 * (`x-wealth-product.md` §5.2).
 */
export const forwardTestStatus = pgEnum("forward_test_status", [
  "DRAFT",
  "RUNNING",
  "COMPLETED",
  "ABANDONED",
]);

/**
 * How a forward test ended. ABANDONED is a first-class outcome and stays
 * permanently visible — it is the denominator the product exists to show.
 */
export const forwardTestOutcome = pgEnum("forward_test_outcome", ["COMPLETED", "ABANDONED"]);

export const tradeSide = pgEnum("trade_side", ["BUY", "SELL"]);

/**
 * Whether a stored price series has been corrected for splits, bonuses and
 * dividends. Mirrors `PriceAdjustment` in `src/domain/market-data.ts`.
 *
 * `UNADJUSTED` is expressible rather than forbidden: some vendors sell raw
 * series and `x-wealth-product.md` §10 permits using them provided the run says
 * so. This column is that disclosure, and it travels with every bar.
 */
export const priceAdjustment = pgEnum("price_adjustment", ["ADJUSTED", "UNADJUSTED"]);

/**
 * What an instrument is, and therefore what may be done with it.
 *
 * A spot index cannot be bought. Modelling it as an instrument without saying
 * so lets the engine "fill" a trade on NIFTY 50 at its spot price — a number
 * that looks entirely ordinary and describes a trade nobody could place.
 */
export const instrumentKind = pgEnum("instrument_kind", ["EQUITY", "INDEX"]);

/**
 * Self-reported, and used to calibrate how much the product explains rather
 * than what it permits. It gates nothing — `CLAUDE.md` §8.12 says statistical
 * inadequacy is surfaced prominently to everyone, not only to beginners.
 */
export const experienceLevel = pgEnum("experience_level", [
  "BEGINNER",
  "INTERMEDIATE",
  "EXPERT",
  "SUPER_PRO",
]);

export const marketSegment = pgEnum("market_segment", ["EQUITY", "FNO", "COMMODITY", "CURRENCY"]);

// ---------------------------------------------------------------------------
// Structured JSONB payloads
// ---------------------------------------------------------------------------

/**
 * The cost model applied to a run, and the per-trade breakdown it produces.
 *
 * Owned by `src/domain/costs.ts` and re-exported rather than restated, for the
 * same reason as `StrategyDefinition` below: the column type and the
 * calculator must not be able to disagree about what a cost model is.
 *
 * Each statutory charge carries the side it is levied on, because the Indian
 * structure is asymmetric — STT is charged on both legs of a delivery trade
 * but only the sell of an intraday one, and stamp duty is buy-side only. A
 * flat `sttPercent` with the side rule living in code would mean a stored
 * model did not determine what was charged, which defeats the point of storing
 * it (`x-wealth-product.md` §5.3, PRD §5.3 on reproducible methodology).
 *
 * There is no `include_costs` flag anywhere in this system, by design.
 */
export type { CostModel, CostsBreakdown } from "@/domain/costs";

/**
 * A strategy definition is structured data, never code (`x-wealth-product.md`
 * §6). The shape is owned by `src/domain/strategy.ts` — re-exported here rather
 * than restated, so the column type and the validator can never disagree about
 * what a definition is.
 */
export type { StrategyDefinition } from "@/domain/strategy";

/**
 * Computed results. We report what happened and never characterise it — no
 * score, no grade, no verdict field will ever be added here
 * (`x-wealth-product.md` §5.6).
 */
export type RunResults = {
  netReturnPercent: number;
  maxDrawdownPercent: number;
  hitRatePercent: number;
  avgWinPaise: number;
  avgLossPaise: number;
  sharpe: number | null;
  tradeCount: number;
  exposurePercent: number;
  [key: string]: unknown;
};

/**
 * One thing the model noticed, with the evidence for it attached.
 *
 * Structured findings, never a prose verdict — *"42 trades is below the
 * threshold for statistical confidence at this win rate"*, never *"this
 * strategy is weak"* (`CLAUDE.md` §7.11, §8.7). The shape is the constraint:
 * an observation has to carry the numbers it rests on, and there is nowhere to
 * put a grade.
 */
export type AiFinding = {
  category:
    | "OVERFITTING"
    | "SAMPLE_ADEQUACY"
    | "REGIME_DEPENDENCE"
    | "LIQUIDITY"
    | "DRAWDOWN"
    | "EXPLANATION";
  observation: string;
  evidence: Record<string, unknown>;
};

/**
 * What a model returned, as stored in `ai_interactions.output`.
 *
 * Deliberately an open record rather than a union of five payloads. Only one
 * context has a settled output shape today — findings, above — and inventing
 * the other four now would freeze guesses about `W15-04`, `W4-12` and `W7`
 * into a column type before those modules exist. Each defines and parses its
 * own payload; this type carries the part that is common to all of them.
 *
 * What *is* fixed is the envelope: structured data with a named kind, never
 * prose. `CLAUDE.md` §7.11 requires the model to emit tool output rather than
 * text, because a paragraph cannot be checked for a verdict and a JSON object
 * with no verdict field can.
 */
export type AiOutput = {
  readonly kind: string;
  readonly [key: string]: unknown;
};
