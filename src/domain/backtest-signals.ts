import { indicatorSeries } from "./indicators";
import { positionValue, priceFromString, type PriceTicks } from "./money";
import type { Bar } from "./market-data";
import {
  comparisonSpace,
  type Condition,
  type Operand,
  type OperandSpace,
  TURNOVER_LOOKBACK_SESSIONS,
  type ResolvedDefinition,
} from "./strategy";

/**
 * Turning a definition into a series of signals.
 *
 * Split from the engine loop because these are two entirely different kinds of
 * mistake. Getting a crossover wrong is an arithmetic bug that a test can pin
 * exactly; getting the execution model wrong is a *methodology* bug that
 * produces plausible numbers forever. Keeping them apart means each can be
 * tested for what it actually is.
 *
 * Everything here is aligned by index to the bar array it was built from, with
 * `null` wherever there is not yet enough history. Alignment by construction is
 * what stops the classic off-by-one: an engine that zips a shortened indicator
 * array against bars silently reads the wrong day's value, and still produces
 * a number.
 */

export class SignalError extends Error {}

/**
 * A constant, converted into whatever space it is being compared in.
 *
 * In oscillator space it is already a level — RSI is 0–100 and so is the
 * number the advisor typed. In price space the advisor typed rupees and the
 * comparison happens in ticks, so it has to be scaled.
 *
 * That scaling goes through the decimal string rather than `value * 10_000`,
 * for the same reason the Upstox mapper does: the multiplication is a float
 * operation on a price, and `100.07 * 10_000` is 1_000_699.9999999999.
 */
function constantIn(space: OperandSpace, value: number): number {
  if (space === "OSCILLATOR") return value;

  if (!Number.isFinite(value)) throw new SignalError(`constant is not finite: ${value}`);
  const text = String(value);
  if (text.includes("e") || text.includes("E")) {
    throw new SignalError(`constant is not in plain decimal form: ${text}`);
  }
  return priceFromString(text) as number;
}

/**
 * Every distinct indicator a definition needs, computed once per symbol.
 *
 * A definition can name the same indicator on both legs — a 20/50 crossover in
 * and the same pair out is the commonest shape there is — so they are keyed and
 * shared rather than recomputed per operand.
 */
export type OperandValues = (index: number) => number | null;

export function operandReader(
  operand: Operand,
  space: OperandSpace,
  closes: readonly number[],
  cache: Map<string, Array<number | null>>,
): OperandValues {
  if (operand.kind === "PRICE") return (i) => closes[i] ?? null;

  if (operand.kind === "CONSTANT") {
    const level = constantIn(space, operand.value);
    return () => level;
  }

  const key = `${operand.kind}:${operand.period}`;
  let series = cache.get(key);
  if (!series) {
    series = indicatorSeries(operand.kind, closes, operand.period);
    cache.set(key, series);
  }
  return (i) => series[i] ?? null;
}

/**
 * Whether a condition holds at index `i`.
 *
 * `null` — not "false" — while either side is still warming up. The difference
 * matters: false is an answer, and treating "we do not know yet" as an answer
 * lets a crossover fire on the first bar an indicator becomes available, which
 * is not a crossing, it is the series starting.
 *
 * A crossing compares `i` against `i - 1` and therefore needs both. Strict
 * inequalities on both sides, so an equal-then-above sequence counts as one
 * crossing rather than two.
 */
export function conditionAt(
  condition: Condition,
  left: OperandValues,
  right: OperandValues,
  i: number,
): boolean | null {
  const l = left(i);
  const r = right(i);
  if (l === null || r === null) return null;

  switch (condition.comparator) {
    case "ABOVE":
      return l > r;
    case "BELOW":
      return l < r;
    case "CROSSES_ABOVE":
    case "CROSSES_BELOW": {
      if (i === 0) return null;
      const lp = left(i - 1);
      const rp = right(i - 1);
      if (lp === null || rp === null) return null;
      return condition.comparator === "CROSSES_ABOVE" ? lp <= rp && l > r : lp >= rp && l < r;
    }
  }
}

/** Entry and exit, evaluated for every bar of one symbol's series. */
export type SignalSeries = {
  entry: Array<boolean | null>;
  exit: Array<boolean | null>;
};

export function signalsFor(definition: ResolvedDefinition, bars: readonly Bar[]): SignalSeries {
  const closes = bars.map((bar) => bar.close as number);
  const cache = new Map<string, Array<number | null>>();

  const build = (condition: Condition): Array<boolean | null> => {
    const space = comparisonSpace(condition);
    if (space === null) {
      // The validator rejects this before a strategy can be saved. Reaching it
      // here means something bypassed validation, and guessing a space would
      // produce a run whose numbers mean nothing.
      throw new SignalError("condition compares an oscillator with a price");
    }
    const left = operandReader(condition.left, space, closes, cache);
    const right = operandReader(condition.right, space, closes, cache);
    return bars.map((_, i) => conditionAt(condition, left, right, i));
  };

  const exit = build(definition.exit);
  let entry = build(definition.entry);

  /**
   * The liquidity floor suppresses the *entry* signal and leaves the exit
   * alone.
   *
   * A position already open in a symbol that has since gone thin still has to
   * be closed — refusing to exit because the instrument no longer meets the
   * entry standard would trap capital in exactly the situation where getting
   * out matters most. `CLAUDE.md` §7.3 puts the filter on the universe, which
   * is about what may be *bought*.
   */
  if (definition.minAvgTurnoverPaise !== null) {
    const liquid = liquidityMask(bars, definition.minAvgTurnoverPaise);
    entry = entry.map((signal, i) => {
      if (liquid[i] === null) return null; // still warming up — unknown, not false
      return liquid[i] ? signal : false;
    });
  }

  return { entry, exit };
}

/**
 * Whether each session clears the average-turnover floor.
 *
 * Turnover is close × volume over `TURNOVER_LOOKBACK_SESSIONS`, which is the
 * crude version of the constraint the primer calls the one nobody models:
 * a strategy whose position size exceeds the visible depth is not a strategy,
 * it is a backtest artefact.
 *
 * `null` for the first sessions, exactly as an indicator reports while warming
 * up. An unknown liquidity reading must not read as "thin" — that would silently
 * suppress every early entry and change a run's results for a reason no output
 * mentions.
 *
 * Deliberately backward-looking only. Using the whole series' average would let
 * a stock that became liquid in 2025 authorise trades in 2021, which is
 * lookahead bias wearing a liquidity filter's clothes.
 */
function liquidityMask(bars: readonly Bar[], floorPaise: number): Array<boolean | null> {
  const turnover = bars.map((bar) => positionValue(bar.close, bar.volume));

  let window = 0;
  return bars.map((_, i) => {
    window += turnover[i];
    if (i >= TURNOVER_LOOKBACK_SESSIONS) window -= turnover[i - TURNOVER_LOOKBACK_SESSIONS];
    if (i < TURNOVER_LOOKBACK_SESSIONS - 1) return null;
    return window / TURNOVER_LOOKBACK_SESSIONS >= floorPaise;
  });
}

/** The stop price for a long entry, in ticks. Rounds down — never in our favour. */
export function stopPriceFor(entry: PriceTicks, stopLossPercent: number): PriceTicks {
  const stop = Math.floor((entry as number) * (1 - stopLossPercent / 100));
  return Math.max(1, stop) as PriceTicks;
}

/**
 * The take-profit price for a long entry, in ticks. Null when the strategy
 * declares no target and exits on its rule alone.
 *
 * Rounds **up**, for the same reason `stopPriceFor` rounds down: rounding is a
 * choice about who benefits from the half-tick, and it is never us. A target
 * rounded up is marginally harder to reach, so a rounding error can only ever
 * cost the strategy a fill it might have had — never hand it one it did not.
 *
 * Always above the entry, and the stop is always below it, so the two levels
 * cannot cross and a bar can never be ambiguous about which is which. That is
 * what lets `exitIfLevelHit` treat "both reachable in one session" as a
 * question about ordering rather than about identity.
 */
export function targetPriceFor(entry: PriceTicks, targetPercent: number | null): PriceTicks | null {
  if (targetPercent === null) return null;
  const target = Math.ceil((entry as number) * (1 + targetPercent / 100));
  return Math.max(1, target) as PriceTicks;
}
