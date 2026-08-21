import { signalsFor, stopPriceFor, type SignalSeries } from "./backtest-signals";
import {
  accountForTrade,
  chargesForLeg,
  type CostModel,
  type CostsBreakdown,
  type TradeAccounting,
} from "./costs";
import { positionValue, type PriceTicks } from "./money";
import type { Bar } from "./market-data";
import type { IsoDate } from "./session";
import { requiredWarmUpBars, type StrategyDefinition } from "./strategy";

/**
 * The backtest engine.
 *
 * `execution-plan.md`: *"⚠️ Highest technical risk in the project sits here. A
 * subtly wrong backtest engine produces plausible numbers that are silently
 * false, and everything downstream inherits the error."* Everything in this
 * file is arranged around that sentence.
 *
 * ## The execution model, stated once
 *
 * A signal is evaluated **at the close of bar `t`** and filled **at the open of
 * bar `t+1`**. There is no configuration for this and no way to fill at the
 * signal bar's own close, because that is lookahead wearing a plausible face:
 * you cannot know a session's closing price and also trade at it. The gap
 * between decision and fill is where a real strategy loses money, and a backtest
 * that closes that gap is not optimistic, it is wrong.
 *
 * A stop-loss is different in kind. It is a resting order, not a decision, so
 * it can fill *within* a bar — including the bar the position was opened on.
 * Modelled as:
 *
 *   - open at or below the stop → filled at the open, because the market gapped
 *     through the level before the order could work
 *   - otherwise low at or below the stop → filled at the stop
 *
 * Filling a gap-down at the stop price rather than the open would hand the
 * strategy money that nobody could have made.
 *
 * ## Long only
 *
 * `stopLossPercent` is defined as a percentage *below the entry*, and the
 * entry action is "buy". Shorting is not expressible in the definition today,
 * so it is not modelled here — an engine that silently supported it would be
 * running rules nobody wrote.
 *
 * ## Costs
 *
 * Every round trip goes through `accountForTrade`, which returns gross, costs
 * and net as one value. There is no way to get a gross figure out of this
 * engine, and no flag that would produce one (`x-wealth-product.md` §5.3).
 */

export const ENGINE_VERSION = "backtest-1";

export class BacktestError extends Error {}

export type ExitReason = "SIGNAL" | "STOP_LOSS" | "END_OF_PERIOD";

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

export type BacktestOutcome = {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  trades: ExecutedTrade[];
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
};

type OpenPosition = {
  qty: number;
  entryDate: IsoDate;
  entryPrice: PriceTicks;
  stopPrice: PriceTicks;
};

type SymbolState = {
  symbol: string;
  bars: readonly Bar[];
  signals: SignalSeries;
  /** Bar index by date, so a shared timeline can address each symbol's series. */
  indexByDate: Map<IsoDate, number>;
  lotSize: number;
  position: OpenPosition | null;
  /** Set on bar `t`, acted on at the open of bar `t+1`. */
  pending: "ENTER" | "EXIT" | null;
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
  const firstTradableDate = earliestTradableDate(symbols, states, firstSignalIndex);
  if (firstTradableDate === null) {
    throw new BacktestError(
      `no instrument has more than ${warmUp} sessions, so these rules can never produce a signal`,
    );
  }

  let cash: number = definition.initialCapitalPaise;
  const trades: ExecutedTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let sessionsWithExposure = 0;

  const reportingDates = timeline.filter((date) => date >= firstTradableDate);

  for (let d = 0; d < reportingDates.length; d++) {
    const date = reportingDates[d];
    const isFinalDate = d === reportingDates.length - 1;

    for (const symbol of symbols) {
      const state = states.get(symbol)!;
      const i = state.indexByDate.get(date);
      if (i === undefined) continue; // this instrument did not trade today
      const bar = state.bars[i];

      // --- act on what was decided at yesterday's close ---------------------
      if (state.position) {
        const closed = closeIfDue(state, bar, costModel, isFinalDate);
        if (closed) {
          trades.push(closed.trade);
          cash += closed.proceedsPaise;
          state.position = null;
        }
      } else if (state.pending === "ENTER" && !isFinalDate) {
        // Not on the last session of the reported period. The position would
        // have to be force-closed at that same session's close, which is a
        // round trip nobody would make and which can only pay away the charges
        // — and if it were left open instead, its unrealised value would sit in
        // the equity curve as a result that never happened. Found by running
        // against real data: cash came out ₹76.79 short of capital plus net.
        const opened = openAt(state, bar, definition, costModel, cash);
        if (opened) {
          state.position = opened.position;
          cash -= opened.outlayPaise;

          // A stop can fire on the entry bar itself. It is a resting order, and
          // the session still has a low after the open we bought at.
          const stopped = stopIfHit(state, bar, costModel, { skipOpenGap: true });
          if (stopped) {
            trades.push(stopped.trade);
            cash += stopped.proceedsPaise;
            state.position = null;
          }
        }
      }
      state.pending = null;

      // --- decide, at this close, what to do at tomorrow's open -------------
      //
      // No index gate here. `conditionAt` returns null — not false — while any
      // operand is still warming up, so an unavailable indicator cannot produce
      // a signal. One rule, in one place, rather than a second bound that can
      // drift out of step with it.
      if (!isFinalDate) {
        if (state.position) {
          if (state.signals.exit[i] === true) state.pending = "EXIT";
        } else if (state.signals.entry[i] === true) {
          state.pending = "ENTER";
        }
      }

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

  return {
    periodStart: reportingDates[0],
    periodEnd: reportingDates[reportingDates.length - 1],
    trades,
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

/**
 * How many units fit, given a target notional and the cash on hand.
 *
 * Charges are part of the outlay, not an afterthought — a fill that leaves cash
 * negative is a fill that could not have happened. The loop steps by the
 * shortfall in whole units rather than decrementing, so it converges in one or
 * two passes instead of walking down from a large quantity.
 */
function affordableQty(
  model: CostModel,
  price: PriceTicks,
  targetPaise: number,
  cashPaise: number,
  lotSize: number,
): number {
  const unitValue = positionValue(price, 1);
  if (unitValue <= 0) return 0;

  const outlay = (qty: number) =>
    positionValue(price, qty) + chargesForLeg(model, { side: "BUY", price, qty }).totalPaise;

  const lots = (units: number) => Math.floor(units / lotSize) * lotSize;

  let qty = lots(Math.floor(Math.min(targetPaise, cashPaise) / unitValue));

  for (let guard = 0; qty > 0 && outlay(qty) > cashPaise && guard < 64; guard++) {
    const over = outlay(qty) - cashPaise;
    const step = Math.max(lotSize, lots(Math.ceil(over / unitValue)));
    qty -= step;
  }

  return qty > 0 && outlay(qty) <= cashPaise ? qty : 0;
}

function openAt(
  state: SymbolState,
  bar: Bar,
  definition: StrategyDefinition,
  model: CostModel,
  cashPaise: number,
): { position: OpenPosition; outlayPaise: number } | null {
  const price = bar.open;

  // Percent of **cash on hand**, not of mark-to-market equity. The definition
  // says "percent of available capital", and available is the honest reading:
  // a position cannot be funded from the unrealised value of another one. It
  // also makes a run hand-checkable, which is what gate G4 requires. The choice
  // is recorded in the run's methodology so a reader is never left guessing.
  const target = Math.floor((cashPaise * definition.positionSizePercent) / 100);
  const qty = affordableQty(model, price, target, cashPaise, state.lotSize);
  if (qty <= 0) return null;

  const outlayPaise =
    positionValue(price, qty) + chargesForLeg(model, { side: "BUY", price, qty }).totalPaise;

  return {
    position: {
      qty,
      entryDate: bar.date,
      entryPrice: price,
      stopPrice: stopPriceFor(price, definition.stopLossPercent),
    },
    outlayPaise,
  };
}

/**
 * Close a position if this bar says so.
 *
 * Order matters and is not arbitrary. When an exit was signalled yesterday, the
 * order rests at today's open — but if the market gapped through the stop
 * overnight, the stop is what filled, at the open, and it filled first. Getting
 * this backwards credits the strategy with an exit at a price the position
 * never saw.
 */
function closeIfDue(
  state: SymbolState,
  bar: Bar,
  model: CostModel,
  isFinalDate: boolean,
): { trade: ExecutedTrade; proceedsPaise: number } | null {
  const position = state.position!;

  if (state.pending === "EXIT") {
    if ((bar.open as number) <= (position.stopPrice as number)) {
      return settle(state, bar, bar.open, "STOP_LOSS", model);
    }
    return settle(state, bar, bar.open, "SIGNAL", model);
  }

  const stopped = stopIfHit(state, bar, model, { skipOpenGap: false });
  if (stopped) return stopped;

  // Nothing may be left open past the end of the reported period — an unclosed
  // position is an unrealised number, and reporting one as a result would let a
  // losing trade sit off the books indefinitely.
  if (isFinalDate) return settle(state, bar, bar.close, "END_OF_PERIOD", model);

  return null;
}

function stopIfHit(
  state: SymbolState,
  bar: Bar,
  model: CostModel,
  options: { skipOpenGap: boolean },
): { trade: ExecutedTrade; proceedsPaise: number } | null {
  const position = state.position!;
  const stop = position.stopPrice as number;

  if (!options.skipOpenGap && (bar.open as number) <= stop) {
    // Gapped through overnight. The fill is the open, not the stop — nobody
    // could have sold at a level the market opened below.
    return settle(state, bar, bar.open, "STOP_LOSS", model);
  }
  if ((bar.low as number) <= stop) {
    return settle(state, bar, position.stopPrice, "STOP_LOSS", model);
  }
  return null;
}

function settle(
  state: SymbolState,
  bar: Bar,
  exitPrice: PriceTicks,
  reason: ExitReason,
  model: CostModel,
): { trade: ExecutedTrade; proceedsPaise: number } {
  const position = state.position!;
  const accounting: TradeAccounting = accountForTrade(
    model,
    { side: "BUY", price: position.entryPrice, qty: position.qty },
    { side: "SELL", price: exitPrice, qty: position.qty },
  );

  const trade: ExecutedTrade = {
    symbol: state.symbol,
    qty: position.qty,
    entryDate: position.entryDate,
    entryPrice: position.entryPrice,
    exitDate: bar.date,
    exitPrice,
    exitReason: reason,
    grossPnlPaise: accounting.grossPnlPaise,
    costs: accounting.costs,
    netPnlPaise: accounting.netPnlPaise,
  };

  // Cash back is the sale proceeds less the charges on the *sell* leg only —
  // the buy leg's charges were already paid out of cash when the position
  // opened, and taking them twice would understate the return.
  const sellCharges = chargesForLeg(model, {
    side: "SELL",
    price: exitPrice,
    qty: position.qty,
  }).totalPaise;
  const proceedsPaise = positionValue(exitPrice, position.qty) - sellCharges;

  return { trade, proceedsPaise };
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

