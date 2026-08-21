import { describe, expect, it } from "vitest";

import { runBacktest } from "./backtest";
import { ZERO_BROKERAGE, chargesForLeg, nseEquityDelivery } from "./costs";
import { ohlcBars, type OhlcRow } from "./market-data-fixture";
import { positionValue, priceFromString, type PriceTicks } from "./money";
import { starterDefinition, type StrategyDefinition } from "./strategy";

/**
 * **Gate G4** — `plan.md` W5-08: *"hand-calculate 20 trades and assert the
 * engine matches to the paisa."*
 *
 * `execution-plan.md` calls the backtest engine the highest technical risk in
 * the project, because *"a subtly wrong backtest engine produces plausible
 * numbers that are silently false, and everything downstream inherits the
 * error."* This file is the answer to that. It is not a smoke test.
 *
 * ## Why a synthetic series
 *
 * You cannot hand-calculate against five years of NSE ticks. A designed price
 * path where every fill price is known in advance is the only instrument that
 * makes the gate passable — which is what `market-data-fixture.ts` exists for.
 *
 * ## What is being reconciled, and what is not
 *
 * The composition of an Indian charge — STT on both delivery legs, stamp duty
 * buy-side only, GST on services rather than turnover — is `costs.test.ts`'s
 * job and is thoroughly covered there. What is checked here is everything the
 * *engine* decides: which bar fills, at what price, in what quantity, what cash
 * remains, and whether the reported P&L is the arithmetic consequence of those.
 *
 * Two independent checks, deliberately:
 *
 * 1. One trade worked out entirely by hand, with the arithmetic written out
 *    below and asserted as literals. If the engine and the hand agree here,
 *    the wiring is right at least once.
 * 2. All twenty replayed by a second, deliberately naive simulator that shares
 *    no code with the engine's execution loop. Two implementations agreeing on
 *    twenty compounding trades is a much stronger statement than either alone.
 */

/**
 * Zero brokerage keeps the hand arithmetic legible; every statutory charge is
 * live. Slippage is zero so a fill price is exactly the price on the bar —
 * slippage is a stated assumption, and it belongs in a test about assumptions
 * rather than one about wiring.
 */
const MODEL = nseEquityDelivery({ brokerage: ZERO_BROKERAGE, slippagePercent: 0 });

const CAPITAL_PAISE = 10_000_000; // ₹1,00,000

/**
 * Buy under ₹100, sell over ₹110, 5% stop.
 *
 * Price and constants only — no indicator, so there is no warm-up between the
 * first bar and the first signal and every date in the fixture is accounted for.
 */
const RULES: StrategyDefinition = {
  ...starterDefinition(),
  instruments: ["NSE:TEST"],
  entry: { left: { kind: "PRICE" }, comparator: "BELOW", right: { kind: "CONSTANT", value: 100 } },
  exit: { left: { kind: "PRICE" }, comparator: "ABOVE", right: { kind: "CONSTANT", value: 110 } },
  stopLossPercent: 5,
  positionSizePercent: 100,
  initialCapitalPaise: CAPITAL_PAISE,
};

/**
 * A cycle that ends in a signalled exit.
 *
 * Bar A closes at 95 → entry signal. Bar B opens at 100 → the fill; its low of
 * 96 stays above the ₹95 stop. Bar C closes at 115 → exit signal. Bar D opens
 * at 114 → the exit fill.
 */
const WINNER: OhlcRow[] = [
  { open: "98", high: "99", low: "94", close: "95" },
  { open: "100", high: "106", low: "96", close: "105" },
  { open: "106", high: "116", low: "105", close: "115" },
  { open: "114", high: "115", low: "104", close: "105" },
];

/**
 * A cycle that ends on the stop.
 *
 * Same entry, but bar B's low of 90 trades through the ₹95 stop, so the exit is
 * the stop price on the entry bar itself. Bars C and D are quiet so the next
 * cycle starts clean.
 */
const LOSER: OhlcRow[] = [
  { open: "98", high: "99", low: "94", close: "95" },
  { open: "100", high: "101", low: "90", close: "105" },
  { open: "105", high: "106", low: "104", close: "105" },
  { open: "105", high: "106", low: "104", close: "105" },
];

/** Ten of each, alternating — twenty round trips in eighty sessions. */
const ROWS: OhlcRow[] = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? WINNER : LOSER)).flat();

const outcome = () =>
  runBacktest({
    definition: RULES,
    series: { "NSE:TEST": ohlcBars({ from: "2026-01-05", rows: ROWS }) },
    costModel: MODEL,
  });

describe("G4 — the first trade, worked out by hand", () => {
  /**
   * Entry ₹100.00, capital ₹1,00,000, 100% position size.
   *
   *   a unit costs positionValue(₹100, 1)          = 10,000 paise
   *   first guess  floor(10,000,000 / 10,000)      = 1,000 units
   *
   *   1,000 units is ₹1,00,000 of stock and leaves nothing for the charges, so
   *   it does not fit. Charges on a ₹1,00,000 buy come to 11,862 paise, which
   *   is 2 units' worth, so the engine steps down to 998.
   *
   *   998 units → turnover positionValue(₹100, 998) = 9,980,000 paise
   *     STT        0.1%     of 9,980,000            =  9,980
   *     stamp duty 0.015%   of 9,980,000            =  1,497   (buy side only)
   *     exchange   0.00297% of 9,980,000            =    296   (296.406, rounded)
   *     SEBI       0.0001%  of 9,980,000            =     10   (9.98, rounded)
   *     GST        18% of (0 + 296 + 10 = 306)      =     55   (55.08, rounded)
   *                                            buy  = 11,838
   *   outlay = 9,980,000 + 11,838 = 9,991,838, which fits in 10,000,000.
   */
  it("sizes the position to what the cash can actually fund", () => {
    const { trades } = outcome();
    expect(trades[0].qty).toBe(998);
    expect(trades[0].entryPrice).toBe(priceFromString("100"));
    expect(trades[0].exitPrice).toBe(priceFromString("114"));
    expect(trades[0].exitReason).toBe("SIGNAL");
  });

  /**
   *   exit ₹114.00 → positionValue(₹114, 998)       = 11,377,200 paise
   *   gross = 11,377,200 − 9,980,000                =  1,397,200
   *
   *   sell leg on 11,377,200:
   *     STT        0.1%     → 11,377   (11,377.2, rounded)
   *     stamp duty          →      0   (buy side only)
   *     exchange   0.00297% →    338   (337.90, rounded)
   *     SEBI       0.0001%  →     11   (11.38, rounded)
   *     GST        18% of (0 + 338 + 11 = 349) → 63   (62.82, rounded)
   *                                    sell   = 11,789
   *
   *   costs = 11,838 + 11,789 = 23,627
   *   net   = 1,397,200 − 23,627 = 1,373,573 paise = ₹13,735.73
   */
  it("matches the hand-calculated P&L to the paisa", () => {
    const trade = outcome().trades[0];

    expect(trade.grossPnlPaise).toBe(1_397_200);
    expect(trade.costs.totalPaise).toBe(23_627);
    expect(trade.netPnlPaise).toBe(1_373_573);

    // And the line items, so a disagreement says which charge moved.
    expect(trade.costs.sttPaise).toBe(9_980 + 11_377);
    expect(trade.costs.stampDutyPaise).toBe(1_497);
    expect(trade.costs.exchangeTransactionPaise).toBe(296 + 338);
    expect(trade.costs.sebiTurnoverPaise).toBe(10 + 11);
    expect(trade.costs.gstPaise).toBe(55 + 63);
    expect(trade.costs.brokeragePaise).toBe(0);
  });

  /**
   * Cash, followed all the way through:
   *
   *   start                                        10,000,000
   *   − outlay on the buy                          − 9,991,838  →      8,162
   *   + sale proceeds (11,377,200 − 11,789 sell)   +11,365,411  → 11,373,573
   *
   * which is the starting capital plus the net P&L, exactly. If the engine ever
   * charged the buy leg twice — an easy mistake, since `accountForTrade`
   * reports both legs — this identity is what breaks.
   */
  it("leaves cash equal to capital plus net, with no charge counted twice", () => {
    const { trades, equityCurve } = outcome();

    // The second cycle's entry has not happened yet at this point in the walk,
    // so equity right after the first exit is cash and nothing else.
    const afterFirstExit = CAPITAL_PAISE + trades[0].netPnlPaise;
    expect(afterFirstExit).toBe(11_373_573);

    const finalEquity = equityCurve.at(-1)!.equityPaise;
    const sumOfNet = trades.reduce((total, t) => total + t.netPnlPaise, 0);
    expect(finalEquity).toBe(CAPITAL_PAISE + sumOfNet);
  });
});

/**
 * The second implementation.
 *
 * Deliberately dumb: it walks the twenty designed round trips in order and does
 * the same arithmetic the long way, sharing nothing with the engine's execution
 * loop. It knows the fill prices because the fixture was designed around them —
 * that is the whole point of a synthetic series.
 */
function replayIndependently(): Array<{ qty: number; grossPaise: number; netPaise: number }> {
  const buy = priceFromString("100");
  const sellWin = priceFromString("114");
  const sellStop = priceFromString("95"); // 5% below the ₹100 entry
  const unitValue = positionValue(buy, 1);

  const charges = (price: PriceTicks, qty: number, side: "BUY" | "SELL") =>
    chargesForLeg(MODEL, { side, price, qty }).totalPaise;

  let cash = CAPITAL_PAISE;
  const out: Array<{ qty: number; grossPaise: number; netPaise: number }> = [];

  for (let cycle = 0; cycle < 20; cycle++) {
    const exit = cycle % 2 === 0 ? sellWin : sellStop;

    // Largest whole quantity whose stock value plus buy charges fits the cash.
    let qty = Math.floor(cash / unitValue);
    while (qty > 0 && positionValue(buy, qty) + charges(buy, qty, "BUY") > cash) qty--;
    if (qty === 0) break;

    const entryValue = positionValue(buy, qty);
    const exitValue = positionValue(exit, qty);
    const buyCharges = charges(buy, qty, "BUY");
    const sellCharges = charges(exit, qty, "SELL");

    cash = cash - entryValue - buyCharges + exitValue - sellCharges;

    out.push({
      qty,
      grossPaise: exitValue - entryValue,
      netPaise: exitValue - entryValue - buyCharges - sellCharges,
    });
  }

  return out;
}

describe("G4 — twenty trades, two independent implementations", () => {
  it("produces exactly twenty round trips, alternating signal and stop exits", () => {
    const { trades } = outcome();

    expect(trades).toHaveLength(20);
    expect(trades.filter((t) => t.exitReason === "SIGNAL")).toHaveLength(10);
    expect(trades.filter((t) => t.exitReason === "STOP_LOSS")).toHaveLength(10);
    expect(trades.every((t) => t.entryPrice === priceFromString("100"))).toBe(true);
  });

  it("agrees with an independent replay on every quantity, gross and net", () => {
    const engine = outcome().trades;
    const byHand = replayIndependently();

    expect(byHand).toHaveLength(20);

    for (let i = 0; i < 20; i++) {
      // Quantities compound: each cycle sizes off the cash the previous one
      // left, so agreeing on all twenty means agreeing on the whole chain.
      expect(engine[i].qty, `trade ${i + 1} quantity`).toBe(byHand[i].qty);
      expect(engine[i].grossPnlPaise, `trade ${i + 1} gross`).toBe(byHand[i].grossPaise);
      expect(engine[i].netPnlPaise, `trade ${i + 1} net`).toBe(byHand[i].netPaise);
    }
  });

  it("closes with the same equity by either route", () => {
    const { equityCurve } = outcome();
    const byHand = replayIndependently();

    const expected = CAPITAL_PAISE + byHand.reduce((total, t) => total + t.netPaise, 0);
    expect(equityCurve.at(-1)!.equityPaise).toBe(expected);
  });

  it("keeps net below gross on every single trade", () => {
    // §5.3: costs are structural. There is no flag that turns this off, and no
    // trade anywhere in the run escapes them.
    for (const trade of outcome().trades) {
      expect(trade.netPnlPaise).toBe(trade.grossPnlPaise - trade.costs.totalPaise);
      expect(trade.netPnlPaise).toBeLessThan(trade.grossPnlPaise);
    }
  });

  it("reports a hit rate that matches the trades it recorded", () => {
    const { trades, metrics } = outcome();
    const winners = trades.filter((t) => t.netPnlPaise > 0).length;

    expect(metrics.tradeCount).toBe(20);
    expect(metrics.hitRatePercent).toBeCloseTo((winners / 20) * 100, 10);
  });
});
