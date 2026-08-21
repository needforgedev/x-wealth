import type { IndicatorKind } from "./strategy";

/**
 * The three indicators the strategy language can express.
 *
 * `src/domain/strategy.ts` lists `SMA`, `EMA` and `RSI` and says of the shape:
 * "Every operand and comparator here has to be implemented by the engine, so
 * adding one is a change in two places, on purpose." This is the other place.
 *
 * ## Floats are correct here, and only here
 *
 * `x-wealth-product.md` §10 forbids floats for currency, and `money.ts` holds
 * that line. An indicator is not currency — it is an analytical value derived
 * from prices, and EMA and RSI are defined by recurrences involving division
 * that have no exact integer form. Rounding them to four decimal places to
 * look consistent would be worse than useless: it would flip crossings near a
 * boundary and change which trades a strategy takes.
 *
 * So: inputs are integer ticks, outputs are fractional numbers **in the same
 * tick scale**, and comparisons happen in tick space. Nothing here ever
 * becomes an amount of money.
 *
 * ## Alignment, and why the result is nullable
 *
 * Every function returns an array the same length as its input, with `null`
 * for each position where there is not yet enough history. Alignment by
 * construction is what stops the classic off-by-one — an engine that zips a
 * shortened indicator array against bars will silently read the wrong day's
 * value, and the backtest still produces a number.
 */

export class IndicatorError extends Error {}

function assertPeriod(period: number, what: string): void {
  if (!Number.isInteger(period) || period < 1) {
    throw new IndicatorError(`${what} period must be a whole number of at least 1, got ${period}`);
  }
}

function assertFinite(values: readonly number[], what: string): void {
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) {
      throw new IndicatorError(`${what}: value at index ${i} is not a finite number`);
    }
  }
}

/**
 * Simple moving average.
 *
 * First value lands at index `period - 1`, the earliest point with a full
 * window. The running total is kept as an integer sum of ticks and divided
 * once per output, so with integer input the result is exact rather than
 * accumulating the drift a running float average would.
 */
export function sma(values: readonly number[], period: number): Array<number | null> {
  assertPeriod(period, "SMA");
  assertFinite(values, "SMA");

  const out: Array<number | null> = new Array(values.length).fill(null);
  let total = 0;

  for (let i = 0; i < values.length; i++) {
    total += values[i];
    if (i >= period) total -= values[i - period];
    if (i >= period - 1) out[i] = total / period;
  }

  return out;
}

/**
 * Exponential moving average, seeded with an SMA.
 *
 * **Convention:** the first value sits at index `period - 1` and equals the
 * simple average of the first `period` inputs; every later value follows
 * `ema = (value - prev) * k + prev` with `k = 2 / (period + 1)`.
 *
 * The seeding choice is not cosmetic and there is no universal answer — some
 * implementations seed with the first input instead, which converges to the
 * same curve but differs for the first several multiples of the period, and
 * that difference moves early crossings. SMA seeding is what most charting
 * platforms do, so a strategy an advisor eyeballed on a chart behaves the way
 * they expect. The choice is recorded in a run's `methodology` so a result
 * stays reproducible even if this ever changes.
 */
export function ema(values: readonly number[], period: number): Array<number | null> {
  assertPeriod(period, "EMA");
  assertFinite(values, "EMA");

  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return out;

  const k = 2 / (period + 1);

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let previous = seed / period;
  out[period - 1] = previous;

  for (let i = period; i < values.length; i++) {
    previous = (values[i] - previous) * k + previous;
    out[i] = previous;
  }

  return out;
}

/**
 * Relative strength index, with Wilder's smoothing.
 *
 * **Convention:** the seed at index `period` is the simple mean of the first
 * `period` gains and of the first `period` losses; thereafter each average is
 * smoothed as `(previous * (period - 1) + current) / period`. That is Wilder's
 * original method from *New Concepts in Technical Trading Systems*, and it is
 * what "RSI(14)" means on a chart. A plain rolling mean produces visibly
 * different numbers — enough to change whether a 30/70 threshold is crossed —
 * so the choice is recorded in `methodology` rather than left implicit.
 *
 * The first value appears at index `period`, because `period` price *changes*
 * need `period + 1` prices.
 *
 * **Edges.** RSI is `100 - 100 / (1 + avgGain / avgLoss)`, undefined when
 * `avgLoss` is zero. Resolved by what each case means rather than by whatever
 * the arithmetic happens to do:
 *
 *   - gains, no losses → 100 (maximum strength)
 *   - losses, no gains → 0
 *   - neither, a flat window → 50, because no movement is neutral, not extreme
 *
 * The last is where implementations most often disagree; several return 100
 * for a flat series, which reads as maximum bullish strength on a stock that
 * has not moved.
 */
export function rsi(values: readonly number[], period: number): Array<number | null> {
  assertPeriod(period, "RSI");
  assertFinite(values, "RSI");

  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) gainSum += change;
    else lossSum -= change;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFrom(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }

  return out;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// ---------------------------------------------------------------------------
// Dispatch and warm-up
// ---------------------------------------------------------------------------

const SERIES: Record<IndicatorKind, (values: readonly number[], period: number) => Array<number | null>> =
  { SMA: sma, EMA: ema, RSI: rsi };

/** Compute whichever indicator a strategy operand names. */
export function indicatorSeries(
  kind: IndicatorKind,
  values: readonly number[],
  period: number,
): Array<number | null> {
  const fn = SERIES[kind];
  if (!fn) throw new IndicatorError(`unknown indicator "${kind}"`);
  return fn(values, period);
}

/**
 * How many bars are consumed before this indicator produces its first value.
 *
 * The engine needs this to size its data request: `backtest_runs.period_start`
 * is the period being *reported*, and an SMA(200) needs two hundred sessions
 * of history before it. Loading only the reporting window silently produces a
 * backtest whose opening months can never trade.
 *
 * RSI needs one more bar than its period, because it consumes price *changes*.
 */
export function warmUpBars(kind: IndicatorKind, period: number): number {
  assertPeriod(period, kind);
  return kind === "RSI" ? period + 1 : period;
}
