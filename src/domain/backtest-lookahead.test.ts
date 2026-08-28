import { describe, expect, it } from "vitest";

import { runBacktest } from "./backtest";
import { signalsFor } from "./backtest-signals";
import { ema, rsi, sma } from "./indicators";
import { ZERO_BROKERAGE, type CostModel } from "./costs";
import { ohlcBars, type OhlcRow } from "./market-data-fixture";
import { resolveDefinition, starterDefinition, type StrategyDefinitionV2 } from "./strategy";

/**
 * The adversarial suite for lookahead bias. `plan.md` W5-04.
 *
 * `CLAUDE.md` §7.6: *"Requires an adversarial test suite for lookahead bias.
 * Intent is not sufficient."* That sentence is the reason this file is separate
 * from `backtest.test.ts`, which asserts the behaviours the engine was written
 * to have. These assert a **property** the engine must have whether or not
 * anyone remembered to write it in: that nothing computed for session *t*
 * depends on anything after session *t*.
 *
 * ## Why property tests rather than more example fixtures
 *
 * A fixture catches the leak you thought of. Lookahead is dangerous precisely
 * because it is the leak nobody thought of — a centred moving average, a
 * normalisation over the whole series, a liquidity filter using a full-history
 * average, a "max drawdown so far" that quietly reads ahead. Every one of those
 * produces plausible numbers.
 *
 * The general shape below is **prefix invariance**: compute on the first *k*
 * bars, compute on all of them, and require the first *k* results to be
 * identical. Any function that reads forward breaks it, including functions
 * added years from now by someone who never read this file. That is the only
 * kind of test that outlives the intent it was written with.
 *
 * A leak here does not produce an error. It produces a better backtest.
 */

const FREE: CostModel = {
  segment: "TEST_FREE",
  brokerage: ZERO_BROKERAGE,
  stt: { percent: 0, side: "BOTH" },
  stampDuty: { percent: 0, side: "BUY" },
  exchangeTransaction: { percent: 0, side: "BOTH" },
  sebiTurnover: { percent: 0, side: "BOTH" },
  gstPercent: 0,
  slippagePercent: 0,
};

/**
 * A deterministic, jagged series — no trend, frequent reversals, one violent
 * spike near the end.
 *
 * Jagged on purpose. A smooth ramp hides a one-bar shift, because bar *t* and
 * bar *t+1* are nearly equal and a peeking indicator reads almost the same
 * number either way. Reversals make an off-by-one visible.
 *
 * Generated arithmetically rather than hand-written so the series is long
 * enough for a 50-period indicator to warm up and still leave room to trade.
 */
function jaggedRows(count: number): OhlcRow[] {
  const rows: OhlcRow[] = [];
  for (let i = 0; i < count; i++) {
    // Two out-of-phase saw waves, so the shape never repeats on a short cycle.
    const base = 100 + ((i * 7) % 23) - ((i * 3) % 11);
    const spike = i === count - 6 ? 40 : 0;
    const open = base;
    const close = base + ((i % 5) - 2);
    const high = Math.max(open, close) + 2 + spike;
    const low = Math.min(open, close) - 2;
    rows.push({
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: close.toFixed(2),
    });
  }
  return rows;
}

const ROWS = jaggedRows(140);
const bars = (count: number = ROWS.length) =>
  ohlcBars({ from: "2026-01-05", rows: ROWS.slice(0, count) });

/** Crossover rules, so entries depend on two indicators rather than a price level. */
const crossover: StrategyDefinitionV2 = {
  ...starterDefinition(),
  universe: { instruments: ["NSE:TEST"], minAvgTurnoverPaise: null },
  entry: { left: { kind: "SMA", period: 5 }, comparator: "CROSSES_ABOVE", right: { kind: "SMA", period: 20 } },
  exit: { left: { kind: "SMA", period: 5 }, comparator: "CROSSES_BELOW", right: { kind: "SMA", period: 20 } },
  targetPercent: 8,
  stopLossPercent: 4,
  sizing: { kind: "CAPITAL_PERCENT", percent: 100 },
  initialCapitalPaise: 10_000_000,
};

describe("indicators cannot read forward", () => {
  const closes = ROWS.map((r) => Number(r.close));

  /**
   * The generic trap. Every indicator, at every prefix length, must agree with
   * itself computed over more data.
   */
  const cases: Array<[string, (values: readonly number[]) => Array<number | null>]> = [
    ["sma(5)", (v) => sma(v, 5)],
    ["sma(50)", (v) => sma(v, 50)],
    ["ema(12)", (v) => ema(v, 12)],
    ["ema(26)", (v) => ema(v, 26)],
    ["rsi(14)", (v) => rsi(v, 14)],
  ];

  for (const [name, compute] of cases) {
    it(`${name} gives the same value at index i whatever follows it`, () => {
      const full = compute(closes);

      // Every prefix, not a sampled few. The suite is cheap and a leak that
      // only shows at one length is exactly the kind that survives sampling.
      for (let k = 1; k <= closes.length; k++) {
        const prefix = compute(closes.slice(0, k));
        expect(prefix).toEqual(full.slice(0, k));
      }
    });
  }

  it("would catch a peek — the control", () => {
    /**
     * A negative control, because a property test that cannot fail proves
     * nothing. This "indicator" reads one bar ahead, which is the commonest
     * form of the bug, and the assertion above must reject it.
     */
    const peeking = (values: readonly number[]): Array<number | null> =>
      values.map((_, i) => values[i + 1] ?? null);

    const full = peeking(closes);
    let differed = false;
    for (let k = 1; k <= closes.length && !differed; k++) {
      try {
        expect(peeking(closes.slice(0, k))).toEqual(full.slice(0, k));
      } catch {
        differed = true;
      }
    }
    expect(differed).toBe(true);
  });
});

describe("signals cannot read forward", () => {
  it("produces the same signal at index i whatever follows it", () => {
    const definition = resolveDefinition(crossover);
    const full = signalsFor(definition, bars());

    for (let k = 1; k <= ROWS.length; k++) {
      const prefix = signalsFor(definition, bars(k));
      expect(prefix.entry).toEqual(full.entry.slice(0, k));
      expect(prefix.exit).toEqual(full.exit.slice(0, k));
    }
  });

  it("holds for the liquidity filter, which averages over a trailing window", () => {
    /**
     * The filter that most invites the bug. Averaging turnover over the *whole*
     * series would let a stock that became liquid in 2025 authorise trades in
     * 2021 — lookahead wearing a liquidity filter's clothes, and it would raise
     * the backtest's returns rather than break it.
     */
    const withFloor = resolveDefinition({
      ...crossover,
      universe: { instruments: ["NSE:TEST"], minAvgTurnoverPaise: 1_000_000 },
    });
    const full = signalsFor(withFloor, bars());

    for (let k = 1; k <= ROWS.length; k++) {
      expect(signalsFor(withFloor, bars(k)).entry).toEqual(full.entry.slice(0, k));
    }
  });
});

describe("the engine cannot read forward", () => {
  /**
   * The property at engine level: a trade that closed on or before session *k*
   * must be identical whether the engine was given *k* bars or all of them.
   *
   * This is strictly stronger than the indicator tests. It also covers fill
   * prices, stop and target resolution, sizing and the cash ledger — anywhere a
   * future bar could leak into a past decision.
   */
  it("reports the same closed trades for a prefix as for the full series", () => {
    const full = runBacktest({
      definition: crossover,
      series: { "NSE:TEST": bars() },
      costModel: FREE,
      closeOutOn: null, // do not force a close, or the last trade differs by construction
    });

    for (let k = 40; k <= ROWS.length; k += 7) {
      const truncated = runBacktest({
        definition: crossover,
        series: { "NSE:TEST": bars(k) },
        costModel: FREE,
        closeOutOn: null,
      });

      const cutoff = truncated.periodEnd;
      const comparable = full.trades.filter((t) => t.exitDate <= cutoff);

      expect(truncated.trades).toEqual(comparable);
    }
  });

  it("cannot capture a spike it could only have seen coming", () => {
    /**
     * The series has one violent spike six bars from the end. An engine that
     * peeked would enter the session before it and take the whole move.
     *
     * Asserted as a bound rather than an exact figure: the point is not what
     * this strategy earned, it is that no single trade captured a move that was
     * unknowable at the moment of entry.
     */
    const { trades } = runBacktest({
      definition: crossover,
      series: { "NSE:TEST": bars() },
      costModel: FREE,
    });

    for (const trade of trades) {
      const movePercent =
        (((trade.exitPrice as number) - (trade.entryPrice as number)) /
          (trade.entryPrice as number)) *
        100;
      // The target caps a winner at 8%; a gap can overshoot it, but nothing
      // should approach the ~40% the spike itself was worth.
      expect(movePercent).toBeLessThan(25);
    }
  });

  it("does not let the final session's close change an earlier fill", () => {
    // Rewrite only the last bar, wildly. Every trade that closed before it must
    // be untouched — including the prices they filled at.
    const original = [...ROWS];
    const altered = [...ROWS];
    altered[altered.length - 1] = { open: "500", high: "900", low: "10", close: "800" };

    const runWith = (rows: OhlcRow[]) =>
      runBacktest({
        definition: crossover,
        series: { "NSE:TEST": ohlcBars({ from: "2026-01-05", rows }) },
        costModel: FREE,
        closeOutOn: null,
      });

    const before = runWith(original).trades;
    const after = runWith(altered).trades;
    const lastDate = ohlcBars({ from: "2026-01-05", rows: ROWS }).at(-1)!.date;

    expect(after.filter((t) => t.exitDate < lastDate)).toEqual(
      before.filter((t) => t.exitDate < lastDate),
    );
  });
});
