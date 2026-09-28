import { describe, expect, it } from "vitest";

import { runBacktest, type BacktestInput } from "./backtest";
import { ZERO_BROKERAGE, type CostModel } from "./costs";
import type { MarketEvent } from "./events";
import { ohlcBars, type OhlcRow } from "./market-data-fixture";
import { starterDefinition, type EventRules, type StrategyDefinitionV2 } from "./strategy";
import { WEEKENDS_ONLY } from "./session";

/**
 * The §7.4 event primitives, at the engine seam. `events.test.ts` proves the
 * predicates in isolation; this proves that a definition carrying event rules
 * actually opens, closes and sizes differently — and that a definition with no
 * rules is untouched, which is what let 461 existing tests stay green.
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

const withRules = (rules: Partial<EventRules>): StrategyDefinitionV2 => ({
  ...starterDefinition(),
  universe: { instruments: ["NSE:TEST"], minAvgTurnoverPaise: null },
  entry: { left: { kind: "PRICE" }, comparator: "BELOW", right: { kind: "CONSTANT", value: 95 } },
  exit: { left: { kind: "PRICE" }, comparator: "ABOVE", right: { kind: "CONSTANT", value: 110 } },
  stopLossPercent: 10,
  sizing: { kind: "CAPITAL_PERCENT" as const, percent: 100 },
  initialCapitalPaise: 10_000_000,
  eventRules: {
    skipEntriesWithin: null,
    flattenBefore: null,
    noNewPositionsOnExpiryDay: false,
    sizeMultiplierDuring: null,
    ...rules,
  },
});

const run = (definition: StrategyDefinitionV2, rows: OhlcRow[], overrides: Partial<BacktestInput> = {}) =>
  runBacktest({
    definition,
    series: { "NSE:TEST": ohlcBars({ from: "2026-01-05", rows }) },
    costModel: FREE,
    calendar: WEEKENDS_ONLY,
    ...overrides,
  });

// Mon 05 → an entry signal (close 90 < 95) that fills Tue 06 at its open.
const ENTRY_THEN_HOLD: OhlcRow[] = [
  { open: "100", high: "101", low: "99", close: "90" }, // 01-05 Mon  entry signal
  { open: "95", high: "105", low: "94", close: "104" }, // 01-06 Tue  fill at 95
  { open: "104", high: "106", low: "103", close: "105" }, // 01-07 Wed
  { open: "105", high: "107", low: "104", close: "106" }, // 01-08 Thu
  { open: "106", high: "108", low: "105", close: "107" }, // 01-09 Fri
];

describe("skip_entries_within", () => {
  it("suppresses an entry whose signal falls inside the window", () => {
    // Earnings Wed 07; a 5-session window covers Mon 05, so the signal is barred.
    const events: MarketEvent[] = [
      { eventType: "EARNINGS", symbol: "NSE:TEST", eventDate: "2026-01-07", knownOn: "2026-01-01", confirmed: true },
    ];
    const { trades } = run(
      withRules({ skipEntriesWithin: { daysBefore: 5, types: ["EARNINGS"] } }),
      ENTRY_THEN_HOLD,
      { events },
    );
    expect(trades).toHaveLength(0);
  });

  it("lets the same entry through once the event is out of the window", () => {
    // Earnings far in the future — the Mon 05 signal is nowhere near it.
    const events: MarketEvent[] = [
      { eventType: "EARNINGS", symbol: "NSE:TEST", eventDate: "2026-03-01", knownOn: "2026-01-01", confirmed: true },
    ];
    const { trades } = run(
      withRules({ skipEntriesWithin: { daysBefore: 5, types: ["EARNINGS"] } }),
      ENTRY_THEN_HOLD,
      { events },
    );
    // The position opens (fills at 95) and is closed out at the final session.
    expect(trades).toHaveLength(1);
    expect(trades[0].entryPrice).toBe(950_000); // 95 in ticks
  });

  it("ignores an event the signal session could not know about (lookahead guard)", () => {
    // Earnings Wed 07, but only announced Wed 07 — on Mon 05 it was not public,
    // so the entry must NOT be suppressed.
    const events: MarketEvent[] = [
      { eventType: "EARNINGS", symbol: "NSE:TEST", eventDate: "2026-01-07", knownOn: "2026-01-07", confirmed: true },
    ];
    const { trades } = run(
      withRules({ skipEntriesWithin: { daysBefore: 5, types: ["EARNINGS"] } }),
      ENTRY_THEN_HOLD,
      { events },
    );
    expect(trades).toHaveLength(1);
  });
});

describe("flatten_positions_before", () => {
  it("closes an open position at the close of the session before the event", () => {
    // Enter 95 on Tue 06; earnings Thu 08 → flat by Wed 07's close.
    const events: MarketEvent[] = [
      { eventType: "EARNINGS", symbol: "NSE:TEST", eventDate: "2026-01-08", knownOn: "2026-01-01", confirmed: true },
    ];
    const { trades } = run(
      withRules({ flattenBefore: { types: ["EARNINGS"] } }),
      ENTRY_THEN_HOLD,
      { events },
    );
    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe("EVENT_FLATTEN");
    expect(trades[0].exitDate).toBe("2026-01-07");
    expect(trades[0].exitPrice).toBe(1_050_000); // Wed 07 close, 105
  });
});

describe("size_multiplier_during", () => {
  it("scales the entry notional down inside the window", () => {
    const events: MarketEvent[] = [
      { eventType: "EARNINGS", symbol: "NSE:TEST", eventDate: "2026-01-07", knownOn: "2026-01-01", confirmed: true },
    ];
    const full = run(withRules({}), ENTRY_THEN_HOLD, { events });
    const scaled = run(
      withRules({ sizeMultiplierDuring: { daysBefore: 5, types: ["EARNINGS"], multiplier: 0.5 } }),
      ENTRY_THEN_HOLD,
      { events },
    );
    expect(full.trades).toHaveLength(1);
    expect(scaled.trades).toHaveLength(1);
    // Half the notional at the same price is (about) half the quantity.
    expect(scaled.trades[0].qty).toBeLessThan(full.trades[0].qty);
    expect(scaled.trades[0].qty).toBeLessThanOrEqual(Math.ceil(full.trades[0].qty / 2));
  });
});

describe("no rules declared", () => {
  it("is byte-for-byte the unmodified engine", () => {
    const plain: StrategyDefinitionV2 = { ...withRules({}), eventRules: null };
    const events: MarketEvent[] = [
      { eventType: "EARNINGS", symbol: "NSE:TEST", eventDate: "2026-01-07", knownOn: "2026-01-01", confirmed: true },
    ];
    // Events supplied but no rules to read them: the run must ignore them.
    const withEvents = run(plain, ENTRY_THEN_HOLD, { events });
    const withoutEvents = run(plain, ENTRY_THEN_HOLD);
    expect(withEvents.trades).toEqual(withoutEvents.trades);
    expect(withEvents.metrics.netReturnPercent).toBe(withoutEvents.metrics.netReturnPercent);
  });
});
