import { runBacktest, type BacktestMetrics, type ExecutedTrade } from "./backtest";
import type { CostModel } from "./costs";
import type { Bar } from "./market-data";
import { classifySessions, regimeIndex, regimeKey, type RegimeKey } from "./regime";
import type { IsoDate } from "./session";
import {
  LIMITS,
  resolveDefinition,
  type Condition,
  type Operand,
  type StrategyDefinition,
} from "./strategy";

/**
 * The adversarial backtest suite. `plan.md` W18, `CLAUDE.md` §7.7.
 *
 * > **The AI's job here is to break the strategy, not bless it.** A suite that
 * > mostly returns "looks fine" has been built wrong.
 *
 * That instruction is about the model, but it applies first to this file, which
 * is the part that does the actual work. Every function below is written to
 * find the reason a result should not be believed. None of them can conclude
 * that a strategy is good, and there is deliberately no code path that produces
 * such a conclusion.
 *
 * ## What this is not
 *
 * **It is not a score.** `CLAUDE.md` §8.7 forbids platform-authored performance
 * claims: no grades, no ratings, no composite "strategy score". Severity is a
 * property of a *finding* — how badly this particular result is undermined by
 * this particular test — and findings are never summed, averaged or reduced to
 * a number about the strategy. `adversarial.test.ts` asserts that the report
 * carries no such field, because the pressure to add one will be constant.
 *
 * **It is not a verdict.** Findings are observations with the numbers attached,
 * in the shape §7.11 requires of the critique layer: *"net return falls from
 * +18.2% to −3.4% when the stop moves from 5% to 5.5%"*, never *"this strategy
 * is overfit"*. The reader draws the conclusion; we supply the evidence.
 *
 * ## Reproducibility
 *
 * A report is persisted to an append-only table, so running the same attack on
 * the same run must produce the same report forever. Everything here is
 * deterministic, including the Monte Carlo, which draws from a seeded generator
 * whose seed is stored with the result. `Math.random` appears nowhere.
 */

export const SUITE_VERSION = "adversarial-1";

export const ATTACKS = [
  "WALK_FORWARD",
  "PARAMETER_SENSITIVITY",
  "REGIME_DEPENDENCE",
  "TRADE_ORDER",
  "COST_SENSITIVITY",
  "SAMPLE_SIZE",
] as const;
export type Attack = (typeof ATTACKS)[number];

/**
 * How much this finding undermines the result being examined.
 *
 * Explicitly *not* a judgement about the strategy. `HIGH` means "the number you
 * are looking at would not survive this test", which is a statement about the
 * evidence, not about the trader or the idea.
 */
export const SEVERITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Severity = (typeof SEVERITIES)[number];

const SEVERITY_ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export type Finding = {
  attack: Attack;
  severity: Severity;
  /** One sentence, with the numbers in it. Never a verdict. */
  observation: string;
  /** Everything needed to check the sentence. */
  evidence: Record<string, unknown>;
};

export type AttackInput = {
  definition: StrategyDefinition;
  series: Record<string, readonly Bar[]>;
  costModel: CostModel;
  lotSizes?: Record<string, number>;
  /** Fixed by the caller and stored with the report, so a rerun reproduces it. */
  seed?: number;
};

export type AttackReport = {
  suiteVersion: string;
  seed: number;
  /** Ranked most severe first. */
  findings: Finding[];
  /** How many attacks ran, so a short report is distinguishable from a quiet one. */
  attacksRun: Attack[];
  /** Attacks that could not run, and why. Never silently omitted. */
  attacksSkipped: Array<{ attack: Attack; reason: string }>;
};

export class AdversarialError extends Error {}

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/**
 * mulberry32 — small, fast, and good enough for shuffling a few thousand times.
 *
 * Seeded rather than `Math.random` because a report lands in an append-only
 * table. A stored result nobody can reproduce is a claim, not a record, and
 * "the Monte Carlo said 5% of paths lost money" is worth nothing if rerunning
 * it says something else.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_SEED = 20260828;

// ---------------------------------------------------------------------------
// W18-01 — sequential out-of-sample windows
// ---------------------------------------------------------------------------

export type WalkForwardWindow = {
  from: IsoDate;
  to: IsoDate;
  netReturnPercent: number;
  tradeCount: number;
};

/**
 * Run the same fixed parameters across sequential slices of history.
 *
 * ## Why this is not textbook walk-forward, and why it is still the right test
 *
 * Classic walk-forward optimises parameters on an in-sample window and measures
 * them on the out-of-sample window that follows, repeatedly. **This product has
 * no optimiser.** The trader authors the parameters by hand, and there is
 * deliberately nothing that searches for better ones — a parameter search is
 * the p-hacking engine §7.7 exists to defend against.
 *
 * So there is no in-sample fitting step to perform, and pretending otherwise
 * would be theatre. What remains is the half that matters here: hold the
 * parameters fixed and ask whether the edge shows up in every slice or in one.
 * A strategy whose entire return comes from a single window has been measured
 * once, not repeatedly, however many years the backtest covers.
 *
 * Each window starts from the full initial capital, so the windows are
 * comparable to each other rather than compounding into a single path.
 */
export function walkForward(input: AttackInput, windowCount = 4): WalkForwardWindow[] {
  const full = runBacktest({
    definition: input.definition,
    series: input.series,
    costModel: input.costModel,
    lotSizes: input.lotSizes,
  });

  const dates = full.equityCurve.map((point) => point.date);
  if (dates.length < windowCount * 2) return [];

  const size = Math.floor(dates.length / windowCount);
  const windows: WalkForwardWindow[] = [];

  for (let w = 0; w < windowCount; w++) {
    const from = dates[w * size];
    // The last window absorbs the remainder, so no session is dropped.
    const to = w === windowCount - 1 ? dates[dates.length - 1] : dates[(w + 1) * size - 1];

    const slice = runBacktest({
      definition: input.definition,
      series: input.series,
      costModel: input.costModel,
      lotSizes: input.lotSizes,
      tradeFrom: from,
      closeOutOn: to,
    });

    windows.push({
      from,
      to,
      netReturnPercent: slice.metrics.netReturnPercent,
      tradeCount: slice.metrics.tradeCount,
    });
  }

  return windows;
}

// ---------------------------------------------------------------------------
// W18-02 — parameter sensitivity
// ---------------------------------------------------------------------------

export type Tunable = {
  /** `stopLossPercent`, `entry.left.period`, … */
  path: string;
  label: string;
  value: number;
  /** Neighbouring values to try, already inside `LIMITS`. */
  neighbours: number[];
  apply: (definition: StrategyDefinition, value: number) => StrategyDefinition;
};

export type SensitivityResult = {
  path: string;
  label: string;
  baseValue: number;
  baseNetReturnPercent: number;
  variants: Array<{ value: number; netReturnPercent: number }>;
  /** Largest fall in net return across the neighbourhood, in percentage points. */
  worstDropPercentPoints: number;
  /** Whether any neighbour turns a profitable result into a losing one. */
  flipsSign: boolean;
};

/**
 * Every number in the definition a trader could plausibly have chosen
 * differently, with the neighbours worth trying.
 *
 * Indicator periods move by whole steps because they are counts of sessions —
 * §7.7's own example is RSI-13 against RSI-15. Percentages move by a tenth of
 * their own value, so a 5% stop is tested at 4.5% and 5.5% rather than at some
 * absolute step that would be trivial for a wide stop and drastic for a tight
 * one.
 *
 * Capital is deliberately absent: changing it is not a different strategy, and
 * a strategy sensitive to account size has a liquidity problem, which is a
 * different finding (W7-06).
 */
export function tunableParameters(definition: StrategyDefinition): Tunable[] {
  const resolved = resolveDefinition(definition);
  const tunables: Tunable[] = [];

  const clamp = (value: number, key: keyof typeof LIMITS) => {
    const bounds = LIMITS[key] as { min: number; max: number };
    return value >= bounds.min && value <= bounds.max;
  };

  // --- indicator periods, on both legs of both conditions -------------------
  for (const leg of ["entry", "exit"] as const) {
    for (const side of ["left", "right"] as const) {
      const operand = resolved[leg][side];
      if (!("period" in operand)) continue;

      const period = operand.period;
      tunables.push({
        path: `${leg}.${side}.period`,
        label: `${operand.kind}(${period}) on the ${leg}`,
        value: period,
        neighbours: [period - 2, period - 1, period + 1, period + 2].filter(
          (p) => p !== period && clamp(p, "period"),
        ),
        apply: (target, value) => withOperandPeriod(target, leg, side, value),
      });
    }
  }

  // --- percentages ----------------------------------------------------------
  const percentNeighbours = (value: number, key: keyof typeof LIMITS) =>
    [value * 0.9, value * 1.1]
      .map((v) => Number(v.toFixed(4)))
      .filter((v) => v !== value && clamp(v, key));

  tunables.push({
    path: "stopLossPercent",
    label: `Stop-loss at ${resolved.stopLossPercent}%`,
    value: resolved.stopLossPercent,
    neighbours: percentNeighbours(resolved.stopLossPercent, "stopLossPercent"),
    apply: (target, value) => withField(target, "stopLossPercent", value),
  });

  if (resolved.targetPercent !== null) {
    tunables.push({
      path: "targetPercent",
      label: `Target at ${resolved.targetPercent}%`,
      value: resolved.targetPercent,
      neighbours: percentNeighbours(resolved.targetPercent, "targetPercent"),
      apply: (target, value) => withField(target, "targetPercent", value),
    });
  }

  if (resolved.sizing.kind === "RISK_PERCENT") {
    const risk = resolved.sizing.riskPercent;
    tunables.push({
      path: "sizing.riskPercent",
      label: `Risk ${risk}% per trade`,
      value: risk,
      neighbours: percentNeighbours(risk, "riskPercent"),
      apply: (target, value) => withSizing(target, { kind: "RISK_PERCENT", riskPercent: value }),
    });
  } else {
    const size = resolved.sizing.percent;
    tunables.push({
      path: "sizing.percent",
      label: `Position size ${size}% of cash`,
      value: size,
      neighbours: percentNeighbours(size, "positionSizePercent"),
      apply: (target, value) => withSizing(target, { kind: "CAPITAL_PERCENT", percent: value }),
    });
  }

  return tunables.filter((t) => t.neighbours.length > 0);
}

export function parameterSensitivity(input: AttackInput): SensitivityResult[] {
  const base = runBacktest({
    definition: input.definition,
    series: input.series,
    costModel: input.costModel,
    lotSizes: input.lotSizes,
  });
  const baseReturn = base.metrics.netReturnPercent;

  return tunableParameters(input.definition).map((tunable) => {
    const variants = tunable.neighbours.map((value) => {
      const outcome = runBacktest({
        definition: tunable.apply(input.definition, value),
        series: input.series,
        costModel: input.costModel,
        lotSizes: input.lotSizes,
      });
      return { value, netReturnPercent: outcome.metrics.netReturnPercent };
    });

    const worst = variants.reduce(
      (lowest, v) => Math.min(lowest, v.netReturnPercent),
      baseReturn,
    );

    return {
      path: tunable.path,
      label: tunable.label,
      baseValue: tunable.value,
      baseNetReturnPercent: baseReturn,
      variants,
      worstDropPercentPoints: baseReturn - worst,
      flipsSign: baseReturn > 0 && variants.some((v) => v.netReturnPercent <= 0),
    };
  });
}

// ---------------------------------------------------------------------------
// W18-03 — regime dependence
// ---------------------------------------------------------------------------

export type RegimeSlice = {
  regime: RegimeKey;
  tradeCount: number;
  netPnlPaise: number;
  winners: number;
};

/**
 * Attribute each trade to the market it was *entered* in.
 *
 * Entry rather than exit, because the entry is the decision. A trade opened in
 * a quiet market and closed in a violent one was a bet made under the first set
 * of conditions.
 *
 * Each instrument is classified against its own history rather than against a
 * benchmark. We have no index to lean on that is guaranteed loaded, and a
 * midcap's regime is genuinely not the Nifty's.
 */
export function regimeSlices(
  trades: readonly ExecutedTrade[],
  series: Record<string, readonly Bar[]>,
): RegimeSlice[] {
  const indices = new Map<string, ReturnType<typeof regimeIndex>>();
  for (const [symbol, bars] of Object.entries(series)) {
    indices.set(symbol, regimeIndex(classifySessions(bars)));
  }

  const buckets = new Map<RegimeKey, RegimeSlice>();

  for (const trade of trades) {
    const regime = indices.get(trade.symbol)?.get(trade.entryDate);
    // A trade inside the classifier's warm-up has no regime, and is left out
    // rather than assigned one. See `classifySessions`.
    if (!regime) continue;

    const key = regimeKey(regime);
    const bucket = buckets.get(key) ?? {
      regime: key,
      tradeCount: 0,
      netPnlPaise: 0,
      winners: 0,
    };
    bucket.tradeCount++;
    bucket.netPnlPaise += trade.netPnlPaise;
    if (trade.netPnlPaise > 0) bucket.winners++;
    buckets.set(key, bucket);
  }

  return [...buckets.values()].sort((a, b) => b.netPnlPaise - a.netPnlPaise);
}

// ---------------------------------------------------------------------------
// W18-04 — Monte Carlo on trade order
// ---------------------------------------------------------------------------

export type MonteCarloResult = {
  iterations: number;
  seed: number;

  /**
   * The same for every ordering, and that is not a bug — see the note on
   * `monteCarloTradeOrder`. Reported as one number precisely so nobody presents
   * it as a distribution.
   */
  netReturnPercent: number;

  observedMaxDrawdownPercent: number;
  medianMaxDrawdownPercent: number;
  p95MaxDrawdownPercent: number;
  worstMaxDrawdownPercent: number;
  /** Share of reorderings that drew down more than the observed sequence did. */
  worseThanObservedPercent: number;

  observedLongestLosingStreak: number;
  p95LongestLosingStreak: number;
};

export const MONTE_CARLO_ITERATIONS = 1000;

/**
 * Reshuffle the order the trades arrived in, a thousand times.
 *
 * ## Returns, not rupees
 *
 * Shuffling the rupee P&L would be wrong. Position size depends on the capital
 * available at the time, so a ₹4,000 win earned on ₹1,20,000 of equity is not
 * the same event as a ₹4,000 win on ₹80,000. Each trade is therefore converted
 * to a fraction of the equity standing when it opened, and the shuffled paths
 * compound those fractions.
 *
 * ## The final return is identical in every ordering, and this is the point
 *
 * Compounding is multiplication, and multiplication commutes: the ending equity
 * is `capital × Π(1 + fᵢ)`, and reordering the factors cannot change a product.
 * **So a reorder Monte Carlo has no final-return distribution.** The first
 * version of this function computed 5th, 50th and 95th percentiles of the final
 * return and printed three identical numbers, which is what exposed it.
 *
 * That is worth stating plainly because the degenerate version is a common
 * output in retail backtesting tools, and it looks like evidence. Percentiles
 * that are equal by construction dressed up as a distribution are worse than no
 * analysis, because a reader takes "the worst 5% of paths still returned 12%"
 * as reassurance when it is a restatement of the one path they already had.
 *
 * What genuinely varies is the **route**, and the route is what a trader lives
 * through and abandons a strategy in the middle of. Ten losses in a row at the
 * start of a run empties an account that the same ten losses at the end would
 * have left intact. So this reports the drawdown distribution and the losing
 * streak, and states the single final return as a single number.
 *
 * (Sampling *with replacement* would move the final return, but that is a
 * bootstrap over a hypothetical population of trades, not the reordering §7.7
 * asks for. A different attack, honestly labelled, not this one relabelled.)
 */
export function monteCarloTradeOrder(input: {
  trades: readonly ExecutedTrade[];
  initialCapitalPaise: number;
  observed: Pick<BacktestMetrics, "netReturnPercent" | "maxDrawdownPercent">;
  iterations?: number;
  seed?: number;
}): MonteCarloResult | null {
  const { trades, initialCapitalPaise } = input;
  const iterations = input.iterations ?? MONTE_CARLO_ITERATIONS;
  const seed = input.seed ?? DEFAULT_SEED;

  // Below a handful of trades every ordering looks alike and the percentiles
  // are noise dressed as a distribution. Reported as skipped, not as a result.
  if (trades.length < 5 || initialCapitalPaise <= 0) return null;

  // Per-trade return as a fraction of the equity standing when it opened.
  const fractions: number[] = [];
  let equity = initialCapitalPaise;
  for (const trade of trades) {
    if (equity <= 0) break;
    fractions.push(trade.netPnlPaise / equity);
    equity += trade.netPnlPaise;
  }
  if (fractions.length < 5) return null;

  const random = seededRandom(seed);
  const drawdowns: number[] = [];
  const streaks: number[] = [];

  /** Walk one ordering and report only what the ordering can change. */
  const path = (order: readonly number[]) => {
    let value = initialCapitalPaise;
    let peak = initialCapitalPaise;
    let maxDrawdown = 0;
    let streak = 0;
    let longestStreak = 0;

    for (const fraction of order) {
      value += value * fraction;
      if (value > peak) peak = value;
      if (peak > 0) {
        const drawdown = ((peak - value) / peak) * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
      if (fraction < 0) {
        streak++;
        if (streak > longestStreak) longestStreak = streak;
      } else if (fraction > 0) {
        streak = 0;
      }
    }

    return { value, maxDrawdown, longestStreak };
  };

  for (let i = 0; i < iterations; i++) {
    const walked = path(shuffle(fractions, random));
    drawdowns.push(walked.maxDrawdown);
    streaks.push(walked.longestStreak);
  }

  drawdowns.sort((a, b) => a - b);
  streaks.sort((a, b) => a - b);

  const observedDrawdown = input.observed.maxDrawdownPercent;
  const worse = drawdowns.filter((d) => d > observedDrawdown).length;

  // Computed from the unshuffled order, and equal to every shuffled one.
  const ending = path(fractions).value;

  return {
    iterations,
    seed,
    netReturnPercent: ((ending - initialCapitalPaise) / initialCapitalPaise) * 100,

    observedMaxDrawdownPercent: observedDrawdown,
    medianMaxDrawdownPercent: percentile(drawdowns, 50),
    p95MaxDrawdownPercent: percentile(drawdowns, 95),
    worstMaxDrawdownPercent: drawdowns[drawdowns.length - 1],
    worseThanObservedPercent: (worse / iterations) * 100,

    observedLongestLosingStreak: path(fractions).longestStreak,
    p95LongestLosingStreak: percentile(streaks, 95),
  };
}

/** Fisher–Yates, drawing from the seeded generator. */
function shuffle(values: readonly number[], random: () => number): number[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

// ---------------------------------------------------------------------------
// W18-05 — cost sensitivity
// ---------------------------------------------------------------------------

export type CostSensitivityResult = {
  baseSlippagePercent: number;
  baseNetReturnPercent: number;
  steps: Array<{ slippagePercent: number; netReturnPercent: number }>;
  /** Slippage at which the result first stops being profitable. Null if never. */
  breakEvenSlippagePercent: number | null;
};

/**
 * Raise the slippage assumption until the edge disappears.
 *
 * The question §7.7 asks is *"at what slippage does the edge vanish?"*, and the
 * answer is the most practical number in the whole report: a strategy that
 * breaks even at 0.05% slippage does not have an edge, it has a rounding error.
 * Real slippage on a liquid large-cap is a few basis points; on a midcap in
 * size it is very much not.
 */
export function costSensitivity(
  input: AttackInput,
  steps: readonly number[] = [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1],
): CostSensitivityResult {
  const base = runBacktest({
    definition: input.definition,
    series: input.series,
    costModel: input.costModel,
    lotSizes: input.lotSizes,
  });

  const results = steps.map((slippagePercent) => {
    const outcome = runBacktest({
      definition: input.definition,
      series: input.series,
      costModel: { ...input.costModel, slippagePercent },
      lotSizes: input.lotSizes,
    });
    return { slippagePercent, netReturnPercent: outcome.metrics.netReturnPercent };
  });

  const firstLosing = results.find((r) => r.netReturnPercent <= 0);

  return {
    baseSlippagePercent: input.costModel.slippagePercent,
    baseNetReturnPercent: base.metrics.netReturnPercent,
    steps: results,
    breakEvenSlippagePercent: firstLosing?.slippagePercent ?? null,
  };
}

// ---------------------------------------------------------------------------
// Definition surgery
// ---------------------------------------------------------------------------

/**
 * A copy of the definition with one number changed.
 *
 * Copies rather than mutates, and never touches the stored row: these variants
 * exist only inside one attack run. A definition that reached
 * `strategy_versions` because a sensitivity sweep wrote it would be a strategy
 * nobody authored (§8.6 in spirit — the tool does not author).
 */
function withField(
  definition: StrategyDefinition,
  field: "stopLossPercent" | "targetPercent",
  value: number,
): StrategyDefinition {
  if (definition.version === 1) {
    if (field === "targetPercent") return definition; // V1 has no target
    return { ...definition, stopLossPercent: value };
  }
  return { ...definition, [field]: value };
}

function withSizing(
  definition: StrategyDefinition,
  sizing: { kind: "RISK_PERCENT"; riskPercent: number } | { kind: "CAPITAL_PERCENT"; percent: number },
): StrategyDefinition {
  if (definition.version === 1) {
    return sizing.kind === "CAPITAL_PERCENT"
      ? { ...definition, positionSizePercent: sizing.percent }
      : definition;
  }
  return { ...definition, sizing };
}

function withOperandPeriod(
  definition: StrategyDefinition,
  leg: "entry" | "exit",
  side: "left" | "right",
  period: number,
): StrategyDefinition {
  const condition: Condition = definition[leg];
  const operand: Operand = condition[side];
  if (!("period" in operand)) return definition;

  return {
    ...definition,
    [leg]: { ...condition, [side]: { ...operand, period } },
  } as StrategyDefinition;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * Run every attack and turn what they find into ranked findings.
 *
 * A finding is only emitted when a test actually found something. An attack
 * that ran and produced nothing alarming contributes no finding — but it does
 * appear in `attacksRun`, so a short report is distinguishable from a suite
 * that quietly failed to execute. **Silence has to be legible**, the same
 * requirement §7.13 puts on the digests.
 */
export function attack(input: AttackInput): AttackReport {
  const seed = input.seed ?? DEFAULT_SEED;
  const findings: Finding[] = [];
  const attacksRun: Attack[] = [];
  const skipped: Array<{ attack: Attack; reason: string }> = [];

  const base = runBacktest({
    definition: input.definition,
    series: input.series,
    costModel: input.costModel,
    lotSizes: input.lotSizes,
  });

  // --- sample size ---------------------------------------------------------
  attacksRun.push("SAMPLE_SIZE");
  if (!base.metrics.sampleAdequate) {
    findings.push({
      attack: "SAMPLE_SIZE",
      severity: base.metrics.tradeCount < 30 ? "HIGH" : "MEDIUM",
      observation:
        `${base.metrics.tradeCount} closed trades is below the hundred this suite treats as ` +
        `the minimum for an inference. Every other finding here rests on the same small sample.`,
      evidence: {
        tradeCount: base.metrics.tradeCount,
        hitRatePercent: base.metrics.hitRatePercent,
        netReturnPercent: base.metrics.netReturnPercent,
      },
    });
  }

  // --- walk-forward --------------------------------------------------------
  const windows = walkForward(input);
  if (windows.length === 0) {
    skipped.push({ attack: "WALK_FORWARD", reason: "too few sessions to split into windows" });
  } else {
    attacksRun.push("WALK_FORWARD");
    const positive = windows.filter((w) => w.netReturnPercent > 0);
    const traded = windows.filter((w) => w.tradeCount > 0);

    if (traded.length > 1 && positive.length <= 1) {
      const best = [...windows].sort((a, b) => b.netReturnPercent - a.netReturnPercent)[0];
      findings.push({
        attack: "WALK_FORWARD",
        severity: "HIGH",
        observation:
          `Of ${windows.length} sequential windows, ${positive.length} finished profitable. ` +
          `The result rests on ${best.from} → ${best.to}, which returned ` +
          `${best.netReturnPercent.toFixed(2)}%.`,
        evidence: { windows },
      });
    }
  }

  // --- parameter sensitivity ----------------------------------------------
  const sensitivity = parameterSensitivity(input);
  if (sensitivity.length === 0) {
    skipped.push({
      attack: "PARAMETER_SENSITIVITY",
      reason: "the definition has no numeric parameter with a neighbour inside its limits",
    });
  } else {
    attacksRun.push("PARAMETER_SENSITIVITY");
    for (const result of sensitivity) {
      if (!result.flipsSign && result.worstDropPercentPoints < 5) continue;

      const worst = [...result.variants].sort(
        (a, b) => a.netReturnPercent - b.netReturnPercent,
      )[0];

      findings.push({
        attack: "PARAMETER_SENSITIVITY",
        severity: result.flipsSign ? "HIGH" : "MEDIUM",
        observation:
          `${result.label}: net return moves from ` +
          `${result.baseNetReturnPercent.toFixed(2)}% to ${worst.netReturnPercent.toFixed(2)}% ` +
          `when the value changes to ${worst.value}.`,
        evidence: result as unknown as Record<string, unknown>,
      });
    }
  }

  // --- regime dependence ---------------------------------------------------
  const slices = regimeSlices(base.trades, input.series);
  if (slices.length === 0) {
    skipped.push({
      attack: "REGIME_DEPENDENCE",
      reason: "no trade fell in a session with enough history to classify",
    });
  } else {
    attacksRun.push("REGIME_DEPENDENCE");
    const totalNet = slices.reduce((sum, s) => sum + s.netPnlPaise, 0);
    const best = slices[0];

    if (totalNet > 0 && best.netPnlPaise > 0) {
      const share = (best.netPnlPaise / totalNet) * 100;
      if (share > 80 && slices.length > 1) {
        findings.push({
          attack: "REGIME_DEPENDENCE",
          severity: share > 100 ? "HIGH" : "MEDIUM",
          observation:
            `${share.toFixed(0)}% of the net result came from trades entered in ` +
            `${best.regime} conditions, across ${best.tradeCount} of ` +
            `${slices.reduce((n, s) => n + s.tradeCount, 0)} classified trades.`,
          evidence: { slices },
        });
      }
    }
  }

  // --- trade order ---------------------------------------------------------
  const monteCarlo = monteCarloTradeOrder({
    trades: base.trades,
    initialCapitalPaise: resolveDefinition(input.definition).initialCapitalPaise,
    observed: base.metrics,
    seed,
  });
  if (!monteCarlo) {
    skipped.push({ attack: "TRADE_ORDER", reason: "fewer than five closed trades to reorder" });
  } else {
    attacksRun.push("TRADE_ORDER");

    /**
     * Only the *path* can be a finding here. The ending equity is identical in
     * every ordering — see `monteCarloTradeOrder` — so any observation about
     * the final return would be a restatement of the backtest dressed as
     * evidence.
     */
    if (monteCarlo.p95MaxDrawdownPercent > monteCarlo.observedMaxDrawdownPercent * 1.3) {
      findings.push({
        attack: "TRADE_ORDER",
        severity:
          monteCarlo.p95MaxDrawdownPercent > monteCarlo.observedMaxDrawdownPercent * 2
            ? "HIGH"
            : "MEDIUM",
        observation:
          `These trades happened in an order that drew down ` +
          `${monteCarlo.observedMaxDrawdownPercent.toFixed(2)}%. ` +
          `${monteCarlo.worseThanObservedPercent.toFixed(0)}% of ${monteCarlo.iterations} ` +
          `reorderings of the same trades drew down more, reaching ` +
          `${monteCarlo.p95MaxDrawdownPercent.toFixed(2)}% at the 95th percentile and ` +
          `${monteCarlo.worstMaxDrawdownPercent.toFixed(2)}% at worst.`,
        evidence: monteCarlo as unknown as Record<string, unknown>,
      });
    }

    if (monteCarlo.p95LongestLosingStreak > monteCarlo.observedLongestLosingStreak) {
      findings.push({
        attack: "TRADE_ORDER",
        severity: "LOW",
        observation:
          `The longest run of losses was ${monteCarlo.observedLongestLosingStreak}; ` +
          `reordering the same trades reaches ${monteCarlo.p95LongestLosingStreak} in the worst ` +
          `5% of cases. A strategy is abandoned during the streak, not at the end of it.`,
        evidence: monteCarlo as unknown as Record<string, unknown>,
      });
    }
  }

  // --- cost sensitivity ----------------------------------------------------
  attacksRun.push("COST_SENSITIVITY");
  const costs = costSensitivity(input);
  if (costs.baseNetReturnPercent > 0 && costs.breakEvenSlippagePercent !== null) {
    findings.push({
      attack: "COST_SENSITIVITY",
      severity: costs.breakEvenSlippagePercent <= 0.15 ? "HIGH" : "MEDIUM",
      observation:
        `The result stops being profitable at ${costs.breakEvenSlippagePercent}% slippage, ` +
        `against the ${costs.baseSlippagePercent}% this run assumed.`,
      evidence: costs as unknown as Record<string, unknown>,
    });
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return { suiteVersion: SUITE_VERSION, seed, findings, attacksRun, attacksSkipped: skipped };
}
