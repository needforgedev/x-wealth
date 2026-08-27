import { describe, expect, it } from "vitest";

import { runBacktest } from "./backtest";
import { nseEquityDelivery, ZERO_BROKERAGE } from "./costs";
import { ohlcBars, type OhlcRow } from "./market-data-fixture";
import { positionValue } from "./money";
import {
  resolveDefinition,
  upgradeToV2,
  validateStrategyDefinition,
  type StrategyDefinitionV1,
  type StrategyDefinitionV2,
} from "./strategy";

/**
 * The exact definition frozen inside the RUNNING forward test on the live
 * database, copied verbatim from `strategy_versions`.
 *
 * This is not a representative example — it is *the* row. Its parameters are
 * frozen by a database trigger and its ledger is append-only, so if a change to
 * the definition types alters how it replays, the nightly job writes a
 * different history than the one already recorded, and nothing can correct it.
 */
const FROZEN_V1: StrategyDefinitionV1 = {
  version: 1,
  instruments: ["NSE:RELIANCE"],
  timeframe: "1d",
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
  stopLossPercent: 5,
  positionSizePercent: 25,
  initialCapitalPaise: 10_000_000,
};

describe("a V1 definition keeps its meaning", () => {
  it("still validates", () => {
    expect(validateStrategyDefinition(FROZEN_V1)).toEqual([]);
  });

  it("resolves to the behaviour it had before V2 existed", () => {
    const r = resolveDefinition(FROZEN_V1);

    // Sizing was a flat slice of cash, with the stop playing no part.
    expect(r.sizing).toEqual({ kind: "CAPITAL_PERCENT", percent: 25 });

    // V1 had no portfolio controls. These resolve to values that cannot bind:
    // one position per instrument is all it could hold, and cash on hand was
    // always the real exposure limit.
    expect(r.maxConcurrentPositions).toBe(1);
    expect(r.maxExposurePercent).toBe(100);

    // Nothing V2 added may switch itself on for a V1 row.
    expect(r.targetPercent).toBeNull();
    expect(r.minAvgTurnoverPaise).toBeNull();
    expect(r.direction).toBe("LONG");
  });
});

/** Prices that cross a constant, so entries are driven by close alone. */
const rows: OhlcRow[] = [
  { open: "100", high: "101", low: "99", close: "100" },
  { open: "100", high: "101", low: "94", close: "95" }, // entry signal: close below 96
  { open: "95", high: "96", low: "94", close: "95" }, // filled at this open
  { open: "95", high: "120", low: "94", close: "118" }, // exit signal: close above 110
  { open: "118", high: "121", low: "117", close: "120" }, // exit filled here
];

const priceRuleV1 = (over: Partial<StrategyDefinitionV1> = {}): StrategyDefinitionV1 => ({
  ...FROZEN_V1,
  instruments: ["NSE:TEST"],
  entry: { left: { kind: "PRICE" }, comparator: "BELOW", right: { kind: "CONSTANT", value: 96 } },
  exit: { left: { kind: "PRICE" }, comparator: "ABOVE", right: { kind: "CONSTANT", value: 110 } },
  stopLossPercent: 10,
  positionSizePercent: 100,
  ...over,
});

const FREE = nseEquityDelivery({ brokerage: ZERO_BROKERAGE, slippagePercent: 0 });

const run = (definition: StrategyDefinitionV1 | StrategyDefinitionV2) =>
  runBacktest({
    definition,
    series: { "NSE:TEST": ohlcBars({ from: "2026-01-05", rows }) },
    costModel: FREE,
  });

describe("upgrading a V1 definition changes nothing until the author changes something", () => {
  it("produces identical trades to its V1 parent", () => {
    const v1 = priceRuleV1();
    const v2 = upgradeToV2(v1);

    expect(run(v2).trades).toEqual(run(v1).trades);
    expect(run(v2).metrics).toEqual(run(v1).metrics);
  });

  it("carries every resolved field across unchanged", () => {
    expect(resolveDefinition(upgradeToV2(FROZEN_V1))).toEqual(resolveDefinition(FROZEN_V1));
  });

  it("is a no-op on something already V2", () => {
    const v2 = upgradeToV2(FROZEN_V1);
    expect(upgradeToV2(v2)).toBe(v2);
  });
});

describe("risk-based sizing derives the quantity from the stop", () => {
  const withSizing = (riskPercent: number, stopLossPercent: number): StrategyDefinitionV2 => ({
    ...upgradeToV2(priceRuleV1({ stopLossPercent })),
    sizing: { kind: "RISK_PERCENT", riskPercent },
  });

  it("risks approximately the stated percentage of capital", () => {
    // ₹1,00,000 capital, 1% risk = ₹1,000 at risk. Entry ~₹95 with a 10% stop
    // puts ₹9.50 at risk per unit, so ~105 units.
    const [trade] = run(withSizing(1, 10)).trades;
    expect(trade).toBeDefined();

    // Everything in paise. `entryPrice` is in ticks (rupees × 10,000) and cash
    // is in paise (rupees × 100) — conflating them is a 100× sizing error, so
    // the crossing goes through positionValue, exactly as the engine does it.
    const riskPerUnitPaise = (positionValue(trade.entryPrice, 1) * 10) / 100;
    const riskedPaise = trade.qty * riskPerUnitPaise;

    // ₹1,000 = 100,000 paise, within one unit — quantity is a whole number.
    expect(Math.abs(riskedPaise - 100_000)).toBeLessThan(riskPerUnitPaise);
  });

  it("buys more units on a tighter stop, for the same rupee risk", () => {
    const tight = run(withSizing(1, 5)).trades[0];
    const wide = run(withSizing(1, 20)).trades[0];

    // Halving-and-quartering the stop distance should scale quantity inversely:
    // this is the relationship the whole sizing rule exists to express.
    expect(tight.qty).toBeGreaterThan(wide.qty);
    expect(tight.qty / wide.qty).toBeCloseTo(4, 0);
  });

  it("is not the same thing as committing that percentage of capital", () => {
    // The trap this wording guards against: 1% risked and 1% committed differ
    // by roughly the stop distance — here 10×.
    const risked = run(withSizing(1, 10)).trades[0];
    const committed = run({
      ...upgradeToV2(priceRuleV1({ stopLossPercent: 10 })),
      sizing: { kind: "CAPITAL_PERCENT", percent: 1 },
    }).trades[0];

    expect(risked.qty).toBeGreaterThan(committed.qty * 5);
  });
});
