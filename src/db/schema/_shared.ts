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

export const verificationStatus = pgEnum("verification_status", [
  "UNSUBMITTED",
  "PENDING",
  "VERIFIED",
  "REJECTED",
  /** Registration lapsed or withdrawn — publishing capability is suspended. */
  "SUSPENDED",
]);

export const documentReviewStatus = pgEnum("document_review_status", [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
]);

export const advisorDocumentType = pgEnum("advisor_document_type", [
  "SEBI_REGISTRATION_CERTIFICATE",
  "RAASB_ENLISTMENT",
  "PAN_CARD",
  "FIRM_INCORPORATION",
  "ADDRESS_PROOF",
  "OTHER",
]);

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

export const groupVisibility = pgEnum("group_visibility", ["PUBLIC", "PRIVATE"]);

export const billingPeriod = pgEnum("billing_period", ["MONTHLY", "QUARTERLY", "ANNUAL"]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
]);

export const experienceLevel = pgEnum("experience_level", [
  "BEGINNER",
  "INTERMEDIATE",
  "EXPERT",
  "SUPER_PRO",
]);

export const riskProfile = pgEnum("risk_profile", ["LOW", "MEDIUM", "HIGH"]);

export const marketSegment = pgEnum("market_segment", ["EQUITY", "FNO", "COMMODITY", "CURRENCY"]);

/**
 * A directional view, for `market_views`. A closed set on purpose — the whole
 * reason a stance is safe to post without a forward test behind it is that it
 * is not free text, and a free-text stance would make it one.
 */
export const marketStance = pgEnum("market_stance", ["BULLISH", "BEARISH", "NEUTRAL"]);

/**
 * A group invitation's life. One way: a PENDING invitation is either taken up
 * or withdrawn, and neither is undone. Enforced by a trigger in migration 0007
 * for the same reason the forward-test lifecycle is — an invitation that could
 * be un-revoked is a private group that can be re-entered after the advisor
 * closed the door.
 */
export const invitationStatus = pgEnum("invitation_status", [
  "PENDING",
  "ACCEPTED",
  "REVOKED",
]);

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
 * A staged exit on a trade call.
 *
 * Was re-exported from `src/domain/signal.ts` so the column type and the
 * validator could not disagree about what a target is. That validator is gone
 * — trade calls were the distribution surface, which `CLAUDE.md` §8.5
 * prohibits — so the type is restated here to keep the schema compiling on its
 * own.
 *
 * It is temporary. The `signals` and `market_views` tables that use it are
 * dropped in the teardown migration (`plan.md` W10-06), and this type goes with
 * them. Nothing new should reference it.
 *
 * `price` is a decimal string, not a number — the column beside it is
 * `numeric(18,4)`, and routing a price through a float on the way to JSON
 * silently rounds it.
 */
export type SignalTarget = { label: string; price: string };

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
 * AI critique output. Structured findings, never a prose verdict — "42 trades
 * is below the threshold for statistical confidence at this win rate", never
 * "this strategy is weak" (`x-wealth-product.md` §5.5).
 */
export type CritiqueFindings = {
  findings: Array<{
    category:
      | "OVERFITTING"
      | "SAMPLE_ADEQUACY"
      | "REGIME_DEPENDENCE"
      | "LIQUIDITY"
      | "DRAWDOWN"
      | "EXPLANATION";
    observation: string;
    evidence: Record<string, unknown>;
  }>;
};
