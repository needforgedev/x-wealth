import { describe, expect, it } from "vitest";

import { ohlcBars, type OhlcRow } from "./market-data-fixture";
import {
  DEFAULT_REGIME_SETTINGS,
  classifySessions,
  regimeIndex,
  regimeKey,
} from "./regime";

/**
 * `plan.md` W18-03.
 *
 * The load-bearing test in this file is the lookahead one. Everything else
 * checks that the labels are sensible; that one checks they are *honest*, and a
 * dishonest label would make the whole regime analysis flattering and useless
 * in a way no other assertion would catch.
 */

const rows = (closes: number[]): OhlcRow[] =>
  closes.map((close) => ({
    open: close.toFixed(2),
    high: (close + 1).toFixed(2),
    low: (close - 1).toFixed(2),
    close: close.toFixed(2),
  }));

const bars = (closes: number[]) => ohlcBars({ from: "2026-01-05", rows: rows(closes) });

/** A steady climb, a steady fall, then a flat stretch — 100 sessions each. */
function threeRegimes(): number[] {
  const closes: number[] = [];
  for (let i = 0; i < 100; i++) closes.push(100 + i * 0.8);
  for (let i = 0; i < 100; i++) closes.push(180 - i * 0.8);
  for (let i = 0; i < 100; i++) closes.push(100 + ((i % 4) - 1.5) * 0.4);
  return closes;
}

describe("no lookahead in the classifier (W18-03)", () => {
  /**
   * The trap this module was written around.
   *
   * The natural way to label a regime is by what the market did *next* — "the
   * six months after this were a bull market". Label that way, attribute trades
   * to labels, and the analysis already contains the answer: the winners land
   * in the favourable regime by construction. It would be lookahead bias inside
   * the tool built to detect lookahead bias, and the output would look
   * completely reasonable.
   *
   * Same property as `backtest-lookahead.test.ts`: a session's label must not
   * change when more history arrives after it.
   */
  it("gives a session the same label whatever follows it", () => {
    const closes = threeRegimes();
    const full = classifySessions(bars(closes));

    for (let k = DEFAULT_REGIME_SETTINGS.lookback + 5; k <= closes.length; k += 11) {
      const prefix = classifySessions(bars(closes.slice(0, k)));
      expect(prefix).toEqual(full.slice(0, prefix.length));
    }
  });

  it("would catch a whole-sample split — the control", () => {
    /**
     * A negative control, because a property test that cannot fail proves
     * nothing.
     *
     * This is the one-line-shorter implementation the module deliberately does
     * not use: split volatility against the median of the *entire* series. It
     * is the obvious way to write it and it fails the assertion above, which is
     * the whole reason the median in `classifySessions` is expanding.
     */
    const closes = threeRegimes();
    const volatilities = classifySessions(bars(closes)).map((s) => s.volatilityPercent);

    const wholeSampleLabels = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      return values.map((v) => (v > median ? "HIGH_VOL" : "LOW_VOL"));
    };

    const full = wholeSampleLabels(volatilities);
    const prefix = wholeSampleLabels(volatilities.slice(0, 120));

    expect(prefix).not.toEqual(full.slice(0, prefix.length));
  });
});

describe("labels", () => {
  it("leaves sessions inside the warm-up unclassified rather than guessing", () => {
    const closes = threeRegimes();
    const sessions = classifySessions(bars(closes));

    // Not padded with a default. A trade in that period genuinely happened in
    // an unclassifiable market, and calling it SIDEWAYS would put real trades
    // in a bucket the data never supported.
    expect(sessions).toHaveLength(closes.length - DEFAULT_REGIME_SETTINGS.lookback);
    expect(sessions[0].date > bars(closes)[0].date).toBe(true);
  });

  it("calls a sustained climb bullish and a sustained fall bearish", () => {
    const sessions = classifySessions(bars(threeRegimes()));
    const at = (i: number) => sessions.find((s) => s.date === bars(threeRegimes())[i].date);

    // Deep inside the climb, and deep inside the fall.
    expect(at(95)?.regime.trend).toBe("BULL");
    expect(at(195)?.regime.trend).toBe("BEAR");
  });

  it("calls a flat stretch sideways", () => {
    const sessions = classifySessions(bars(threeRegimes()));
    const flat = sessions.filter((s) => s.date >= bars(threeRegimes())[260].date);

    expect(flat.length).toBeGreaterThan(0);
    expect(flat.every((s) => s.regime.trend === "SIDEWAYS")).toBe(true);
  });

  it("splits volatility against the series' own history, not a fixed number", () => {
    // A quiet large-cap and a wild midcap must both produce two buckets. A
    // fixed threshold would put one of them entirely on one side and say
    // nothing at all.
    const quiet = classifySessions(bars(threeRegimes().map((c) => c * 0.001 + 100)));
    const wild = classifySessions(bars(threeRegimes().map((c) => c * 10)));

    for (const set of [quiet, wild]) {
      const labels = new Set(set.map((s) => s.regime.volatility));
      expect(labels.size).toBe(2);
    }
  });

  it("keys the six combinations distinctly", () => {
    expect(regimeKey({ trend: "BULL", volatility: "HIGH_VOL" })).toBe("BULL/HIGH_VOL");
    expect(regimeKey({ trend: "SIDEWAYS", volatility: "LOW_VOL" })).toBe("SIDEWAYS/LOW_VOL");
  });

  it("indexes by date for attributing a trade to its entry session", () => {
    const sessions = classifySessions(bars(threeRegimes()));
    const index = regimeIndex(sessions);

    expect(index.size).toBe(sessions.length);
    expect(index.get(sessions[10].date)).toEqual(sessions[10].regime);
  });
});
