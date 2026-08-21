import { describe, expect, it } from "vitest";

import { IndicatorError, ema, indicatorSeries, rsi, sma, warmUpBars } from "./indicators";

/**
 * Every expected value below is hand-computed and the working is written out.
 *
 * That is the point. `plan.md` W4-02 asks for "a hand-verified test per
 * indicator", and gate G4 turns on numbers a person checked. A test whose
 * expectations were produced by running the implementation proves only that
 * the implementation is deterministic.
 */

describe("sma", () => {
  it("averages the trailing window, first value at index period-1", () => {
    // windows: [1,2,3]=2, [2,3,4]=3, [3,4,5]=4
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("is exact on integer ticks, with no accumulated drift", () => {
    // ₹345.00, ₹346.00, ₹347.00 in ticks. Mean is ₹346.00 exactly.
    const ticks = [3_450_000, 3_460_000, 3_470_000];
    // toBe, not toBeCloseTo — a running float mean would not survive this.
    expect(sma(ticks, 3)[2]).toBe(3_460_000);
  });

  it("returns an array aligned to the input, all null when too short", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
    expect(sma([1, 2, 3], 3)).toHaveLength(3);
  });

  it("with period 1 is the series itself", () => {
    expect(sma([4, 7, 2], 1)).toEqual([4, 7, 2]);
  });
});

describe("ema", () => {
  it("seeds with the SMA of the first window", () => {
    // period 3 → k = 2/4 = 0.5
    // idx2 seed = (10+20+30)/3          = 20
    // idx3      = (40 - 20) * 0.5 + 20  = 30
    // idx4      = (50 - 30) * 0.5 + 30  = 40
    expect(ema([10, 20, 30, 40, 50], 3)).toEqual([null, null, 20, 30, 40]);
  });

  it("smooths with k = 2 / (period + 1)", () => {
    // period 2 → k = 2/3
    // idx1 seed = (1+2)/2                    = 1.5
    // idx2      = (3 - 1.5) * 2/3 + 1.5      = 1 + 1.5 = 2.5
    const out = ema([1, 2, 3], 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(1.5);
    expect(out[2]).toBeCloseTo(2.5, 10);
  });

  it("holds flat on a flat series", () => {
    expect(ema([7, 7, 7, 7], 2)).toEqual([null, 7, 7, 7]);
  });

  it("is all null when there is less history than the period", () => {
    expect(ema([1, 2], 3)).toEqual([null, null]);
  });

  it("with period 1 reproduces the series exactly", () => {
    // An independent check of the smoothing constant rather than of the
    // arithmetic: k = 2/(period+1) is 1 at period 1, so every bar replaces the
    // previous value outright. Any other formula fails this.
    expect(ema([4, 7, 2, 9], 1)).toEqual([4, 7, 2, 9]);
  });
});

describe("rsi", () => {
  it("uses Wilder smoothing, first value at index period", () => {
    // period 2 over [10, 11, 10, 11, 12]; changes: +1, -1, +1, +1
    //
    // seed (changes +1, -1): avgGain = 1/2 = 0.5, avgLoss = 1/2 = 0.5
    //   idx2 → RS = 1     → 100 - 100/2 = 50
    // idx3 (+1): avgGain = (0.5*1 + 1)/2 = 0.75, avgLoss = (0.5*1 + 0)/2 = 0.25
    //   → RS = 3          → 100 - 100/4 = 75
    // idx4 (+1): avgGain = (0.75*1 + 1)/2 = 0.875, avgLoss = (0.25*1 + 0)/2 = 0.125
    //   → RS = 7          → 100 - 100/8 = 87.5
    const out = rsi([10, 11, 10, 11, 12], 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(50, 10);
    expect(out[3]).toBeCloseTo(75, 10);
    expect(out[4]).toBeCloseTo(87.5, 10);
  });

  it("reads 100 when a window has gains and no losses", () => {
    expect(rsi([1, 2, 3], 2)[2]).toBe(100);
  });

  it("reads 0 when a window has losses and no gains", () => {
    expect(rsi([3, 2, 1], 2)[2]).toBe(0);
  });

  it("reads 50 on a flat window, not 100", () => {
    // The disagreement between implementations. A stock that has not moved is
    // neutral; returning 100 would call it maximally strong.
    expect(rsi([5, 5, 5], 2)[2]).toBe(50);
  });

  it("stays within 0 and 100 across a noisy series", () => {
    const noisy = [100, 104, 99, 107, 103, 98, 110, 96, 112, 101, 115, 94, 118, 99, 121];
    for (const value of rsi(noisy, 5)) {
      if (value === null) continue;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("needs period + 1 prices before it can say anything", () => {
    // Two prices give one change; RSI(2) needs two.
    expect(rsi([10, 11], 2)).toEqual([null, null]);
    expect(rsi([10, 11, 12], 2)[2]).not.toBeNull();
  });
});

describe("warm-up", () => {
  it("is the period for the moving averages", () => {
    expect(warmUpBars("SMA", 20)).toBe(20);
    expect(warmUpBars("EMA", 50)).toBe(50);
  });

  it("is one more than the period for RSI, which consumes changes", () => {
    expect(warmUpBars("RSI", 14)).toBe(15);
  });

  it("matches where the first non-null value actually lands", () => {
    // The engine sizes its data request from this, so a mismatch means an
    // opening stretch of every backtest silently cannot trade.
    const values = Array.from({ length: 40 }, (_, i) => 100 + i);
    for (const [kind, period] of [
      ["SMA", 5],
      ["EMA", 5],
      ["RSI", 5],
    ] as const) {
      const series = indicatorSeries(kind, values, period);
      const firstValue = series.findIndex((v) => v !== null);
      expect(firstValue + 1, kind).toBe(warmUpBars(kind, period));
    }
  });
});

describe("guards", () => {
  it("rejects a period that is not a whole number of at least one", () => {
    for (const bad of [0, -3, 2.5, Number.NaN]) {
      expect(() => sma([1, 2, 3], bad), String(bad)).toThrow(IndicatorError);
    }
  });

  it("rejects a series containing something that is not a finite number", () => {
    expect(() => ema([1, Number.POSITIVE_INFINITY, 3], 2)).toThrow(IndicatorError);
    expect(() => rsi([1, Number.NaN, 3], 2)).toThrow(IndicatorError);
  });

  it("dispatches every indicator the strategy language can name", () => {
    const values = [1, 2, 3, 4, 5];
    expect(indicatorSeries("SMA", values, 2)).toEqual(sma(values, 2));
    expect(indicatorSeries("EMA", values, 2)).toEqual(ema(values, 2));
    expect(indicatorSeries("RSI", values, 2)).toEqual(rsi(values, 2));
  });
});
