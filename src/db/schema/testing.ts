import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import {
  createdAt,
  forwardTestOutcome,
  forwardTestStatus,
  paise,
  price,
  symbol,
  timestampTz,
  tradeSide,
  type CostModel,
  type CostsBreakdown,
  type RunResults,
} from "./_shared";
import { strategyVersions } from "./strategies";

/**
 * APPEND ONLY.
 *
 * `cost_model` is NOT NULL and there is no flag that disables it. Every figure
 * in `results` is net of brokerage, STT, stamp duty, exchange charges, SEBI
 * turnover fee, GST and a stated slippage assumption. Gross returns are never
 * displayed and never stored (`x-wealth-product.md` §5.3).
 */
export const backtestRuns = pgTable(
  "backtest_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyVersionId: uuid("strategy_version_id")
      .notNull()
      .references(() => strategyVersions.id, { onDelete: "restrict" }),

    periodStart: timestampTz("period_start").notNull(),
    periodEnd: timestampTz("period_end").notNull(),
    initialCapitalPaise: paise("initial_capital_paise").notNull(),

    costModel: jsonb("cost_model").$type<CostModel>().notNull(),
    results: jsonb("results").$type<RunResults>().notNull(),

    /**
     * Disclosed and reproducible: data vintage, corporate-action handling,
     * universe construction, engine version (PRD §5.3).
     */
    methodology: jsonb("methodology").notNull(),

    createdAt: createdAt(),
  },
  (t) => [index("backtest_runs_strategy_version_id_idx").on(t.strategyVersionId)],
);

/**
 * APPEND ONLY, with two narrowly-permitted transitions.
 *
 * A forward test is a record of something that happens over time, so a handful
 * of columns are written once as the run progresses. The constraints migration
 * permits exactly these and nothing else:
 *
 *   - `DRAFT → RUNNING → COMPLETED | ABANDONED`, forward only, never back
 *   - `ended_at` / `outcome` / `final_results` set once, on leaving RUNNING
 *
 * Everything that defines the test — `strategy_version_id`, the declared
 * hypothesis, initial capital, the cost model, `started_at`, `planned_end_at`
 * — **freezes the moment status becomes RUNNING** (`x-wealth-product.md` §5.2).
 * Changing a parameter means abandoning this test and starting a new one, and
 * the abandoned test stays permanently visible.
 *
 * This is enforced by a trigger, not by application logic.
 */
export const forwardTests = pgTable(
  "forward_tests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyVersionId: uuid("strategy_version_id")
      .notNull()
      .references(() => strategyVersions.id, { onDelete: "restrict" }),

    status: forwardTestStatus("status").notNull().default("DRAFT"),

    /** Declared up front, before the window opens. Frozen at RUNNING. */
    declaredHypothesis: text("declared_hypothesis").notNull(),

    initialCapitalPaise: paise("initial_capital_paise").notNull(),
    costModel: jsonb("cost_model").$type<CostModel>().notNull(),

    /** Minimum window in trading sessions. Configurable — see blocker B-7. */
    plannedSessions: integer("planned_sessions").notNull(),

    startedAt: timestampTz("started_at"),
    plannedEndAt: timestampTz("planned_end_at"),
    endedAt: timestampTz("ended_at"),

    outcome: forwardTestOutcome("outcome"),
    /** Recorded whatever it says. Abandonment is a legitimate, visible result. */
    abandonReason: text("abandon_reason"),

    finalResults: jsonb("final_results").$type<RunResults>(),

    createdAt: createdAt(),
  },
  (t) => [
    index("forward_tests_strategy_version_id_idx").on(t.strategyVersionId),
    index("forward_tests_status_idx").on(t.status),
  ],
);

/**
 * APPEND ONLY, closed once.
 *
 * A trade is inserted when it opens. The exit is recorded exactly once, when
 * it closes — the constraints migration permits `NULL → value` on the exit
 * columns and rejects every other UPDATE, including overwriting an exit that
 * has already been recorded. A recorded result can never be changed.
 */
export const paperTrades = pgTable(
  "paper_trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    forwardTestId: uuid("forward_test_id")
      .notNull()
      .references(() => forwardTests.id, { onDelete: "restrict" }),

    symbol: symbol().notNull(),
    side: tradeSide("side").notNull(),
    /** Derivatives trade in lots — quantity is not arbitrary (spec §10). */
    qty: integer("qty").notNull(),

    entryPrice: price("entry_price").notNull(),
    entryAt: timestampTz("entry_at").notNull(),

    exitPrice: price("exit_price"),
    exitAt: timestampTz("exit_at"),

    grossPnlPaise: paise("gross_pnl_paise"),
    costsBreakdown: jsonb("costs_breakdown").$type<CostsBreakdown>(),
    netPnlPaise: paise("net_pnl_paise"),

    createdAt: createdAt(),
  },
  (t) => [
    index("paper_trades_forward_test_id_idx").on(t.forwardTestId),
    index("paper_trades_symbol_idx").on(t.symbol),
  ],
);
