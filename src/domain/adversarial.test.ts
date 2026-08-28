import { describe, expect, it } from "vitest";

import {
  attack,
  costSensitivity,
  monteCarloTradeOrder,
  parameterSensitivity,
  seededRandom,
  tunableParameters,
  walkForward,
  type AttackInput,
} from "./adversarial";
import { runBacktest } from "./backtest";
import { ZERO_BROKERAGE, nseEquityDelivery, type CostModel } from "./costs";
import { ohlcBars, type OhlcRow } from "./market-data-fixture";
import { starterDefinition, type StrategyDefinitionV2 } from "./strategy";

/**
 * `plan.md` W18. The suite's job is to break a strategy, so these tests are
 * mostly about whether it *can* — a suite that cannot produce a finding is
 * indistinguishable from a strategy with no problems, and the two must never
 * look the same.
 */

const COSTS: CostModel = nseEquityDelivery({
  brokerage: ZERO_BROKERAGE,
  slippagePercent: 0.05,
});

/** Deterministic, jagged, and long enough for a quarter of regime warm-up. */
function jaggedRows(count: number, seedShift = 0): OhlcRow[] {
  const rows: OhlcRow[] = [];
  for (let i = 0; i < count; i++) {
    const n = i + seedShift;
    const base = 100 + ((n * 7) % 23) - ((n * 3) % 11);
    const close = base + ((n % 5) - 2);
    rows.push({
      open: base.toFixed(2),
      high: (Math.max(base, close) + 2).toFixed(2),
      low: (Math.min(base, close) - 2).toFixed(2),
      close: close.toFixed(2),
    });
  }
  return rows;
}

const ROWS = jaggedRows(320);
const SERIES = { "NSE:TEST": ohlcBars({ from: "2026-01-05", rows: ROWS }) };

const DEFINITION: StrategyDefinitionV2 = {
  ...starterDefinition(),
  universe: { instruments: ["NSE:TEST"], minAvgTurnoverPaise: null },
  entry: { left: { kind: "SMA", period: 5 }, comparator: "CROSSES_ABOVE", right: { kind: "SMA", period: 20 } },
  exit: { left: { kind: "SMA", period: 5 }, comparator: "CROSSES_BELOW", right: { kind: "SMA", period: 20 } },
  targetPercent: 6,
  stopLossPercent: 4,
  sizing: { kind: "CAPITAL_PERCENT", percent: 100 },
  initialCapitalPaise: 10_000_000,
};

const INPUT: AttackInput = { definition: DEFINITION, series: SERIES, costModel: COSTS };

describe("seeded randomness", () => {
  /**
   * A report lands in an append-only table. A stored result nobody can
   * reproduce is a claim rather than a record — "5% of paths lost money" is
   * worth nothing if rerunning it says something else.
   */
  it("gives the same sequence for the same seed", () => {
    const a = Array.from({ length: 10 }, seededRandom(42));
    const b = Array.from({ length: 10 }, seededRandom(42));
    expect(a).toEqual(b);
  });

  it("gives a different sequence for a different seed", () => {
    const a = Array.from({ length: 10 }, seededRandom(42));
    const b = Array.from({ length: 10 }, seededRandom(43));
    expect(a).not.toEqual(b);
  });

  it("stays inside [0, 1)", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 500; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("walk-forward (W18-01)", () => {
  it("splits the period into sequential windows that cover it", () => {
    const windows = walkForward(INPUT, 4);

    expect(windows).toHaveLength(4);
    // Sequential and non-overlapping.
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].from > windows[i - 1].to).toBe(true);
    }
    // The last window absorbs the remainder, so no session is dropped.
    const full = runBacktest({ definition: DEFINITION, series: SERIES, costModel: COSTS });
    expect(windows.at(-1)!.to).toBe(full.periodEnd);
  });

  it("returns nothing rather than a misleading split when history is short", () => {
    const short = { ...INPUT, series: { "NSE:TEST": ohlcBars({ from: "2026-01-05", rows: jaggedRows(30) }) } };
    expect(walkForward(short, 20)).toEqual([]);
  });
});

describe("parameter sensitivity (W18-02)", () => {
  it("finds the indicator periods, which is §7.7's own example", () => {
    const tunables = tunableParameters(DEFINITION);
    const paths = tunables.map((t) => t.path);

    // RSI-13 against RSI-15 is the case the spec names; periods on both legs of
    // both conditions have to be reachable for that to be testable at all.
    expect(paths).toContain("entry.left.period");
    expect(paths).toContain("entry.right.period");
    expect(paths).toContain("exit.left.period");
    expect(paths).toContain("stopLossPercent");
    expect(paths).toContain("targetPercent");
  });

  it("keeps every neighbour inside the definition's own limits", () => {
    const narrow: StrategyDefinitionV2 = { ...DEFINITION, stopLossPercent: 0.1 };
    const stop = tunableParameters(narrow).find((t) => t.path === "stopLossPercent");

    // 0.1 is the floor. A neighbour below it is not a strategy anyone could
    // have authored, so comparing against it would be meaningless.
    expect(stop?.neighbours.every((n) => n >= 0.1)).toBe(true);
  });

  it("never mutates the definition it was given", () => {
    const before = JSON.stringify(DEFINITION);
    parameterSensitivity(INPUT);

    // A sweep that edited the definition would be authoring strategies nobody
    // wrote, and these variants must never reach `strategy_versions`.
    expect(JSON.stringify(DEFINITION)).toBe(before);
  });

  it("actually re-runs — variants differ from the base", () => {
    const results = parameterSensitivity(INPUT);

    expect(results.length).toBeGreaterThan(0);
    const moved = results.some((r) =>
      r.variants.some((v) => v.netReturnPercent !== r.baseNetReturnPercent),
    );
    // If every variant matched the base, the sweep would be changing a number
    // the engine does not read — which is exactly the W5-15 failure.
    expect(moved).toBe(true);
  });
});

describe("Monte Carlo on trade order (W18-04)", () => {
  const base = () => runBacktest({ definition: DEFINITION, series: SERIES, costModel: COSTS });

  it("is reproducible for a given seed", () => {
    const { trades, metrics } = base();
    const args = {
      trades,
      initialCapitalPaise: DEFINITION.initialCapitalPaise,
      observed: metrics,
      iterations: 200,
    };

    expect(monteCarloTradeOrder({ ...args, seed: 1 })).toEqual(
      monteCarloTradeOrder({ ...args, seed: 1 }),
    );
    expect(monteCarloTradeOrder({ ...args, seed: 1 })).not.toEqual(
      monteCarloTradeOrder({ ...args, seed: 2 }),
    );
  });

  it("reports one final return, because reordering cannot change it", () => {
    /**
     * The trap this attack was rebuilt around.
     *
     * Compounding is multiplication and multiplication commutes, so ending
     * equity is `capital × Π(1 + fᵢ)` and no reordering can move it. The first
     * implementation computed 5th/50th/95th percentiles of the final return and
     * printed three identical numbers on live data, which is how it was caught.
     *
     * Percentiles that are equal by construction, presented as a distribution,
     * are worse than no analysis: a reader takes "even the worst 5% of paths
     * returned 12%" as reassurance when it restates the single path they had.
     * So the type carries one number, and this test is what stops a later
     * change reintroducing the reassuring version.
     */
    const { trades, metrics } = base();
    const result = monteCarloTradeOrder({
      trades,
      initialCapitalPaise: DEFINITION.initialCapitalPaise,
      observed: metrics,
      iterations: 500,
    })!;

    expect(result).not.toBeNull();
    expect(typeof result.netReturnPercent).toBe("number");
    // No percentile of the final return exists to be misread.
    expect(result).not.toHaveProperty("p05NetReturnPercent");
    expect(result).not.toHaveProperty("losingPathsPercent");
  });

  it("proves the invariance rather than asserting it", () => {
    // Same fractions, deliberately opposite orders, same ending equity.
    const grow = (fractions: number[]) =>
      fractions.reduce((value, f) => value + value * f, 10_000_000);

    const fractions = [0.12, -0.05, 0.31, -0.18, 0.04, -0.09];
    expect(grow(fractions)).toBeCloseTo(grow([...fractions].reverse()), 6);
    expect(grow(fractions)).toBeCloseTo(grow([...fractions].sort((a, b) => a - b)), 6);
  });

  it("reports the drawdown distribution, which reordering genuinely moves", () => {
    const { trades, metrics } = base();
    const result = monteCarloTradeOrder({
      trades,
      initialCapitalPaise: DEFINITION.initialCapitalPaise,
      observed: metrics,
      iterations: 500,
    })!;

    // The route is what a trader lives through, and it is the only thing here
    // an ordering can change.
    expect(result.medianMaxDrawdownPercent).toBeLessThanOrEqual(result.p95MaxDrawdownPercent);
    expect(result.p95MaxDrawdownPercent).toBeLessThanOrEqual(result.worstMaxDrawdownPercent);
    expect(result.worseThanObservedPercent).toBeGreaterThanOrEqual(0);
    expect(result.worseThanObservedPercent).toBeLessThanOrEqual(100);
    // A real distribution has spread; identical values would mean the shuffle
    // is not shuffling.
    expect(result.worstMaxDrawdownPercent).toBeGreaterThan(result.medianMaxDrawdownPercent);
  });

  it("refuses to produce a distribution from too few trades", () => {
    const { metrics } = base();
    // Four trades have 24 orderings. Percentiles over that are noise wearing a
    // distribution's clothes, so this returns null and the caller records a skip.
    expect(
      monteCarloTradeOrder({
        trades: base().trades.slice(0, 4),
        initialCapitalPaise: DEFINITION.initialCapitalPaise,
        observed: metrics,
      }),
    ).toBeNull();
  });
});

describe("cost sensitivity (W18-05)", () => {
  it("raises slippage until the edge goes, and says where", () => {
    const result = costSensitivity(INPUT);

    expect(result.steps.length).toBeGreaterThan(0);
    // Monotonic: more slippage cannot help.
    for (let i = 1; i < result.steps.length; i++) {
      expect(result.steps[i].netReturnPercent).toBeLessThanOrEqual(
        result.steps[i - 1].netReturnPercent + 1e-9,
      );
    }
  });

  it("reports the first losing step as the break-even point", () => {
    const result = costSensitivity(INPUT);

    if (result.breakEvenSlippagePercent !== null) {
      const step = result.steps.find(
        (s) => s.slippagePercent === result.breakEvenSlippagePercent,
      );
      expect(step!.netReturnPercent).toBeLessThanOrEqual(0);
    }
  });
});

describe("the attack report (W18-07)", () => {
  it("is reproducible", () => {
    expect(attack({ ...INPUT, seed: 99 })).toEqual(attack({ ...INPUT, seed: 99 }));
  });

  it("ranks findings most severe first", () => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const { findings } = attack(INPUT);

    for (let i = 1; i < findings.length; i++) {
      expect(order[findings[i].severity]).toBeGreaterThanOrEqual(order[findings[i - 1].severity]);
    }
  });

  it("says which attacks ran, so a quiet report is not a broken one", () => {
    const report = attack(INPUT);

    // A suite that found nothing and a suite that failed to execute produce the
    // same empty findings list. Only this distinguishes them.
    expect(report.attacksRun.length).toBeGreaterThan(0);
    expect(report.suiteVersion).toBe("adversarial-1");
  });

  it("records why an attack was skipped rather than omitting it", () => {
    const short: AttackInput = {
      ...INPUT,
      series: { "NSE:TEST": ohlcBars({ from: "2026-01-05", rows: jaggedRows(40) }) },
    };
    const report = attack(short);

    expect(report.attacksSkipped.length).toBeGreaterThan(0);
    for (const skip of report.attacksSkipped) {
      expect(skip.reason.length).toBeGreaterThan(10);
    }
  });

  it("carries no score, grade or rating anywhere (§8.7)", () => {
    const report = attack(INPUT);
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k.toLowerCase());
          walk(v);
        }
      }
    };
    walk(report);

    /**
     * The pressure to add one of these will be constant, because a single
     * number is what everyone asks for. §8.7 forbids it: we report what
     * happened and never grade it. Severity describes a *finding*, not the
     * strategy, and nothing here aggregates severities into a total.
     */
    for (const banned of ["score", "grade", "rating", "rank", "stars", "verdict", "quality"]) {
      expect([...keys].filter((k) => k.includes(banned))).toEqual([]);
    }
  });

  it("states findings as evidenced observations, not judgements (§7.11)", () => {
    // Force a report with findings in it by making the strategy fragile.
    const fragile = attack({
      ...INPUT,
      definition: { ...DEFINITION, stopLossPercent: 2, targetPercent: 3 },
    });

    for (const finding of fragile.findings) {
      // "42 trades is below the threshold…", never "this strategy is weak".
      expect(finding.observation).toMatch(/\d/);
      expect(finding.observation).not.toMatch(
        /\b(weak|strong|bad|good|poor|excellent|promising|solid)\b/i,
      );
      expect(Object.keys(finding.evidence).length).toBeGreaterThan(0);
    }
  });

  it("finds something wrong with a strategy that has almost no trades", () => {
    // The suite must be able to fire. One that never produces a finding is
    // indistinguishable from a strategy with no problems.
    const barely: AttackInput = {
      ...INPUT,
      definition: { ...DEFINITION, entry: { left: { kind: "PRICE" }, comparator: "BELOW", right: { kind: "CONSTANT", value: 1 } } },
    };
    const report = attack(barely);

    expect(report.findings.some((f) => f.attack === "SAMPLE_SIZE")).toBe(true);
    expect(report.findings[0].severity).toBe("HIGH");
  });
});
