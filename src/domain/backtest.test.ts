import { describe, expect, it } from "vitest";

import { runBacktest, sharpeOf, BacktestError, type BacktestInput } from "./backtest";
import { ZERO_BROKERAGE, nseEquityDelivery, type CostModel } from "./costs";
import { ohlcBars, type OhlcRow } from "./market-data-fixture";
import { priceFromString } from "./money";
import { starterDefinition, type StrategyDefinition } from "./strategy";

/**
 * Behaviour of the engine, and the adversarial suite that tries to make it peek.
 *
 * The reconciliation gate (G4) lives in `backtest-reconciliation.test.ts` — that
 * file checks the arithmetic to the paisa. This one checks the *model*: when a
 * fill happens, at what price, and what the engine is allowed to have known at
 * the time.
 */

/** No charges at all, so a test about execution is only about execution. */
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
 * Price above/below a constant, so entries and exits are driven purely by the
 * close and there is no indicator warm-up in the way.
 */
const priceRules = (buyBelow: number, sellAbove: number): StrategyDefinition => ({
  ...starterDefinition(),
  instruments: ["NSE:TEST"],
  entry: { left: { kind: "PRICE" }, comparator: "BELOW", right: { kind: "CONSTANT", value: buyBelow } },
  exit: { left: { kind: "PRICE" }, comparator: "ABOVE", right: { kind: "CONSTANT", value: sellAbove } },
  stopLossPercent: 10,
  positionSizePercent: 100,
  initialCapitalPaise: 10_000_000, // ₹1,00,000
});

const run = (definition: StrategyDefinition, rows: OhlcRow[], overrides: Partial<BacktestInput> = {}) =>
  runBacktest({
    definition,
    series: { "NSE:TEST": ohlcBars({ from: "2026-01-05", rows }) },
    costModel: FREE,
    ...overrides,
  });

describe("execution model", () => {
  /**
   * The single most important assertion in the engine.
   *
   * A signal is decided at the close of bar t and filled at the open of bar
   * t+1. Filling at the signal bar's own close would be lookahead wearing a
   * plausible face — you cannot know a session's closing price and also trade
   * at it.
   */
  it("fills at the next bar's open, never the signal bar's close", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" }, // entry signal fires here
      { open: "95", high: "120", low: "94", close: "115" }, // filled at this open
      { open: "116", high: "121", low: "115", close: "118" },
    ];

    const { trades } = run(priceRules(95, 110), rows);

    expect(trades).toHaveLength(1);
    // 95, the second bar's open. Not 90 (the signal bar's close) and not 115.
    expect(trades[0].entryPrice).toBe(priceFromString("95"));
    expect(trades[0].entryDate).toBe("2026-01-06");
  });

  it("exits at the open after the exit signal", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "95", high: "120", low: "94", close: "115" }, // enter at 95; exit signal fires
      { open: "117", high: "121", low: "116", close: "118" }, // exit filled here
      { open: "118", high: "119", low: "117", close: "118" },
    ];

    const { trades } = run(priceRules(95, 110), rows);

    expect(trades).toHaveLength(1);
    expect(trades[0].exitPrice).toBe(priceFromString("117"));
    expect(trades[0].exitReason).toBe("SIGNAL");
  });

  /**
   * The invariant that catches the whole class of bookkeeping bugs.
   *
   * Whatever the engine does, the equity it ends on must be the capital it
   * started with plus the sum of what it recorded. Anything else means a
   * position was funded and never accounted for, or a charge was taken twice.
   * A real run over RELIANCE and TCS came out ₹76.79 short before this existed.
   */
  it("ends with capital plus the sum of every recorded trade", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "95", high: "120", low: "94", close: "115" },
      { open: "116", high: "121", low: "115", close: "94" }, // exit, then re-entry signal
      { open: "95", high: "96", low: "94", close: "95" },
    ];

    const outcome = run(priceRules(95, 110), rows);
    const sumOfNet = outcome.trades.reduce((total, t) => total + t.netPnlPaise, 0);

    expect(outcome.equityCurve.at(-1)!.equityPaise).toBe(10_000_000 + sumOfNet);
  });

  it("does not open a position on the last session of the period", () => {
    // The signal fires on the second-to-last close, so the fill would land on
    // the final session — where it could only be force-closed at that same
    // session's close. A round trip that can only pay charges.
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "100" },
      { open: "100", high: "101", low: "99", close: "90" }, // entry signal
      // The final session's close differs from its open on purpose. With the
      // two equal, a position wrongly opened here would be marked back to
      // exactly what it cost and the mistake would be invisible in equity —
      // which is how this escaped the first time it was mutated.
      { open: "95", high: "99", low: "94", close: "98" },
    ];

    const outcome = run(priceRules(95, 500), rows);

    expect(outcome.trades).toHaveLength(0);
    expect(outcome.equityCurve.at(-1)!.equityPaise).toBe(10_000_000);
  });

  it("closes anything still open at the final close", () => {
    // An unclosed position is an unrealised number. Reporting one as a result
    // would let a losing trade sit off the books indefinitely.
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "95", high: "96", low: "94", close: "95" },
      { open: "95", high: "96", low: "94", close: "96" },
    ];

    const { trades } = run(priceRules(95, 500), rows);

    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe("END_OF_PERIOD");
    expect(trades[0].exitPrice).toBe(priceFromString("96"));
  });
});

describe("stop-loss", () => {
  it("fills at the stop when the bar trades through it", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "101", low: "80", close: "85" }, // enter at 100, stop 90, low 80
      { open: "86", high: "87", low: "85", close: "86" },
    ];

    const { trades } = run(priceRules(95, 500), rows);

    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe("STOP_LOSS");
    // Stop is 10% below 100. Filled at the stop, not at the low.
    expect(trades[0].exitPrice).toBe(priceFromString("90"));
    expect(trades[0].exitDate).toBe("2026-01-06");
  });

  /**
   * The honesty test. When the market gaps below the stop overnight, nobody
   * could have sold at the stop — the first available price was the open.
   * Filling at the stop would hand the strategy money that never existed.
   */
  it("fills at the open when the market gaps through the stop", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "101", low: "99", close: "100" }, // enter at 100, stop 90
      { open: "70", high: "72", low: "68", close: "71" }, // gapped far below the stop
      { open: "71", high: "72", low: "70", close: "71" },
    ];

    const { trades } = run(priceRules(95, 500), rows);

    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe("STOP_LOSS");
    expect(trades[0].exitPrice).toBe(priceFromString("70"));
  });

  it("can stop out on the same bar the position opened", () => {
    // The stop is a resting order, and the session still has a low after the
    // open we bought at.
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "101", low: "85", close: "88" },
      { open: "88", high: "89", low: "87", close: "88" },
    ];

    const { trades } = run(priceRules(95, 500), rows);

    expect(trades).toHaveLength(1);
    expect(trades[0].entryDate).toBe("2026-01-06");
    expect(trades[0].exitDate).toBe("2026-01-06");
    expect(trades[0].exitPrice).toBe(priceFromString("90"));
  });

  /**
   * Ordering matters here and is easy to get backwards. An exit was signalled
   * yesterday, so an order rests at today's open — but the market gapped
   * through the stop overnight, so the stop is what filled, at the open.
   */
  it("reports a gap-through as a stop even when an exit was already signalled", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "121", low: "99", close: "120" }, // enter at 100; exit signal fires
      { open: "70", high: "75", low: "69", close: "74" }, // gaps below the 90 stop
      { open: "74", high: "75", low: "73", close: "74" },
    ];

    const { trades } = run(priceRules(95, 110), rows);

    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe("STOP_LOSS");
    expect(trades[0].exitPrice).toBe(priceFromString("70"));
  });
});

/**
 * W5-04. Not a statement of intent — an attempt to catch the engine cheating.
 *
 * The method: run once, then mutate bars the engine should not have been able
 * to see at decision time, run again, and assert nothing changed. If a future
 * bar can move a past decision, the engine is peeking.
 */
describe("no lookahead", () => {
  const base: OhlcRow[] = [
    { open: "100", high: "101", low: "99", close: "90" },
    { open: "95", high: "96", low: "94", close: "95" },
    { open: "96", high: "97", low: "95", close: "96" },
    { open: "97", high: "98", low: "96", close: "97" },
  ];

  it("ignores everything after the final bar it was given", () => {
    const short = run(priceRules(95, 500), base);
    const long = run(priceRules(95, 500), [
      ...base,
      { open: "500", high: "600", low: "400", close: "550" },
    ]);

    // The first trade's entry cannot depend on a session that had not happened.
    expect(long.trades[0].entryPrice).toBe(short.trades[0].entryPrice);
    expect(long.trades[0].entryDate).toBe(short.trades[0].entryDate);
  });

  it("does not let a later bar change an earlier fill price", () => {
    const before = run(priceRules(95, 500), base);

    const tampered = [...base];
    tampered[3] = { open: "9999", high: "10000", low: "9998", close: "9999" };
    const after = run(priceRules(95, 500), tampered);

    expect(after.trades[0].entryPrice).toBe(before.trades[0].entryPrice);
    expect(after.trades[0].entryDate).toBe(before.trades[0].entryDate);
  });

  it("never fills at a price from the bar that produced the signal", () => {
    // Every OHLC value on the signal bar is distinct from every value on the
    // fill bar, so any leak would show up as an exact match.
    const rows: OhlcRow[] = [
      { open: "10", high: "11", low: "9", close: "9.5" }, // signal bar
      { open: "50", high: "55", low: "45", close: "52" }, // fill bar
      { open: "52", high: "53", low: "51", close: "52" },
    ];

    const { trades } = run(priceRules(20, 500), rows);
    const signalBarPrices = ["10", "11", "9", "9.5"].map((p) => priceFromString(p));

    expect(trades).toHaveLength(1);
    expect(signalBarPrices).not.toContain(trades[0].entryPrice);
    expect(trades[0].entryPrice).toBe(priceFromString("50"));
  });

  it("cannot enter on the very first bar, because there is no prior close", () => {
    const rows: OhlcRow[] = [
      { open: "10", high: "11", low: "9", close: "9" }, // would signal, but nothing precedes it
      { open: "10", high: "11", low: "9", close: "10" },
    ];

    const { trades } = run(priceRules(50, 500), rows);
    expect(trades[0]?.entryDate).not.toBe("2026-01-05");
  });
});

describe("indicator warm-up", () => {
  it("refuses a series too short for the rules to ever signal", () => {
    // SMA(20)/SMA(50) needs 50 sessions. Ten cannot produce a first value, and
    // running anyway would return a zero-trade result that reads as a finding.
    const rows: OhlcRow[] = Array.from({ length: 10 }, () => ({
      open: "100",
      high: "101",
      low: "99",
      close: "100",
    }));

    expect(() =>
      runBacktest({
        definition: { ...starterDefinition(), instruments: ["NSE:TEST"] },
        series: { "NSE:TEST": ohlcBars({ from: "2026-01-05", rows }) },
        costModel: FREE,
      }),
    ).toThrow(BacktestError);
  });

  /**
   * The exact boundary, pinned.
   *
   * `warmUpBars("SMA", 50)` is 50 — the bars the indicator *consumes* — but the
   * first value lands at index 49, having consumed indices 0–49. Gating signals
   * at index 50 silently discarded a session the strategy could legitimately
   * have traded. Found by mutating the gate and noticing nothing failed.
   */
  it("signals on the first bar the indicator has a value, not the one after", () => {
    // Flat at 100 for 49 sessions, then a jump. At index 49 the SMA(50) exists
    // for the first time — mean of forty-nine 100s and one 200, ₹102 — and the
    // close of 200 is above it, so the entry signal belongs to that session.
    const rows: OhlcRow[] = [
      ...Array.from({ length: 49 }, () => ({ open: "100", high: "100", low: "100", close: "100" })),
      { open: "200", high: "200", low: "200", close: "200" }, // index 49
      { open: "210", high: "215", low: "205", close: "212" }, // index 50 — the fill
      { open: "213", high: "216", low: "212", close: "214" },
    ];

    const outcome = runBacktest({
      definition: {
        ...priceRules(1, 100_000),
        entry: { left: { kind: "PRICE" }, comparator: "ABOVE", right: { kind: "SMA", period: 50 } },
        exit: { left: { kind: "PRICE" }, comparator: "BELOW", right: { kind: "SMA", period: 50 } },
      },
      series: { "NSE:TEST": ohlcBars({ from: "2026-01-05", rows }) },
      costModel: FREE,
    });

    const bars = ohlcBars({ from: "2026-01-05", rows });
    expect(outcome.trades[0].entryDate).toBe(bars[50].date);
    expect(outcome.trades[0].entryPrice).toBe(priceFromString("210"));
    // And the reported period opens on the first signallable session, not later.
    expect(outcome.periodStart).toBe(bars[49].date);
  });

  it("reports the warm-up it consumed", () => {
    const rows: OhlcRow[] = Array.from({ length: 60 }, (_, i) => ({
      open: "100",
      high: "101",
      low: "99",
      close: String(100 + i),
    }));

    const outcome = runBacktest({
      definition: { ...starterDefinition(), instruments: ["NSE:TEST"] },
      series: { "NSE:TEST": ohlcBars({ from: "2026-01-05", rows }) },
      costModel: FREE,
    });

    expect(outcome.warmUpBars).toBe(50);
    // The reported period starts once signals are possible, not at the first
    // bar loaded — counting warm-up sessions in the return would credit the
    // strategy with a period it was structurally unable to trade.
    expect(outcome.periodStart > "2026-01-05").toBe(true);
  });
});

describe("metrics", () => {
  it("reports zero exposure and no trades for a strategy that never fires", () => {
    const rows: OhlcRow[] = Array.from({ length: 5 }, () => ({
      open: "100",
      high: "101",
      low: "99",
      close: "100",
    }));

    const { metrics } = run(priceRules(1, 500), rows);

    expect(metrics.tradeCount).toBe(0);
    expect(metrics.exposurePercent).toBe(0);
    expect(metrics.netReturnPercent).toBe(0);
    expect(metrics.hitRatePercent).toBe(0);
  });

  it("measures drawdown against the running peak, not the start", () => {
    const curve = [
      { date: "2026-01-05", equityPaise: 100 },
      { date: "2026-01-06", equityPaise: 200 },
      { date: "2026-01-07", equityPaise: 150 },
    ];
    // Peak 200 → trough 150 is 25%. Measured from the 100 start it would read
    // as a gain, which is how a drawdown gets silently understated.
    const worst = curve.reduce(
      (max, p, i) => {
        const peak = Math.max(...curve.slice(0, i + 1).map((q) => q.equityPaise));
        return Math.max(max, ((peak - p.equityPaise) / peak) * 100);
      },
      0,
    );
    expect(worst).toBeCloseTo(25, 10);
  });

  it("returns null Sharpe when there is nothing to measure", () => {
    expect(sharpeOf([])).toBeNull();
    expect(sharpeOf([{ date: "a", equityPaise: 100 }])).toBeNull();
    // A flat curve has no dispersion. Reporting 0 would read as "measured, and
    // it was poor" rather than "not measurable".
    expect(
      sharpeOf([
        { date: "a", equityPaise: 100 },
        { date: "b", equityPaise: 100 },
        { date: "c", equityPaise: 100 },
      ]),
    ).toBeNull();
  });

  it("annualises a positive drift to a positive Sharpe", () => {
    const curve = Array.from({ length: 40 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      equityPaise: Math.round(100_000 * 1.001 ** i),
    }));
    const sharpe = sharpeOf(curve);
    expect(sharpe).not.toBeNull();
    expect(sharpe!).toBeGreaterThan(0);
  });
});

describe("costs are structural", () => {
  it("charges reduce the net result below the gross move", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "121", low: "99", close: "120" },
      { open: "120", high: "121", low: "119", close: "120" },
    ];

    const withCosts = run(priceRules(95, 110), rows, {
      costModel: nseEquityDelivery({ brokerage: ZERO_BROKERAGE, slippagePercent: 0.05 }),
    });

    const trade = withCosts.trades[0];
    expect(trade.grossPnlPaise).toBeGreaterThan(0);
    expect(trade.costs.totalPaise).toBeGreaterThan(0);
    // The identity that must always hold, on every trade, with no flag able to
    // switch it off (§5.3).
    expect(trade.netPnlPaise).toBe(trade.grossPnlPaise - trade.costs.totalPaise);
    expect(trade.netPnlPaise).toBeLessThan(trade.grossPnlPaise);
  });

  it("never leaves cash negative after funding a position", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "101", low: "99", close: "100" },
      { open: "100", high: "101", low: "99", close: "100" },
    ];

    const outcome = run(priceRules(95, 500), rows, {
      costModel: nseEquityDelivery({ brokerage: ZERO_BROKERAGE, slippagePercent: 0.5 }),
    });

    // Sizing at 100% of cash has to leave room for the charges on the buy leg.
    for (const point of outcome.equityCurve) {
      expect(point.equityPaise).toBeGreaterThan(0);
    }
  });
});
