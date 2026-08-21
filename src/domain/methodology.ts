import { ENGINE_VERSION } from "./backtest";
import type { SourceMetadata } from "./market-data";
import type { CostModel } from "./costs";

/**
 * What a run has to say about how it was produced.
 *
 * PRD §5.3 requires methodology "disclosed and reproducible", and W5-10 asks
 * for it to be published with every run. Reproducible means something specific
 * here: a reader must be able to tell two runs apart, and must be able to tell
 * whether a number they are looking at rests on an assumption they disagree
 * with.
 *
 * So this is not a summary. Every field below is a decision that changes the
 * numbers, written down because the alternative is that it lives only in code
 * that will have changed by the time anyone asks.
 *
 * Stored as the `methodology` JSONB on `backtest_runs`, which is append-only —
 * a restatement by the data vendor changes future runs and leaves past ones
 * describing exactly what they saw.
 */
export type RunMethodology = {
  engineVersion: string;

  data: {
    source: string;
    /** Whether the series was corrected for splits, bonuses and dividends. */
    adjustment: "ADJUSTED" | "UNADJUSTED";
    /** The date the data was captured. Vendors restate history. */
    vintage: string;
    calendar: string;
    /** Sessions read before the reported period, so indicators could warm up. */
    warmUpBars: number;
  };

  execution: {
    signal: string;
    fill: string;
    stopLoss: string;
    gapHandling: string;
    positionSizing: string;
    openPositionsAtEnd: string;
    direction: string;
  };

  indicators: {
    emaSeeding: string;
    rsiSmoothing: string;
    rsiFlatSeries: string;
  };

  costs: {
    model: CostModel;
    note: string;
  };

  metrics: {
    sharpeRiskFreeRate: string;
    sharpeAnnualisation: string;
    drawdownBasis: string;
    hitRateBasis: string;
  };

  /** Known limitations. Stated, not omitted. */
  caveats: string[];
};

/**
 * Conventions the engine and indicator library actually implement.
 *
 * Written as prose because the audience is a reviewer deciding whether to trust
 * a number, not a machine. Each line corresponds to a decision documented at
 * the place it is implemented — if one of those changes and this does not, a
 * published run becomes a false statement about itself.
 */
export function buildMethodology(input: {
  source: SourceMetadata;
  costModel: CostModel;
  warmUpBars: number;
}): RunMethodology {
  return {
    engineVersion: ENGINE_VERSION,

    data: {
      source: input.source.name,
      adjustment: input.source.adjustment,
      vintage: input.source.vintage,
      calendar: input.source.calendarName,
      warmUpBars: input.warmUpBars,
    },

    execution: {
      signal: "Conditions are evaluated on the close of each session.",
      fill:
        "Orders fill at the open of the following session. The engine cannot fill at the " +
        "close that produced the signal — knowing a session's closing price and also trading " +
        "at it is not possible.",
      stopLoss:
        "A stop is a resting order and may fill within a session, including the session the " +
        "position opened. It is placed the stated percentage below the entry price, rounded " +
        "down to the tick.",
      gapHandling:
        "If a session opens at or below the stop, the fill is the open, not the stop — nobody " +
        "could have sold at a level the market opened below.",
      positionSizing:
        "Each position commits the stated percentage of cash on hand at the moment of entry, " +
        "reduced to the largest whole quantity whose value plus charges the cash can fund.",
      openPositionsAtEnd:
        "Any position still open on the last session of the reported period is closed at that " +
        "session's close, so no unrealised result is reported as a result.",
      direction: "Long only. Short entries are not expressible in a strategy definition.",
    },

    indicators: {
      emaSeeding:
        "EMA is seeded with the simple average of the first `period` closes, which is what most " +
        "charting platforms do. Seeding with the first close instead converges to the same " +
        "curve but moves early crossings.",
      rsiSmoothing:
        "RSI uses Wilder's smoothing, the original method, which is what RSI(14) means on a " +
        "chart. A plain rolling mean produces visibly different readings near a 30/70 threshold.",
      rsiFlatSeries:
        "A window with neither gains nor losses reads 50. Several implementations return 100, " +
        "which presents a stock that has not moved as maximum bullish strength.",
    },

    costs: {
      model: input.costModel,
      note:
        "Every figure in this run is net of brokerage, STT, stamp duty, exchange transaction " +
        "charges, the SEBI turnover fee, GST and the stated slippage assumption. No gross " +
        "return is computed or stored anywhere in this system.",
    },

    metrics: {
      sharpeRiskFreeRate: "Zero. An assumption, not a measurement.",
      sharpeAnnualisation:
        "Session returns scaled by the square root of 252. Reported as null, not zero, when " +
        "there is too little data or no dispersion to measure.",
      drawdownBasis: "Largest peak-to-trough fall in mark-to-market equity, against the running peak.",
      hitRateBasis:
        "Share of closed trades with a positive net result. Breakeven trades count in the " +
        "denominator and as neither a win nor a loss.",
    },

    caveats: CAVEATS,
  };
}

/**
 * What this engine does not yet account for.
 *
 * Listing these is not a disclaimer, it is part of the disclosure — a reader
 * who does not know a backtest ran on a survivorship-biased universe cannot
 * judge the number in front of them. Each entry names the task that removes it.
 */
export const CAVEATS: string[] = [
  "The instrument universe is not survivorship-adjusted (W5-06). Only instruments listed today " +
    "are loaded, so a strategy is never tested against a company that was delisted.",
  "The exchange holiday calendar is incomplete (W3-05). Session dates come from the data itself, " +
    "which is correct for reading bars, but date arithmetic over this period is not yet reliable.",
  "Statutory rates in the cost model were captured on a stated date and must be checked against " +
    "the current NSE and SEBI circulars before a result is relied upon.",
  "Liquidity is not modelled. Fills assume the stated quantity was available at the fill price, " +
    "which is a weaker assumption for a thin instrument than a liquid one.",
];
