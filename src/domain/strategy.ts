import { warmUpBars } from "./indicators";
import { isSymbol } from "./symbol";

/**
 * Strategy definitions.
 *
 * `x-wealth-product.md` §6: a strategy is **structured data, never code**. That
 * is not a stylistic preference — a definition has to be replayable by the
 * backtest and forward-test engines years after it was authored, comparable
 * across versions, and inspectable by a reviewer who is not a programmer. Code
 * satisfies none of those.
 *
 * The shape is deliberately small. Every operand and comparator here has to be
 * implemented by the engine, so adding one is a change in two places, on
 * purpose.
 */

export const TIMEFRAMES = ["1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const INDICATORS = ["SMA", "EMA", "RSI"] as const;
export type IndicatorKind = (typeof INDICATORS)[number];

export type Operand =
  | { kind: IndicatorKind; period: number }
  | { kind: "PRICE" }
  | { kind: "CONSTANT"; value: number };

export const COMPARATORS = ["ABOVE", "BELOW", "CROSSES_ABOVE", "CROSSES_BELOW"] as const;
export type Comparator = (typeof COMPARATORS)[number];

export type Condition = {
  left: Operand;
  comparator: Comparator;
  right: Operand;
};

/**
 * Version 1. **Frozen — do not change a field on this type, ever.**
 *
 * Six `strategy_versions` rows hold definitions in this shape, one of them
 * inside a forward test that is currently RUNNING. Those rows are append-only
 * and the test's parameters are frozen at the database level, so a change here
 * does not migrate them — it silently changes how they replay, or stops them
 * replaying at all. The nightly job would then write a different ledger than
 * the one already recorded.
 *
 * New strategies are authored as V2. This type exists to keep the past
 * readable, which is the entire promise of an append-only record.
 */
export type StrategyDefinitionV1 = {
  version: 1;
  instruments: string[];
  timeframe: Timeframe;
  entry: Condition;
  exit: Condition;
  /** Percent below the entry price. */
  stopLossPercent: number;
  /** Percent of available capital committed per position. */
  positionSizePercent: number;
  initialCapitalPaise: number;
};

/**
 * How much to buy.
 *
 * `RISK_PERCENT` is the one the primer argues for and the one `CLAUDE.md` §7.3
 * specifies: `size = (capital × risk%) ÷ (entry − stop)`. Size falls out of the
 * stop rather than being chosen beside it, so a tighter stop buys more units
 * for the same rupee risk and a wider one buys fewer.
 *
 * `CAPITAL_PERCENT` is what V1 did — a flat percentage of cash, with the stop
 * playing no part in the quantity. It stays expressible because six recorded
 * versions used it and their replay must not change, but a V2 definition that
 * chooses it is choosing to size by conviction rather than by risk.
 */
export type Sizing =
  | { kind: "RISK_PERCENT"; riskPercent: number }
  | { kind: "CAPITAL_PERCENT"; percent: number };

/**
 * What may be traded, and the liquidity floor beneath it.
 *
 * §7.3 makes the liquidity filter part of the universe rather than an optional
 * extra: it is what makes a strategy executable. A rule that works beautifully
 * on a smallcap the position size could never fill is not a strategy, it is a
 * backtest artefact.
 *
 * `minAvgTurnoverPaise` is measured over `TURNOVER_LOOKBACK_SESSIONS` of
 * close × volume. Null means no floor — permitted, but it is a decision the
 * author made rather than a field they never saw.
 */
export type Universe = {
  instruments: string[];
  minAvgTurnoverPaise: number | null;
};

export const TURNOVER_LOOKBACK_SESSIONS = 20;

/**
 * Version 2 — the six mandatory components of §7.3, all required.
 *
 * Universe (with its liquidity floor), entry, exit, stop-loss, sizing,
 * timeframe. A definition missing any one of them cannot be constructed, let
 * alone saved: they are non-optional fields, and `validateStrategyDefinition`
 * re-checks them for callers arriving from JSON.
 *
 * `SHORT` is deliberately absent from `direction`. The engine only opens long
 * positions, and a field offering a value the engine ignores is worse than no
 * field — it reads as capability.
 */
export type StrategyDefinitionV2 = {
  version: 2;
  universe: Universe;
  timeframe: Timeframe;
  direction: "LONG";
  entry: Condition;
  exit: Condition;
  /** Optional take-profit, percent above entry. Null means exit on signal alone. */
  targetPercent: number | null;
  /** Percent below the entry price. */
  stopLossPercent: number;
  sizing: Sizing;
  maxConcurrentPositions: number;
  maxExposurePercent: number;
  initialCapitalPaise: number;
};

export type StrategyDefinition = StrategyDefinitionV1 | StrategyDefinitionV2;

// Bounds are guard rails against nonsense, not opinions about good strategy.
export const LIMITS = {
  period: { min: 2, max: 400 },
  instruments: { min: 1, max: 20 },
  stopLossPercent: { min: 0.1, max: 50 },
  positionSizePercent: { min: 1, max: 100 },
  riskPercent: { min: 0.1, max: 10 },
  targetPercent: { min: 0.1, max: 500 },
  maxConcurrentPositions: { min: 1, max: 20 },
  maxExposurePercent: { min: 1, max: 100 },
  minAvgTurnoverPaise: { min: 0, max: 1_000_000_000_000 },
  initialCapitalPaise: { min: 100_000, max: 100_000_000_000 }, // ₹1,000 – ₹100 crore
} as const;

/**
 * The single shape the engine consumes.
 *
 * Both versions normalise into this, so `runBacktest` and the forward-test
 * replay never branch on `version` and a V1 definition produces exactly the
 * numbers it always did. Adding V3 later means adding one case here, not
 * touching the engine.
 */
export type ResolvedDefinition = {
  instruments: string[];
  timeframe: Timeframe;
  direction: "LONG";
  entry: Condition;
  exit: Condition;
  targetPercent: number | null;
  stopLossPercent: number;
  sizing: Sizing;
  maxConcurrentPositions: number;
  maxExposurePercent: number;
  minAvgTurnoverPaise: number | null;
  initialCapitalPaise: number;
};

export function resolveDefinition(definition: StrategyDefinition): ResolvedDefinition {
  if (definition.version === 2) {
    return {
      instruments: definition.universe.instruments,
      timeframe: definition.timeframe,
      direction: definition.direction,
      entry: definition.entry,
      exit: definition.exit,
      targetPercent: definition.targetPercent,
      stopLossPercent: definition.stopLossPercent,
      sizing: definition.sizing,
      maxConcurrentPositions: definition.maxConcurrentPositions,
      maxExposurePercent: definition.maxExposurePercent,
      minAvgTurnoverPaise: definition.universe.minAvgTurnoverPaise,
      initialCapitalPaise: definition.initialCapitalPaise,
    };
  }

  /**
   * V1 had none of the portfolio controls, so they resolve to values that
   * cannot change its behaviour: one position per instrument is what it could
   * already hold, and a 100% exposure cap never binds because cash on hand was
   * always the real limit.
   */
  return {
    instruments: definition.instruments,
    timeframe: definition.timeframe,
    direction: "LONG",
    entry: definition.entry,
    exit: definition.exit,
    targetPercent: null,
    stopLossPercent: definition.stopLossPercent,
    sizing: { kind: "CAPITAL_PERCENT", percent: definition.positionSizePercent },
    maxConcurrentPositions: definition.instruments.length,
    maxExposurePercent: 100,
    minAvgTurnoverPaise: null,
    initialCapitalPaise: definition.initialCapitalPaise,
  };
}

export type ValidationIssue = { field: string; message: string };

/**
 * One instrument the engine can actually run against.
 *
 * A definition is validated in two stages, and this is the second. The first —
 * shape, bounds, self-contradiction — needs nothing but the definition, and
 * runs anywhere. The second needs to know what has been loaded, which is a fact
 * about the database on a particular day.
 *
 * Passing the catalogue in, rather than importing it, keeps this module pure
 * and testable without a connection. `x-wealth-product.md` §6 wants a
 * definition to be replayable years later; a validator that reached for a live
 * table could not be reasoned about at all.
 */
export type InstrumentChoice = {
  symbol: string;
  name: string;
  /**
   * False for a spot index. You can write a strategy *on* NIFTY 50 — but the
   * entry action here is "buy", and there is nothing to buy.
   */
  tradeable: boolean;
  /** Sessions loaded. Determines whether an indicator can ever warm up. */
  barCount: number;
};

function checkOperand(operand: Operand, field: string, issues: ValidationIssue[]): void {
  if (operand.kind === "PRICE") return;

  if (operand.kind === "CONSTANT") {
    if (!Number.isFinite(operand.value)) {
      issues.push({ field, message: "Constant must be a number." });
    }
    return;
  }

  if (!INDICATORS.includes(operand.kind)) {
    issues.push({ field, message: `Unknown indicator "${operand.kind}".` });
    return;
  }
  if (!Number.isInteger(operand.period)) {
    issues.push({ field, message: "Period must be a whole number of sessions." });
    return;
  }
  if (operand.period < LIMITS.period.min || operand.period > LIMITS.period.max) {
    issues.push({
      field,
      message: `Period must be between ${LIMITS.period.min} and ${LIMITS.period.max}.`,
    });
  }
}

/**
 * What an operand's numbers mean.
 *
 * A price and an RSI are both "numbers" and comparing them is nonsense: RSI is
 * bounded 0–100, a price is rupees, and `RSI(14) ABOVE PRICE` would evaluate to
 * false on every session an instrument traded above ₹100 — a backtest with no
 * trades, which reads as a finding about the strategy rather than as a
 * meaningless rule.
 *
 * A CONSTANT has no space of its own. It borrows the other side's: `30` means
 * ₹30 against a price and an RSI level of 30 against an oscillator.
 */
export type OperandSpace = "PRICE" | "OSCILLATOR";

export function operandSpace(operand: Operand): OperandSpace | null {
  switch (operand.kind) {
    case "CONSTANT":
      return null; // borrows from the other side
    case "RSI":
      return "OSCILLATOR";
    default:
      return "PRICE"; // PRICE, SMA and EMA are all derived from the close
  }
}

/**
 * The space a condition is compared in, or null if the two sides disagree.
 *
 * Exported because the engine needs the same answer the validator reached: it
 * has to know whether to read a constant as rupees or as a level, and the two
 * must never disagree about it.
 */
export function comparisonSpace(condition: Condition): OperandSpace | null {
  const left = operandSpace(condition.left);
  const right = operandSpace(condition.right);
  if (left === null) return right;
  if (right === null) return left;
  return left === right ? left : null;
}

function describeOperandKey(operand: Operand): string {
  switch (operand.kind) {
    case "PRICE":
      return "PRICE";
    case "CONSTANT":
      return `CONST:${operand.value}`;
    default:
      return `${operand.kind}:${operand.period}`;
  }
}

function checkCondition(condition: Condition, field: string, issues: ValidationIssue[]): void {
  checkOperand(condition.left, `${field}.left`, issues);
  checkOperand(condition.right, `${field}.right`, issues);

  if (!COMPARATORS.includes(condition.comparator)) {
    issues.push({ field, message: "Choose a comparison." });
    return;
  }

  // Both sides identical can never fire (or always fires), so the strategy
  // would never trade. Better caught here than as a silently empty backtest.
  if (describeOperandKey(condition.left) === describeOperandKey(condition.right)) {
    issues.push({ field, message: "Both sides are the same, so this can never trigger." });
  }

  // Comparing two constants is not a market condition at all.
  if (condition.left.kind === "CONSTANT" && condition.right.kind === "CONSTANT") {
    issues.push({ field, message: "At least one side must be an indicator or the price." });
    return;
  }

  // An oscillator against a price compares two different kinds of number. It
  // evaluates without error and answers the same way every session, which is
  // the worst possible failure: a backtest that runs and means nothing.
  if (comparisonSpace(condition) === null) {
    issues.push({
      field,
      message: "RSI is a 0–100 reading and cannot be compared with a price. Compare it with a number, or compare prices with prices.",
    });
  }
}

/**
 * The longest warm-up any operand in the definition needs.
 *
 * An SMA(200) produces nothing for its first two hundred sessions, so a
 * strategy carrying one cannot trade until then. Exported because the engine
 * needs the same number to size its data request — `backtest_runs.period_start`
 * is the period being *reported*, not the period being *read*.
 */
export function requiredWarmUpBars(definition: StrategyDefinition): number {
  const { entry, exit, minAvgTurnoverPaise } = resolveDefinition(definition);

  /**
   * A liquidity floor needs its own lookback before it can answer.
   *
   * Counted here rather than only inside the engine so the validator's "these
   * rules need N sessions before a first signal" is true of the whole
   * definition. A strategy accepted against fewer bars than its turnover
   * window would produce no entries at all and no message saying why.
   */
  let longest = minAvgTurnoverPaise === null ? 0 : TURNOVER_LOOKBACK_SESSIONS;

  for (const condition of [entry, exit]) {
    for (const operand of [condition.left, condition.right]) {
      if (operand.kind === "PRICE" || operand.kind === "CONSTANT") continue;
      if (!Number.isInteger(operand.period) || operand.period < 1) continue;
      longest = Math.max(longest, warmUpBars(operand.kind, operand.period));
    }
  }
  return longest;
}

/**
 * W4-07: reject a strategy that cannot be evaluated, before it can be
 * backtested.
 *
 * The point is to fail at authoring time with a sentence a human can act on,
 * rather than at run time with an empty trade log that looks like a result.
 *
 * `catalogue` is optional. Without it this checks everything that is true of a
 * definition on its own; with it, it also checks the things that are only true
 * of a definition *here, today* — that the instruments exist, that they can be
 * traded, and that enough history is loaded for the indicators to warm up.
 */
export function validateStrategyDefinition(
  definition: StrategyDefinition,
  catalogue?: readonly InstrumentChoice[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (definition.version !== 1 && definition.version !== 2) {
    issues.push({ field: "version", message: "Unsupported definition version." });
  }

  if (!TIMEFRAMES.includes(definition.timeframe)) {
    issues.push({ field: "timeframe", message: "Unsupported timeframe." });
  }

  const resolved = resolveDefinition(definition);
  const { instruments } = resolved;
  if (instruments.length < LIMITS.instruments.min) {
    issues.push({ field: "instruments", message: "Choose at least one instrument." });
  }
  if (instruments.length > LIMITS.instruments.max) {
    issues.push({
      field: "instruments",
      message: `At most ${LIMITS.instruments.max} instruments.`,
    });
  }
  for (const symbol of instruments) {
    if (!isSymbol(symbol)) {
      issues.push({
        field: "instruments",
        message: `"${symbol}" is not exchange-qualified — expected e.g. NSE:RELIANCE.`,
      });
    }
  }
  if (new Set(instruments).size !== instruments.length) {
    issues.push({ field: "instruments", message: "The same instrument is listed twice." });
  }

  if (catalogue) {
    const known = new Map(catalogue.map((choice) => [choice.symbol, choice]));
    const warmUp = requiredWarmUpBars(definition);

    for (const symbol of instruments) {
      const choice = known.get(symbol);

      if (!choice) {
        // Shape alone is not enough. `NSE:FOO` is a well-formed symbol and a
        // strategy built on it would author cleanly, then fail inside the
        // engine — or worse, produce nothing and read as a finding.
        issues.push({
          field: "instruments",
          message: `${symbol} has no price history loaded, so it cannot be backtested.`,
        });
        continue;
      }

      if (!choice.tradeable) {
        issues.push({
          field: "instruments",
          message: `${choice.name} is an index — it has a price but nothing to buy. Use a stock, or a derivative on it once those are supported.`,
        });
      }

      if (warmUp > 0 && choice.barCount <= warmUp) {
        issues.push({
          field: "instruments",
          message: `${choice.name} has ${choice.barCount} sessions loaded, and these rules need ${warmUp} before they produce a first signal.`,
        });
      }
    }
  }

  checkCondition(resolved.entry, "entry", issues);
  checkCondition(resolved.exit, "exit", issues);

  const numeric: Array<[keyof typeof LIMITS, number, string]> = [
    ["stopLossPercent", resolved.stopLossPercent, "Stop-loss"],
    ["initialCapitalPaise", resolved.initialCapitalPaise, "Starting capital"],
  ];
  if (resolved.sizing.kind === "CAPITAL_PERCENT") {
    numeric.push(["positionSizePercent", resolved.sizing.percent, "Position size"]);
  } else {
    numeric.push(["riskPercent", resolved.sizing.riskPercent, "Risk per trade"]);
  }
  if (definition.version === 2) {
    numeric.push(
      ["maxConcurrentPositions", definition.maxConcurrentPositions, "Max concurrent positions"],
      ["maxExposurePercent", definition.maxExposurePercent, "Max exposure"],
    );
    if (definition.targetPercent !== null) {
      numeric.push(["targetPercent", definition.targetPercent, "Target"]);
    }
    if (definition.universe.minAvgTurnoverPaise !== null) {
      numeric.push([
        "minAvgTurnoverPaise",
        definition.universe.minAvgTurnoverPaise,
        "Minimum average turnover",
      ]);
    }
  }
  for (const [key, value, label] of numeric) {
    const bounds = LIMITS[key] as { min: number; max: number };
    if (!Number.isFinite(value)) {
      issues.push({ field: key, message: `${label} must be a number.` });
      continue;
    }
    if (value < bounds.min || value > bounds.max) {
      issues.push({ field: key, message: `${label} is out of range.` });
    }
  }

  if (!Number.isInteger(definition.initialCapitalPaise)) {
    // Money is an integer count of paise — never a float (spec §10).
    issues.push({ field: "initialCapitalPaise", message: "Capital must be a whole number of paise." });
  }

  return issues;
}

export function isEvaluatable(
  definition: StrategyDefinition,
  catalogue?: readonly InstrumentChoice[],
): boolean {
  return validateStrategyDefinition(definition, catalogue).length === 0;
}

// ---------------------------------------------------------------------------
// Rendering, for the ledger and the reviewer
// ---------------------------------------------------------------------------

export function describeOperand(operand: Operand): string {
  switch (operand.kind) {
    case "PRICE":
      return "Close price";
    case "CONSTANT":
      return String(operand.value);
    default:
      return `${operand.kind}(${operand.period})`;
  }
}

export const COMPARATOR_LABELS: Record<Comparator, string> = {
  ABOVE: "is above",
  BELOW: "is below",
  CROSSES_ABOVE: "crosses above",
  CROSSES_BELOW: "crosses below",
};

export function describeCondition(condition: Condition): string {
  return `${describeOperand(condition.left)} ${COMPARATOR_LABELS[condition.comparator]} ${describeOperand(condition.right)}`;
}

/**
 * Carry an older definition forward into the current shape, for editing.
 *
 * Revising a V1 strategy produces a **V2** version, not another V1. The old row
 * is untouched — `strategy_versions` is append-only and its recorded runs must
 * keep replaying — but the successor is authored under the rules that apply
 * now, which is what makes the six mandatory components mandatory rather than
 * grandfathered away.
 *
 * The carried values are exactly what `resolveDefinition` already reports, so
 * an unchanged revision behaves identically to its parent. The author then sees
 * the new fields sitting at those defaults and can decide about them — in
 * particular that V1's sizing was a flat slice of capital, which V2 lets them
 * swap for sizing derived from the stop.
 */
export function upgradeToV2(definition: StrategyDefinition): StrategyDefinitionV2 {
  if (definition.version === 2) return definition;
  const r = resolveDefinition(definition);
  return {
    version: 2,
    universe: { instruments: r.instruments, minAvgTurnoverPaise: r.minAvgTurnoverPaise },
    timeframe: r.timeframe,
    direction: r.direction,
    entry: r.entry,
    exit: r.exit,
    targetPercent: r.targetPercent,
    stopLossPercent: r.stopLossPercent,
    sizing: r.sizing,
    maxConcurrentPositions: r.maxConcurrentPositions,
    maxExposurePercent: r.maxExposurePercent,
    initialCapitalPaise: r.initialCapitalPaise,
  };
}

/**
 * How the sizing rule reads on screen.
 *
 * The two kinds are worded so they cannot be mistaken for each other. "1% of
 * capital at risk" and "1% of cash committed" differ by roughly the stop
 * distance — at a 5% stop that is a 20× difference in position size, and a
 * reader who conflates them will misjudge every number downstream.
 */
export function describeSizing(sizing: Sizing): string {
  return sizing.kind === "RISK_PERCENT"
    ? `${sizing.riskPercent}% of capital at risk per trade`
    : `${sizing.percent}% of cash on hand per position`;
}

/** A stable fingerprint, so "did anything actually change?" is answerable. */
export function definitionFingerprint(definition: StrategyDefinition): string {
  const r = resolveDefinition(definition);
  return JSON.stringify([
    [...r.instruments].sort(),
    r.timeframe,
    r.direction,
    describeCondition(r.entry),
    describeCondition(r.exit),
    r.targetPercent,
    r.stopLossPercent,
    r.sizing,
    r.maxConcurrentPositions,
    r.maxExposurePercent,
    r.minAvgTurnoverPaise,
    r.initialCapitalPaise,
  ]);
}

export function definitionsDiffer(a: StrategyDefinition, b: StrategyDefinition): boolean {
  return definitionFingerprint(a) !== definitionFingerprint(b);
}

/** A sensible, deliberately unremarkable starting point for the builder. */
/**
 * The shape a new strategy starts from — V2, always.
 *
 * V1 is reachable only by reading a row recorded before V2 existed. Nothing
 * authors it any more, which is what keeps the six mandatory components
 * mandatory rather than merely available.
 */
export function starterDefinition(): StrategyDefinitionV2 {
  return {
    version: 2,
    universe: { instruments: [], minAvgTurnoverPaise: null },
    timeframe: "1d",
    direction: "LONG",
    entry: {
      left: { kind: "SMA", period: 20 },
      comparator: "CROSSES_ABOVE",
      right: { kind: "SMA", period: 50 },
    },
    exit: {
      left: { kind: "SMA", period: 20 },
      comparator: "CROSSES_BELOW",
      right: { kind: "SMA", period: 50 },
    },
    targetPercent: null,
    stopLossPercent: 5,
    // Risk-based by default. A first-time author who changes nothing else still
    // gets sizing derived from their stop rather than a flat slice of capital.
    sizing: { kind: "RISK_PERCENT", riskPercent: 1 },
    maxConcurrentPositions: 1,
    maxExposurePercent: 100,
    initialCapitalPaise: 10_000_000, // ₹1,00,000
  };
}
