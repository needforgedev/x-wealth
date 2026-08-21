import { describe, expect, it } from "vitest";

import {
  CostError,
  ZERO_BROKERAGE,
  accountForTrade,
  addBreakdowns,
  chargesForLeg,
  nseEquityDelivery,
  nseEquityIntraday,
  type CostModel,
  type CostsBreakdown,
} from "./costs";
import { priceFromString } from "./money";

/**
 * The worked example below is calculated by hand and the arithmetic is written
 * out. `execution-plan.md` calls a subtly wrong cost model the highest
 * technical risk in the project — "plausible numbers that are silently false"
 * — and the only defence is expectations a person derived independently.
 *
 *   100 shares of a ₹1,000 stock, sold at ₹1,100, taken to delivery.
 *   Brokerage 0.03% capped at ₹20. Slippage assumption 0.05%.
 *
 *   Buy turnover  = ₹1,00,000 = 10,000,000 paise
 *   Sell turnover = ₹1,10,000 = 11,000,000 paise
 */

const MODEL = nseEquityDelivery({
  brokerage: { type: "PERCENT", value: 0.03, capPaise: 2_000 },
  slippagePercent: 0.05,
});

const BUY = { side: "BUY" as const, price: priceFromString("1000"), qty: 100 };
const SELL = { side: "SELL" as const, price: priceFromString("1100"), qty: 100 };

function sumOfComponents(costs: CostsBreakdown): number {
  return (
    costs.brokeragePaise +
    costs.sttPaise +
    costs.stampDutyPaise +
    costs.exchangeTransactionPaise +
    costs.sebiTurnoverPaise +
    costs.gstPaise +
    costs.slippagePaise
  );
}

describe("a delivery buy leg", () => {
  const costs = chargesForLeg(MODEL, BUY);

  it("caps brokerage", () => {
    // 0.03% of 10,000,000 = 3,000 paise (₹30), capped at ₹20.
    expect(costs.brokeragePaise).toBe(2_000);
  });

  it("charges STT on the buy, because delivery is levied on both legs", () => {
    // 0.1% of 10,000,000 = 10,000 paise = ₹100
    expect(costs.sttPaise).toBe(10_000);
  });

  it("charges stamp duty, which is buy-side only", () => {
    // 0.015% of 10,000,000 = 1,500 paise = ₹15
    expect(costs.stampDutyPaise).toBe(1_500);
  });

  it("charges the exchange transaction fee", () => {
    // 0.00297% of 10,000,000 = 297 paise = ₹2.97
    expect(costs.exchangeTransactionPaise).toBe(297);
  });

  it("charges the SEBI turnover fee, ₹10 per crore", () => {
    // 0.0001% of 10,000,000 = 10 paise. ₹1,00,000 is a hundredth of a crore.
    expect(costs.sebiTurnoverPaise).toBe(10);
  });

  it("charges GST on the services billed, not on turnover", () => {
    // 18% of (2,000 + 297 + 10) = 18% of 2,307 = 415.26 → 415 paise.
    //
    // The mistake this guards against: 18% of the 10,000,000 turnover would be
    // ₹18,000 on a ₹1,00,000 trade.
    expect(costs.gstPaise).toBe(415);
  });

  it("charges the stated slippage assumption", () => {
    // 0.05% of 10,000,000 = 5,000 paise = ₹50
    expect(costs.slippagePaise).toBe(5_000);
  });

  it("totals to the sum of its own parts", () => {
    // 2,000 + 10,000 + 1,500 + 297 + 10 + 415 + 5,000 = 19,222 paise = ₹192.22
    expect(costs.totalPaise).toBe(19_222);
    expect(sumOfComponents(costs)).toBe(costs.totalPaise);
  });
});

describe("a delivery sell leg", () => {
  const costs = chargesForLeg(MODEL, SELL);

  it("charges no stamp duty", () => {
    expect(costs.stampDutyPaise).toBe(0);
  });

  it("still charges STT", () => {
    // 0.1% of 11,000,000 = 11,000 paise = ₹110
    expect(costs.sttPaise).toBe(11_000);
  });

  it("totals correctly on the larger turnover", () => {
    // brokerage 3,300 → capped 2,000
    // exchange  0.00297% of 11,000,000 = 326.7  → 327
    // sebi      0.0001%  of 11,000,000 = 11
    // gst       18% of (2,000 + 327 + 11) = 18% of 2,338 = 420.84 → 421
    // slippage  0.05% of 11,000,000 = 5,500
    // total     2,000 + 11,000 + 0 + 327 + 11 + 421 + 5,500 = 19,259
    expect(costs.exchangeTransactionPaise).toBe(327);
    expect(costs.gstPaise).toBe(421);
    expect(costs.totalPaise).toBe(19_259);
    expect(sumOfComponents(costs)).toBe(costs.totalPaise);
  });
});

describe("intraday differs from delivery in ways that matter", () => {
  const intraday = nseEquityIntraday({ brokerage: ZERO_BROKERAGE, slippagePercent: 0 });

  it("charges no STT on the buy", () => {
    expect(chargesForLeg(intraday, BUY).sttPaise).toBe(0);
  });

  it("charges STT on the sell, at a quarter of the delivery rate", () => {
    // 0.025% of 11,000,000 = 2,750 paise, against 11,000 for delivery.
    expect(chargesForLeg(intraday, SELL).sttPaise).toBe(2_750);
    expect(chargesForLeg(MODEL, SELL).sttPaise).toBe(11_000);
  });

  it("charges a fifth of the stamp duty, still on the buy only", () => {
    // 0.003% of 10,000,000 = 300 paise, against 1,500 for delivery.
    expect(chargesForLeg(intraday, BUY).stampDutyPaise).toBe(300);
    expect(chargesForLeg(intraday, SELL).stampDutyPaise).toBe(0);
  });
});

describe("a round trip", () => {
  const result = accountForTrade(MODEL, BUY, SELL);

  it("computes gross P&L from the price move", () => {
    // (₹1,100 − ₹1,000) × 100 = ₹10,000 = 1,000,000 paise
    expect(result.grossPnlPaise).toBe(1_000_000);
  });

  it("sums both legs' charges", () => {
    // 19,222 + 19,259 = 38,481 paise = ₹384.81
    expect(result.costs.totalPaise).toBe(38_481);
    expect(sumOfComponents(result.costs)).toBe(result.costs.totalPaise);
  });

  it("nets one from the other", () => {
    // 1,000,000 − 38,481 = 961,519 paise = ₹9,615.19
    expect(result.netPnlPaise).toBe(961_519);
  });

  it("never yields a gross figure without its costs attached", () => {
    // §5.3: "no code path that produces a gross-return figure". The API makes
    // that structural — gross only ever arrives inside an object that also
    // carries the costs and the net.
    expect(result).toHaveProperty("costs");
    expect(result).toHaveProperty("netPnlPaise");
  });

  it("handles a short, where the gain is the fall", () => {
    const short = accountForTrade(
      MODEL,
      { side: "SELL", price: priceFromString("1100"), qty: 100 },
      { side: "BUY", price: priceFromString("1000"), qty: 100 },
    );
    // Same two legs, opposite order: the same ₹10,000 gross, and the same
    // charges, because each leg is charged by its own side.
    expect(short.grossPnlPaise).toBe(1_000_000);
    expect(short.costs.totalPaise).toBe(38_481);
  });

  it("makes a losing trade lose more than the price move", () => {
    const losing = accountForTrade(MODEL, BUY, {
      side: "SELL",
      price: priceFromString("990"),
      qty: 100,
    });
    expect(losing.grossPnlPaise).toBe(-100_000); // −₹1,000
    expect(losing.netPnlPaise).toBeLessThan(losing.grossPnlPaise);
  });

  it("can turn a small gross gain into a net loss", () => {
    // The reason costs are structural rather than optional: a ₹1 move on this
    // size does not survive the charges.
    const marginal = accountForTrade(MODEL, BUY, {
      side: "SELL",
      price: priceFromString("1001"),
      qty: 100,
    });
    expect(marginal.grossPnlPaise).toBe(10_000);
    expect(marginal.netPnlPaise).toBeLessThan(0);
  });
});

describe("guards", () => {
  it("rejects two legs on the same side", () => {
    expect(() => accountForTrade(MODEL, BUY, { ...SELL, side: "BUY" })).toThrow(CostError);
  });

  it("rejects a partial exit, which paper_trades cannot record", () => {
    expect(() => accountForTrade(MODEL, BUY, { ...SELL, qty: 50 })).toThrow(CostError);
  });

  it("rejects a non-positive or fractional quantity", () => {
    for (const qty of [0, -1, 1.5]) {
      expect(() => chargesForLeg(MODEL, { ...BUY, qty }), String(qty)).toThrow(CostError);
    }
  });
});

describe("brokerage models", () => {
  const bare = (brokerage: CostModel["brokerage"]): CostModel => ({
    segment: "test",
    brokerage,
    stt: { percent: 0, side: "BOTH" },
    stampDuty: { percent: 0, side: "BUY" },
    exchangeTransaction: { percent: 0, side: "BOTH" },
    sebiTurnover: { percent: 0, side: "BOTH" },
    gstPercent: 0,
    slippagePercent: 0,
  });

  it("charges a flat fee regardless of size", () => {
    const model = bare({ type: "FLAT_PAISE", value: 2_000 });
    expect(chargesForLeg(model, BUY).brokeragePaise).toBe(2_000);
    expect(chargesForLeg(model, { ...BUY, qty: 1 }).brokeragePaise).toBe(2_000);
  });

  it("charges a percentage when it is under the cap", () => {
    // 0.03% of a ₹10,000 trade = 300 paise = ₹3, well under the ₹20 cap.
    const model = bare({ type: "PERCENT", value: 0.03, capPaise: 2_000 });
    const small = { side: "BUY" as const, price: priceFromString("100"), qty: 100 };
    expect(chargesForLeg(model, small).brokeragePaise).toBe(300);
  });

  it("charges nothing when the broker charges nothing", () => {
    expect(chargesForLeg(bare(ZERO_BROKERAGE), BUY).brokeragePaise).toBe(0);
  });
});

describe("addBreakdowns", () => {
  it("adds every line and the total", () => {
    const one = chargesForLeg(MODEL, BUY);
    const combined = addBreakdowns(one, one);
    expect(combined.sttPaise).toBe(one.sttPaise * 2);
    expect(combined.totalPaise).toBe(one.totalPaise * 2);
    expect(sumOfComponents(combined)).toBe(combined.totalPaise);
  });
});
