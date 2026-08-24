import { signalsFor, type SignalSeries } from "./backtest-signals";
import type { CostModel, CostsBreakdown } from "./costs";
import { positionValue, type PriceTicks } from "./money";
import type { Bar } from "./market-data";
import type { IsoDate } from "./session";
import {
  advanceSession,
  type ExitReason,
  type PendingOrder,
  type PositionState,
} from "./session-step";
import { requiredWarmUpBars, type StrategyDefinition } from "./strategy";

/**
 * The backtest engine.
 *
 * `execution-plan.md`: *"⚠️ Highest technical risk in the project sits here. A
 * subtly wrong backtest engine produces plausible numbers that are silently
 * false, and everything downstream inherits the error."* Everything in this
 * file is arranged around that sentence.
 *
 * ## What this file is, and is not
 *
 * It is the *time* half of a backtest: assembling a shared timeline across
 * instruments, walking it oldest first, and turning what comes back into
 * metrics. The trading itself — when a fill happens and at what price — lives
 * in `session-step.ts`, because the forward-test engine has to run exactly the
 * same code. The product's claim rests on comparing forward results against
 * backtest results, and that comparison is meaningless if the two engines can
 * disagree about a fill. Read that file for the execution model.
 *
 * ## Costs
 *
 * Every round trip goes through `accountForTrade`, which returns gross, costs
 * and net as one value. There is no way to get a gross figure out of this
 * engine, and no flag that would produce one (`x-wealth-product.md` §5.3).
 */

export const ENGINE_VERSION = "backtest-1";

export class BacktestError extends Error {}

export type { ExitReason };

export type ExecutedTrade = {
  symbol: string;
  qty: number;
  entryDate: IsoDate;
  entryPrice: PriceTicks;
  exitDate: IsoDate;
  exitPrice: PriceTicks;
  exitReason: ExitReason;
  grossPnlPaise: number;
  costs: CostsBreakdown;
  netPnlPaise: number;
};

export type EquityPoint = { date: IsoDate; equityPaise: number };

export type BacktestMetrics = {
  netReturnPercent: number;
  maxDrawdownPercent: number;
  hitRatePercent: number;
  avgWinPaise: number;
  avgLossPaise: number;
  sharpe: number | null;
  tradeCount: number;
  exposurePercent: number;
};

/**
 * A position the walk finished still holding.
 *
 * Always empty for a backtest, which closes out on its last session. It exists
 * for the forward test, where `closeOutOn: null` leaves the window open and an
 * open position is a real thing that has to be recorded and shown — the engine
 * reports closed round trips, so without this an open position would be
 * invisible to everything downstream.
 */
export type OpenPositionAtEnd = {
  symbol: string;
  qty: number;
  entryDate: IsoDate;
  entryPrice: PriceTicks;
  stopPrice: PriceTicks;
  /** Latest close seen for the instrument, for marking to market. */
  markPrice: PriceTicks;
};

export type BacktestOutcome = {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  trades: ExecutedTrade[];
  openPositions: OpenPositionAtEnd[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
  /** Bars consumed before the first signal could exist. */
  warmUpBars: number;
};

export type BacktestInput = {
  definition: StrategyDefinition;
  /**
   * Bars per symbol, oldest first, **including warm-up history**. The engine
   * does not fetch: `backtest_runs.period_start` is the period being reported
   * and an SMA(200) needs two hundred sessions before it, so the caller is
   * responsible for asking the source for more than the reporting window.
   */
  series: Record<string, readonly Bar[]>;
  costModel: CostModel;
  /** Lot sizes, where an instrument does not trade in single units. */
  lotSizes?: Record<string, number>;

  /**
   * First session on which a trade may be placed.
   *
   * Defaults to the end of warm-up, which is what a backtest wants. A forward
   * test passes the session its window opened on, because the bars before that
   * are history it is allowed to *read* — indicators have to warm up — but not
   * to trade on.
   */
  tradeFrom?: IsoDate;

  /**
   * The session on which anything still open is closed out.
   *
   * Defaults to the last bar supplied. Pass `null` for a window that has not
   * ended — a running forward test must not force-close its positions merely
   * because today is the most recent session anyone has data for.
   */
  closeOutOn?: IsoDate | null;
};

type SymbolState = {
  symbol: string;
  bars: readonly Bar[];
  signals: SignalSeries;
  /** Bar index by date, so a shared timeline can address each symbol's series. */
  indexByDate: Map<IsoDate, number>;
  lotSize: number;
  position: PositionState | null;
  /** Set on bar `t`, acted on at the open of bar `t+1`. */
  pending: PendingOrder;
  lastClose: PriceTicks | null;
};

export function runBacktest(input: BacktestInput): BacktestOutcome {
  const { definition, costModel } = input;
  const warmUp = requiredWarmUpBars(definition);

  const symbols = [...definition.instruments].sort();
  if (symbols.length === 0) throw new BacktestError("the definition names no instruments");

  const states = new Map<string, SymbolState>();
  for (const symbol of symbols) {
    const bars = input.series[symbol];
    if (!bars) throw new BacktestError(`no price series supplied for ${symbol}`);
    if (bars.length === 0) throw new BacktestError(`${symbol} has no bars`);

    states.set(symbol, {
      symbol,
      bars,
      signals: signalsFor(definition, bars),
      indexByDate: new Map(bars.map((bar, i) => [bar.date, i])),
      lotSize: input.lotSizes?.[symbol] ?? 1,
      position: null,
      pending: null,
      lastClose: null,
    });
  }

  // A shared timeline, because instruments do not share a session set — an
  // index launched in 2022 has no bar on a 2021 date, and a holiday can differ
  // between NSE and BSE. Sorted so the walk is chronological and deterministic.
  const timeline = [...new Set(symbols.flatMap((s) => states.get(s)!.bars.map((b) => b.date)))].sort();

  // The first date at which any symbol can produce a signal. Everything before
  // it is warm-up, and reporting a return that includes it would count sessions
  // the strategy was structurally unable to trade.
  //
  // `warmUp - 1`, not `warmUp`: `warmUpBars` counts the bars an indicator
  // *consumes*, and an SMA(50) consumes fifty bars to produce its first value
  // at index 49. Gating at index 50 would silently discard a session on which
  // the strategy could legitimately have traded.
  const firstSignalIndex = Math.max(warmUp - 1, 0);
  const firstTradableDate =
    input.tradeFrom ?? earliestTradableDate(symbols, states, firstSignalIndex);
  if (firstTradableDate === null) {
    throw new BacktestError(
      `no instrument has more than ${warmUp} sessions, so these rules can never produce a signal`,
    );
  }

  let cash: number = definition.initialCapitalPaise;
  const trades: ExecutedTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let sessionsWithExposure = 0;

  const inWindow = timeline.filter((date) => date >= firstTradableDate);
  if (inWindow.length === 0) {
    throw new BacktestError(`no sessions on or after ${firstTradableDate}`);
  }

  // `undefined` means "close out on the last bar I gave you", which is what a
  // backtest means. `null` means "the window is still open" — a running
  // forward test, where forcing a close would fabricate an exit.
  const closeOutOn = input.closeOutOn === undefined ? inWindow[inWindow.length - 1] : input.closeOutOn;

  // The walk *ends* there too, not merely closes out there.
  //
  // Closing positions on the final session while continuing to trade past it
  // is the shape this had first, and it was silently wrong: a completed
  // forward test kept opening and closing positions for every session the data
  // happened to reach, so its reported result described two years the window
  // never covered. Twelve of fourteen trades in the first end-to-end run were
  // entered after the window had closed.
  const reportingDates =
    closeOutOn === null ? inWindow : inWindow.filter((date) => date <= closeOutOn);

  for (let d = 0; d < reportingDates.length; d++) {
    const date = reportingDates[d];
    const isFinalDate = closeOutOn !== null && date === closeOutOn;

    for (const symbol of symbols) {
      const state = states.get(symbol)!;
      const i = state.indexByDate.get(date);
      if (i === undefined) continue; // this instrument did not trade today
      const bar = state.bars[i];

      const step = advanceSession({
        bar,
        position: state.position,
        pending: state.pending,
        cashPaise: cash,
        entrySignal: state.signals.entry[i],
        exitSignal: state.signals.exit[i],
        definition,
        costModel,
        lotSize: state.lotSize,
        isFinalSession: isFinalDate,
      });

      if (step.closed) {
        trades.push({
          symbol: state.symbol,
          qty: step.closed.qty,
          entryDate: step.closed.entryDate,
          entryPrice: step.closed.entryPrice,
          exitDate: bar.date,
          exitPrice: step.closed.exitPrice,
          exitReason: step.closed.reason,
          grossPnlPaise: step.closed.accounting.grossPnlPaise,
          costs: step.closed.accounting.costs,
          netPnlPaise: step.closed.accounting.netPnlPaise,
        });
      }

      cash = step.cashPaise;
      state.position = step.position;
      state.pending = step.pending;

      state.lastClose = bar.close;
    }

    let holdings = 0;
    let anyOpen = false;
    for (const symbol of symbols) {
      const state = states.get(symbol)!;
      if (!state.position || state.lastClose === null) continue;
      anyOpen = true;
      holdings += positionValue(state.lastClose, state.position.qty);
    }
    if (anyOpen) sessionsWithExposure++;

    equityCurve.push({ date, equityPaise: cash + holdings });
  }

  const openPositions: OpenPositionAtEnd[] = [];
  for (const symbol of symbols) {
    const state = states.get(symbol)!;
    if (!state.position || state.lastClose === null) continue;
    openPositions.push({
      symbol,
      qty: state.position.qty,
      entryDate: state.position.entryDate,
      entryPrice: state.position.entryPrice,
      stopPrice: state.position.stopPrice,
      markPrice: state.lastClose,
    });
  }

  return {
    periodStart: reportingDates[0],
    periodEnd: reportingDates[reportingDates.length - 1],
    trades,
    openPositions,
    equityCurve,
    warmUpBars: warmUp,
    metrics: computeMetrics({
      initialCapitalPaise: definition.initialCapitalPaise,
      trades,
      equityCurve,
      sessionsWithExposure,
    }),
  };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function earliestTradableDate(
  symbols: readonly string[],
  states: Map<string, SymbolState>,
  firstSignalIndex: number,
): IsoDate | null {
  let earliest: IsoDate | null = null;
  for (const symbol of symbols) {
    const state = states.get(symbol)!;
    const bar = state.bars[firstSignalIndex];
    if (!bar) continue;
    if (earliest === null || bar.date < earliest) earliest = bar.date;
  }
  return earliest;
}

// ---------------------------------------------------------------------------
// Metrics (W5-07)
// ---------------------------------------------------------------------------

/** Sessions in a year, for annualising. Indian exchanges run ~250. */
export const SESSIONS_PER_YEAR = 252;

export function computeMetrics(input: {
  initialCapitalPaise: number;
  trades: readonly ExecutedTrade[];
  equityCurve: readonly EquityPoint[];
  sessionsWithExposure: number;
}): BacktestMetrics {
  const { initialCapitalPaise, trades, equityCurve, sessionsWithExposure } = input;

  const finalEquity = equityCurve.at(-1)?.equityPaise ?? initialCapitalPaise;

  // Net, and only net. §5.3 forbids a code path that yields a gross-return
  // figure, so there is no gross counterpart to this number anywhere.
  const netReturnPercent = percent(finalEquity - initialCapitalPaise, initialCapitalPaise);

  let peak = initialCapitalPaise;
  let maxDrawdownPercent = 0;
  for (const point of equityCurve) {
    if (point.equityPaise > peak) peak = point.equityPaise;
    if (peak > 0) {
      const drawdown = percent(peak - point.equityPaise, peak);
      if (drawdown > maxDrawdownPercent) maxDrawdownPercent = drawdown;
    }
  }

  const wins = trades.filter((t) => t.netPnlPaise > 0);
  const losses = trades.filter((t) => t.netPnlPaise < 0);

  // Breakeven trades count in the denominator but in neither average. A trade
  // that made nothing is not a win, and dropping it entirely would flatter the
  // hit rate.
  const hitRatePercent = trades.length === 0 ? 0 : percent(wins.length, trades.length);

  return {
    netReturnPercent,
    maxDrawdownPercent,
    hitRatePercent,
    avgWinPaise: mean(wins.map((t) => t.netPnlPaise)),
    avgLossPaise: mean(losses.map((t) => t.netPnlPaise)),
    sharpe: sharpeOf(equityCurve),
    tradeCount: trades.length,
    exposurePercent:
      equityCurve.length === 0 ? 0 : percent(sessionsWithExposure, equityCurve.length),
  };
}

/**
 * Annualised Sharpe from the session-by-session equity curve.
 *
 * Risk-free rate is zero, which is an assumption rather than a fact and is
 * recorded as such in the run's methodology. The sample standard deviation
 * (n−1) is used, not the population one — the curve is a sample of the
 * strategy's behaviour, not the whole of it.
 *
 * Null rather than zero when it cannot be computed. Fewer than two returns has
 * no dispersion to measure, and a flat curve has none either; reporting 0 for
 * those would read as "measured, and it was poor" instead of "not measurable".
 */
export function sharpeOf(equityCurve: readonly EquityPoint[]): number | null {
  if (equityCurve.length < 3) return null;

  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const previous = equityCurve[i - 1].equityPaise;
    if (previous <= 0) return null;
    returns.push((equityCurve[i].equityPaise - previous) / previous);
  }
  if (returns.length < 2) return null;

  const average = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - average) ** 2, 0) / (returns.length - 1);
  const deviation = Math.sqrt(variance);
  if (deviation === 0) return null;

  return (average / deviation) * Math.sqrt(SESSIONS_PER_YEAR);
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

