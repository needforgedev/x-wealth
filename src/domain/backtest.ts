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
import { requiredWarmUpBars, resolveDefinition, type StrategyDefinition } from "./strategy";

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

/**
 * Bumped when the engine can produce different numbers from the same inputs.
 *
 * `backtest-2` added take-profit targets and the intrabar rule (`W5-13`).
 * Runs stored under `backtest-1` were produced by an engine that ignored
 * `targetPercent` entirely, and the methodology on each run is what says so —
 * which is the point of storing it. Comparing a `-1` result against a `-2`
 * result for the same strategy is comparing two different execution models.
 */
export const ENGINE_VERSION = "backtest-2";

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
  /**
   * What the trade risked at the moment it opened: `qty × (entry − stop)`, in
   * paise. The denominator of the R-multiple.
   *
   * Recorded per trade rather than derived later because the stop is a property
   * of the position, and a strategy whose stop percentage changed between
   * versions would otherwise have its old trades re-expressed in units of a
   * risk they never took.
   */
  riskPaise: number;
};

export type EquityPoint = { date: IsoDate; equityPaise: number };

/**
 * Below this, the sample cannot support an inference and the result says so.
 *
 * `CLAUDE.md` §8.12: *below ~100 trades, surface the inadequacy prominently.*
 * Prominently, not in a footnote — a 12-trade backtest showing 71% hit rate is
 * the single most misleading artefact this engine can produce, and it looks
 * exactly like a good one.
 */
export const ADEQUATE_TRADE_COUNT = 100;

export type BacktestMetrics = {
  /**
   * Net of every charge, and the figure that means anything.
   *
   * `grossReturnPercent` sits beside it — never instead of it, never behind a
   * flag. `CLAUDE.md` §8.3: *display gross and net together so the drag is
   * visible.* The pair is the disclosure; either one alone is not.
   */
  netReturnPercent: number;
  grossReturnPercent: number;
  totalCostsPaise: number;
  /** What the charges took, as a share of the gross result. */
  costDragPercent: number | null;

  maxDrawdownPercent: number;
  hitRatePercent: number;
  avgWinPaise: number;
  avgLossPaise: number;
  sharpe: number | null;
  tradeCount: number;
  exposurePercent: number;

  /** Average net result per trade. The number that decides whether to trade. */
  expectancyPaise: number;
  /** The same in units of risk taken, which is how it compares across strategies. */
  expectancyR: number | null;
  /** Per-trade R-multiples, ascending. The shape behind the average. */
  rMultiples: number[];
  /** Gross winnings ÷ gross losses. Null when nothing lost — undefined, not infinite. */
  profitFactor: number | null;
  /** Sharpe counting only downside dispersion, since upside is not risk. */
  sortino: number | null;
  /** Annualised return ÷ max drawdown. Null when there was no drawdown to divide by. */
  calmar: number | null;
  longestLosingStreak: number;
  /** Share of total net profit contributed by the single best trade. */
  topTradeSharePercent: number | null;
  /** Distinct instruments that actually traded. */
  symbolsTraded: number;

  /**
   * Whether the trade count can support an inference at all (§8.12).
   *
   * Part of the metrics rather than a rendering concern, so that every consumer
   * — the results screen, the attack report, the AI critique — reads the same
   * verdict instead of each deciding for itself where the line sits.
   */
  sampleAdequate: boolean;
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
  targetPrice: PriceTicks | null;
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
  const { costModel } = input;

  // Both stored versions normalise here, once. Everything below reads the
  // resolved shape, so a V1 definition recorded before V2 existed replays to
  // exactly the numbers it always produced — which is what makes an
  // append-only run reproducible years later rather than merely stored.
  const definition = resolveDefinition(input.definition);
  const warmUp = requiredWarmUpBars(input.definition);

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
          riskPaise:
            positionValue(step.closed.entryPrice, step.closed.qty) -
            positionValue(step.closed.stopPrice, step.closed.qty),
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
      targetPrice: state.position.targetPrice,
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

  const netTotal = trades.reduce((sum, t) => sum + t.netPnlPaise, 0);
  const totalCostsPaise = trades.reduce((sum, t) => sum + t.costs.totalPaise, 0);
  const grossTotal = trades.reduce((sum, t) => sum + t.grossPnlPaise, 0);

  /**
   * Gross return is the same curve without the charges, expressed against the
   * same capital — so the gap between the two lines *is* the drag, in the units
   * the user cares about. It is derived from the trades rather than simulated
   * costlessly, because a genuinely cost-free run would have taken different
   * positions (`affordableQty` funds charges out of cash) and the comparison
   * would no longer be like for like.
   */
  const grossReturnPercent = percent(
    finalEquity + totalCostsPaise - initialCapitalPaise,
    initialCapitalPaise,
  );

  // Gross winnings over gross losses. Null rather than Infinity when nothing
  // lost: a strategy that has never had a losing trade has an unmeasured ratio,
  // not a perfect one, and 12 trades is exactly when that happens.
  const wonPaise = wins.reduce((sum, t) => sum + t.netPnlPaise, 0);
  const lostPaise = Math.abs(losses.reduce((sum, t) => sum + t.netPnlPaise, 0));

  // R-multiples. A trade whose stop sat at or above its entry risked nothing
  // measurable and is excluded rather than counted as an infinite R.
  const rMultiples = trades
    .filter((t) => t.riskPaise > 0)
    .map((t) => t.netPnlPaise / t.riskPaise)
    .sort((a, b) => a - b);

  const bestTrade = trades.reduce((best, t) => Math.max(best, t.netPnlPaise), 0);

  return {
    netReturnPercent,
    grossReturnPercent,
    totalCostsPaise,
    costDragPercent: grossTotal === 0 ? null : percent(totalCostsPaise, Math.abs(grossTotal)),

    maxDrawdownPercent,
    hitRatePercent,
    avgWinPaise: mean(wins.map((t) => t.netPnlPaise)),
    avgLossPaise: mean(losses.map((t) => t.netPnlPaise)),
    sharpe: sharpeOf(equityCurve),
    tradeCount: trades.length,
    exposurePercent:
      equityCurve.length === 0 ? 0 : percent(sessionsWithExposure, equityCurve.length),

    expectancyPaise: trades.length === 0 ? 0 : Math.round(netTotal / trades.length),
    expectancyR:
      rMultiples.length === 0
        ? null
        : rMultiples.reduce((sum, r) => sum + r, 0) / rMultiples.length,
    rMultiples,
    profitFactor: lostPaise === 0 ? null : wonPaise / lostPaise,
    sortino: sortinoOf(equityCurve),
    calmar: calmarOf(initialCapitalPaise, finalEquity, equityCurve.length, maxDrawdownPercent),
    longestLosingStreak: longestLosingStreakOf(trades),
    topTradeSharePercent: netTotal <= 0 ? null : percent(bestTrade, netTotal),
    symbolsTraded: new Set(trades.map((t) => t.symbol)).size,

    sampleAdequate: trades.length >= ADEQUATE_TRADE_COUNT,
  };
}

/**
 * Downside deviation only, because upside dispersion is not risk.
 *
 * Sharpe punishes a strategy for its good months. Sortino divides by the
 * deviation of the negative sessions alone, which is the number a trader
 * actually experiences as pain. The two disagree most for exactly the profile
 * this product attracts — infrequent large wins against many small losses —
 * so reporting one without the other misrepresents that shape.
 *
 * Null, never zero, when there is nothing to measure: no losing session means
 * unmeasured, not riskless.
 */
export function sortinoOf(equityCurve: readonly EquityPoint[]): number | null {
  const returns = sessionReturns(equityCurve);
  if (returns === null || returns.length < 2) return null;

  const average = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const downside = returns.filter((r) => r < 0);
  if (downside.length === 0) return null;

  // Squared against zero rather than against the mean: the target return is
  // zero, so a session that merely underperformed the average is not downside.
  const deviation = Math.sqrt(downside.reduce((sum, r) => sum + r ** 2, 0) / downside.length);
  if (deviation === 0) return null;

  return (average / deviation) * Math.sqrt(SESSIONS_PER_YEAR);
}

/**
 * Annualised return divided by the worst drawdown — return per unit of the
 * worst thing that happened, rather than per unit of average wobble.
 *
 * Null when the curve never drew down. A strategy that has not yet had a bad
 * run has no Calmar, and printing a very large number there would read as
 * excellence rather than as absence of evidence.
 */
export function calmarOf(
  initialCapitalPaise: number,
  finalEquityPaise: number,
  sessions: number,
  maxDrawdownPercent: number,
): number | null {
  if (maxDrawdownPercent <= 0 || sessions < 2) return null;
  if (initialCapitalPaise <= 0 || finalEquityPaise <= 0) return null;

  const years = sessions / SESSIONS_PER_YEAR;
  const cagr = ((finalEquityPaise / initialCapitalPaise) ** (1 / years) - 1) * 100;
  return cagr / maxDrawdownPercent;
}

/**
 * The longest run of consecutive losing trades.
 *
 * In the ledger's order, which is the order they were lived through. The primer
 * treats this as the number that decides whether a strategy is followable at
 * all: an edge nobody can sit through is not an edge they will realise.
 * Breakeven trades neither extend a streak nor break one — they are not losses.
 */
export function longestLosingStreakOf(trades: readonly ExecutedTrade[]): number {
  let longest = 0;
  let current = 0;
  for (const trade of trades) {
    if (trade.netPnlPaise < 0) {
      current++;
      if (current > longest) longest = current;
    } else if (trade.netPnlPaise > 0) {
      current = 0;
    }
  }
  return longest;
}

/** Session-over-session returns, or null if the curve cannot support them. */
function sessionReturns(equityCurve: readonly EquityPoint[]): number[] | null {
  if (equityCurve.length < 3) return null;

  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const previous = equityCurve[i - 1].equityPaise;
    if (previous <= 0) return null;
    returns.push((equityCurve[i].equityPaise - previous) / previous);
  }
  return returns;
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
  const returns = sessionReturns(equityCurve);
  if (returns === null || returns.length < 2) return null;

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

