import { describe, expect, it } from "vitest";

import {
  ADEQUATE_TRADE_COUNT,
  BacktestError,
  calmarOf,
  longestLosingStreakOf,
  runBacktest,
  sharpeOf,
  sortinoOf,
  type BacktestInput,
} from "./backtest";
import { ZERO_BROKERAGE, nseEquityDelivery, type CostModel } from "./costs";
import { fixtureSource, ohlcBars, type OhlcRow } from "./market-data-fixture";
import { buildMethodology } from "./methodology";
import { priceFromString } from "./money";
import { starterDefinition, type StrategyDefinitionV2 } from "./strategy";

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
const priceRules = (buyBelow: number, sellAbove: number): StrategyDefinitionV2 => ({
  ...starterDefinition(),
  universe: { instruments: ["NSE:TEST"], minAvgTurnoverPaise: null },
  entry: { left: { kind: "PRICE" }, comparator: "BELOW", right: { kind: "CONSTANT", value: buyBelow } },
  exit: { left: { kind: "PRICE" }, comparator: "ABOVE", right: { kind: "CONSTANT", value: sellAbove } },
  stopLossPercent: 10,
  sizing: { kind: "CAPITAL_PERCENT" as const, percent: 100 },
  initialCapitalPaise: 10_000_000, // ₹1,00,000
});

const run = (definition: StrategyDefinitionV2, rows: OhlcRow[], overrides: Partial<BacktestInput> = {}) =>
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
describe("take-profit target (W5-15)", () => {
  /**
   * `targetPercent` was carried by the definition, validated, and required as a
   * key by the `0012` CHECK for a fortnight while the engine never read it. A
   * strategy could declare "take profit at 10%" and be backtested as though it
   * had declared nothing — a result describing rules nobody wrote. These are
   * the assertions that would have caught it.
   */
  const withTarget = (targetPercent: number) => ({
    ...priceRules(95, 999), // exit rule never fires; only stop and target can close
    targetPercent,
  });

  it("exits at the target when a later bar trades through it", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" }, // entry signal
      { open: "100", high: "104", low: "99", close: "103" }, // entry at 100, no level hit
      { open: "104", high: "115", low: "103", close: "114" }, // high reaches 110
      { open: "114", high: "116", low: "113", close: "115" },
    ];

    const { trades } = run(withTarget(10), rows);

    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe("TARGET");
    // Filled at the target itself, not at the high the bar happened to reach.
    expect(trades[0].exitPrice).toBe(priceFromString("110"));
  });

  it("fills at the open when the market gaps above the target", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "104", low: "99", close: "103" }, // entry at 100
      { open: "125", high: "130", low: "124", close: "129" }, // gapped past 110
    ];

    const { trades } = run(withTarget(10), rows);

    expect(trades[0].exitReason).toBe("TARGET");
    // The favourable gap is as real as the unfavourable one. Refusing to model
    // it while modelling the gap-down would be a thumb on the scale.
    expect(trades[0].exitPrice).toBe(priceFromString("125"));
  });

  it("can reach the target on the same bar the position opened", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "112", low: "99.5", close: "111" }, // entry and target, one bar
      { open: "111", high: "112", low: "110", close: "111" },
    ];

    const { trades } = run(withTarget(10), rows);

    expect(trades).toHaveLength(1);
    expect(trades[0].entryDate).toBe(trades[0].exitDate);
    expect(trades[0].exitReason).toBe("TARGET");
  });

  it("rounds the target up, never into the strategy's favour", () => {
    // Entry 100.005 → a 1% target is 101.00505, which is not on a tick. Rounded
    // up to 101.0051, so a bar reaching exactly 101.005 must NOT fill.
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100.005", high: "101.005", low: "99", close: "100.5" },
      { open: "100.5", high: "100.6", low: "100.4", close: "100.5" },
    ];

    const { trades } = run(withTarget(1), rows);

    expect(trades.filter((t) => t.exitReason === "TARGET")).toHaveLength(0);
  });

  it("never produces a target exit when the strategy declares none", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "500", low: "99", close: "480" }, // would clear any target
      { open: "480", high: "490", low: "470", close: "485" },
    ];

    const { trades } = run({ ...priceRules(95, 999), targetPercent: null }, rows);

    expect(trades.every((t) => t.exitReason !== "TARGET")).toBe(true);
  });
});

describe("the intrabar problem (W5-13)", () => {
  /**
   * `CLAUDE.md` §7.6 calls this the biggest source of false results in a
   * backtest, and it is the only assumption in the engine that can invert a
   * verdict while every number on screen still looks ordinary.
   *
   * A daily bar that reaches both levels does not say which came first. The
   * engine takes the stop, always. These tests exist to stop that quietly
   * becoming "whichever branch was evaluated first".
   */
  const bothLevels = { ...priceRules(95, 999), targetPercent: 10 };

  it("takes the stop when one bar reaches both levels", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "104", low: "99", close: "103" }, // entry at 100
      // stop 90, target 110, and this bar reaches both.
      { open: "103", high: "115", low: "85", close: "112" },
      { open: "112", high: "113", low: "111", close: "112" },
    ];

    const { trades } = run(bothLevels, rows);

    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe("STOP_LOSS");
    expect(trades[0].exitPrice).toBe(priceFromString("90"));
    // And it must be a loss. The optimistic reading of this same bar is a +10%
    // win, which is the whole reason the rule exists.
    expect(trades[0].netPnlPaise).toBeLessThan(0);
  });

  it("takes the stop when both levels are reached on the entry bar itself", () => {
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "115", low: "85", close: "112" }, // entry, then both
      { open: "112", high: "113", low: "111", close: "112" },
    ];

    const { trades } = run(bothLevels, rows);

    expect(trades[0].exitReason).toBe("STOP_LOSS");
    expect(trades[0].entryDate).toBe(trades[0].exitDate);
  });

  it("is not sensitive to which level sits nearer the open", () => {
    // Same ambiguity, target much closer to the open than the stop. If the
    // resolution were distance-based or first-match-wins, this would flip.
    const rows: OhlcRow[] = [
      { open: "100", high: "101", low: "99", close: "90" },
      { open: "100", high: "104", low: "99", close: "103" },
      { open: "103", high: "160", low: "89.9", close: "150" },
      { open: "150", high: "151", low: "149", close: "150" },
    ];

    const { trades } = run(bothLevels, rows);

    expect(trades[0].exitReason).toBe("STOP_LOSS");
  });

  it("records the fill model it used", () => {
    // A run whose numbers depend on this assumption has to say so, or a reader
    // cannot tell two runs apart (CLAUDE.md 7.6).
    const methodology = buildMethodology({
      source: fixtureSource({ series: {} }).metadata,
      costModel: FREE,
      warmUpBars: 0,
    });

    expect(methodology.execution.fillModel).toBe("STOP_FIRST_WHEN_AMBIGUOUS");
    expect(methodology.execution.intrabar).toMatch(/STOP filled first/);
  });
});

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
        definition: {
          ...starterDefinition(),
          universe: { instruments: ["NSE:TEST"], minAvgTurnoverPaise: null },
        },
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
      definition: {
          ...starterDefinition(),
          universe: { instruments: ["NSE:TEST"], minAvgTurnoverPaise: null },
        },
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

describe("the fuller metric set (W5-07)", () => {
  /**
   * `CLAUDE.md` §8.12 and the primer's Part 11. Return and hit rate describe
   * how a strategy did; these describe whether it can be relied on to do it
   * again, which is a different question and the one the adversarial suite
   * (W18) is built to interrogate.
   */
  const trending = (): OhlcRow[] => {
    const rows: OhlcRow[] = [];
    for (let i = 0; i < 60; i++) {
      const base = 100 + ((i * 5) % 17) - ((i * 2) % 7);
      const close = base + ((i % 4) - 1);
      rows.push({
        open: base.toFixed(2),
        high: (Math.max(base, close) + 3).toFixed(2),
        low: (Math.min(base, close) - 3).toFixed(2),
        close: close.toFixed(2),
      });
    }
    return rows;
  };

  const withLevels = { ...priceRules(103, 999), targetPercent: 5, stopLossPercent: 3 };

  it("expresses each trade in units of what it risked", () => {
    const { trades, metrics } = run(withLevels, trending());

    expect(trades.length).toBeGreaterThan(3);
    expect(metrics.rMultiples).toHaveLength(trades.length);
    // Ascending, because the distribution is the point — the shape of the tail
    // is what a mean hides.
    expect([...metrics.rMultiples].sort((a, b) => a - b)).toEqual(metrics.rMultiples);

    // R is net result over risk taken, and risk is qty x (entry - stop).
    const first = trades[0];
    expect(first.riskPaise).toBeGreaterThan(0);
    expect(metrics.rMultiples).toContain(first.netPnlPaise / first.riskPaise);
  });

  it("reports gross and net together, never one alone (§8.3)", () => {
    const { metrics } = run(withLevels, trending(), { costModel: nseEquityDelivery({ brokerage: { type: "PERCENT", value: 0.03, capPaise: 2_000_00 }, slippagePercent: 0.05 }) });

    // The pair is the disclosure. Charges are real, so the two must differ and
    // gross must be the larger — that gap is what §8.3 exists to make visible.
    expect(metrics.totalCostsPaise).toBeGreaterThan(0);
    expect(metrics.grossReturnPercent).toBeGreaterThan(metrics.netReturnPercent);
    expect(metrics.costDragPercent).not.toBeNull();
  });

  it("counts the longest run of consecutive losses", () => {
    expect(longestLosingStreakOf([])).toBe(0);

    const trade = (netPnlPaise: number) => ({ netPnlPaise }) as never;
    expect(longestLosingStreakOf([trade(-1), trade(-1), trade(5), trade(-1)])).toBe(2);

    // A breakeven trade neither extends a streak nor breaks it — it is not a loss.
    expect(longestLosingStreakOf([trade(-1), trade(0), trade(-1)])).toBe(2);
  });

  it("reports absence of evidence as null, not as a good number", () => {
    // A strategy that never fires: no losing trade, no drawdown, no dispersion.
    const flat: OhlcRow[] = Array.from({ length: 20 }, () => ({
      open: "100", high: "100.5", low: "99.5", close: "100",
    }));
    const { metrics } = run({ ...priceRules(1, 999), targetPercent: 5 }, flat);

    expect(metrics.tradeCount).toBe(0);
    // Each of these would be tempting to report as 0, and each would read as
    // "measured, and it was fine" rather than "there was nothing to measure".
    expect(metrics.profitFactor).toBeNull();
    expect(metrics.expectancyR).toBeNull();
    expect(metrics.calmar).toBeNull();
    expect(metrics.sortino).toBeNull();
    expect(metrics.topTradeSharePercent).toBeNull();
  });

  it("marks a small sample inadequate (§8.12)", () => {
    const { metrics } = run(withLevels, trending());

    // The most misleading artefact this engine can produce is a short backtest
    // with a flattering hit rate, and it looks exactly like a good one.
    expect(metrics.tradeCount).toBeLessThan(ADEQUATE_TRADE_COUNT);
    expect(metrics.sampleAdequate).toBe(false);
  });

  it("does not divide by a drawdown that never happened", () => {
    expect(calmarOf(10_000_000, 12_000_000, 252, 0)).toBeNull();
    // And computes an ordinary one: +20% over exactly a year against a 10% fall.
    expect(calmarOf(10_000_000, 12_000_000, 252, 10)).toBeCloseTo(2, 5);
  });

  it("ignores upside dispersion when measuring downside risk", () => {
    // Two curves, same mean drift; one has a violent up-session, the other is
    // smooth. Sharpe punishes the first for its good day. Sortino must not.
    const curve = (values: number[]) =>
      values.map((equityPaise, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}` as never, equityPaise }));

    const smooth = curve([100, 101, 102, 103, 104, 105]);
    const spiky = curve([100, 99, 98, 97, 96, 130]);

    expect(sortinoOf(smooth)).toBeNull(); // no losing session to measure
    expect(sortinoOf(spiky)).not.toBeNull();
    expect(sharpeOf(spiky)).not.toBeNull();
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
