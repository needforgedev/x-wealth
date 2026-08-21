import {
  addPaise,
  negatePaise,
  paise,
  percentOf,
  positionValue,
  subPaise,
  type Paise,
  type PriceTicks,
} from "./money";

/**
 * What a trade actually costs.
 *
 * `x-wealth-product.md` §5.3 is the whole reason this file exists:
 *
 *   > Every performance figure — backtest or forward test — must be net of:
 *   > brokerage, STT, stamp duty, exchange transaction charges, SEBI turnover
 *   > fee, GST, and a stated slippage assumption.
 *   >
 *   > There must be **no code path that produces a gross-return figure.** Do
 *   > not add an `include_costs: boolean` parameter. Costs are structural.
 *
 * That last instruction shapes the API here. `accountForTrade` returns gross,
 * costs and net together as one value — there is no function that hands back a
 * gross figure on its own, so a caller cannot report one without having the
 * costs in the same object. The schema agrees: `paper_trades` has a CHECK
 * requiring `gross_pnl_paise`, `costs_breakdown` and `net_pnl_paise` to be
 * present together or absent together.
 *
 * ## Why the charges carry a side
 *
 * The Indian charge structure is asymmetric, and the asymmetry is not a
 * detail. STT on a delivery trade is levied on both legs; on an intraday trade
 * it is sell-side only, at a quarter of the rate. Stamp duty is buy-side only.
 * A single `sttPercent` with the side rule hidden in code cannot express that,
 * and worse, it means a stored `cost_model` does not determine what was
 * charged — the code of the day does. Since the model is persisted precisely
 * so a run can be understood years later (PRD §5.3, "methodology disclosed and
 * reproducible"), the side belongs in the data.
 *
 * ## GST is not a charge on turnover
 *
 * It is 18% of the *services* billed — brokerage plus exchange transaction
 * charges plus the SEBI turnover fee. Applying it to turnover overstates costs
 * by orders of magnitude, and it is the single most common mistake in a
 * home-grown cost model.
 */

export type ChargeSide = "BUY" | "SELL" | "BOTH";

/** A statutory charge levied as a percentage of turnover, on one side or both. */
export type RateCharge = {
  percent: number;
  side: ChargeSide;
};

export type BrokerageModel = {
  type: "PERCENT" | "FLAT_PAISE";
  value: number;
  /** "0.03% or ₹20, whichever is lower" — the cap is the ₹20. */
  capPaise?: number;
};

export type CostModel = {
  /**
   * Labels which rulebook these rates came from. Not used in the arithmetic —
   * every rule that affects a number is explicit in the fields below — but a
   * result is much harder to read a year later without it.
   */
  segment: string;
  brokerage: BrokerageModel;
  stt: RateCharge;
  stampDuty: RateCharge;
  exchangeTransaction: RateCharge;
  sebiTurnover: RateCharge;
  /** Applied to brokerage + exchange transaction + SEBI turnover. Not to turnover. */
  gstPercent: number;
  /**
   * The stated assumption about getting a worse fill than the signalled price.
   *
   * Modelled as a cost line rather than as a price adjustment. Both give the
   * same net P&L, but this way the fill price stays the price the strategy
   * actually signalled, and the reader can see what the assumption cost them
   * rather than having it baked invisibly into the entry.
   */
  slippagePercent: number;
};

/** Per-trade breakdown of the above, in paise. Components sum to `totalPaise`. */
export type CostsBreakdown = {
  brokeragePaise: number;
  sttPaise: number;
  stampDutyPaise: number;
  exchangeTransactionPaise: number;
  sebiTurnoverPaise: number;
  gstPaise: number;
  slippagePaise: number;
  totalPaise: number;
};

export type TradeSide = "BUY" | "SELL";

/** One side of a round trip. */
export type Leg = {
  side: TradeSide;
  price: PriceTicks;
  qty: number;
};

export class CostError extends Error {}

function applies(charge: RateCharge, side: TradeSide): boolean {
  return charge.side === "BOTH" || charge.side === side;
}

function rate(charge: RateCharge, turnover: Paise, side: TradeSide): Paise {
  return applies(charge, side) ? percentOf(turnover, charge.percent) : paise(0);
}

function brokerageFor(model: BrokerageModel, turnover: Paise): Paise {
  const raw =
    model.type === "PERCENT" ? percentOf(turnover, model.value) : paise(Math.round(model.value));

  if (model.capPaise === undefined) return raw;
  return raw > model.capPaise ? paise(model.capPaise) : raw;
}

/**
 * Charges on a single leg.
 *
 * Each component rounds to the paisa independently and the total is the sum of
 * those rounded components — which is how the charges are actually billed, and
 * what makes the breakdown add up when a reader checks it. Rounding once at
 * the end would produce a total that does not equal its own parts.
 *
 * GST is computed from the already-rounded brokerage, exchange and SEBI lines,
 * because those are the amounts invoiced.
 */
export function chargesForLeg(model: CostModel, leg: Leg): CostsBreakdown {
  if (!Number.isInteger(leg.qty) || leg.qty <= 0) {
    throw new CostError(`quantity must be a positive whole number, got ${leg.qty}`);
  }

  const turnover = positionValue(leg.price, leg.qty);

  const brokeragePaise = brokerageFor(model.brokerage, turnover);
  const sttPaise = rate(model.stt, turnover, leg.side);
  const stampDutyPaise = rate(model.stampDuty, turnover, leg.side);
  const exchangeTransactionPaise = rate(model.exchangeTransaction, turnover, leg.side);
  const sebiTurnoverPaise = rate(model.sebiTurnover, turnover, leg.side);

  const taxable = addPaise(brokeragePaise, exchangeTransactionPaise, sebiTurnoverPaise);
  const gstPaise = percentOf(taxable, model.gstPercent);

  const slippagePaise = percentOf(turnover, model.slippagePercent);

  return {
    brokeragePaise,
    sttPaise,
    stampDutyPaise,
    exchangeTransactionPaise,
    sebiTurnoverPaise,
    gstPaise,
    slippagePaise,
    totalPaise: addPaise(
      brokeragePaise,
      sttPaise,
      stampDutyPaise,
      exchangeTransactionPaise,
      sebiTurnoverPaise,
      gstPaise,
      slippagePaise,
    ),
  };
}

export function addBreakdowns(a: CostsBreakdown, b: CostsBreakdown): CostsBreakdown {
  return {
    brokeragePaise: a.brokeragePaise + b.brokeragePaise,
    sttPaise: a.sttPaise + b.sttPaise,
    stampDutyPaise: a.stampDutyPaise + b.stampDutyPaise,
    exchangeTransactionPaise: a.exchangeTransactionPaise + b.exchangeTransactionPaise,
    sebiTurnoverPaise: a.sebiTurnoverPaise + b.sebiTurnoverPaise,
    gstPaise: a.gstPaise + b.gstPaise,
    slippagePaise: a.slippagePaise + b.slippagePaise,
    totalPaise: a.totalPaise + b.totalPaise,
  };
}

/**
 * Gross, costs and net for a completed round trip.
 *
 * These three travel together by construction. There is deliberately no
 * `grossPnl(entry, exit)` export: §5.3 forbids a code path that yields a gross
 * figure, and the cheapest way to honour that is to make it impossible to
 * obtain one without its costs attached.
 */
export type TradeAccounting = {
  grossPnlPaise: Paise;
  costs: CostsBreakdown;
  netPnlPaise: Paise;
};

export function accountForTrade(model: CostModel, entry: Leg, exit: Leg): TradeAccounting {
  if (entry.side === exit.side) {
    throw new CostError(`a round trip needs opposite legs, got ${entry.side} then ${exit.side}`);
  }
  if (entry.qty !== exit.qty) {
    // Partial exits are not modelled: `paper_trades` records one entry and one
    // exit, so a half-closed position has nowhere to live.
    throw new CostError(`entry quantity ${entry.qty} does not match exit ${exit.qty}`);
  }

  const entryValue = positionValue(entry.price, entry.qty);
  const exitValue = positionValue(exit.price, exit.qty);

  // Long: bought first, so the gain is what it rose by. Short: sold first, so
  // the gain is what it fell by.
  const grossPnlPaise =
    entry.side === "BUY" ? subPaise(exitValue, entryValue) : subPaise(entryValue, exitValue);

  const costs = addBreakdowns(chargesForLeg(model, entry), chargesForLeg(model, exit));

  return {
    grossPnlPaise,
    costs,
    netPnlPaise: addPaise(grossPnlPaise, negatePaise(paise(costs.totalPaise))),
  };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * ⚠️ ILLUSTRATIVE RATES, CAPTURED 2026-08-20. VERIFY BEFORE ANY REAL RUN.
 *
 * Statutory rates move with circulars, and a stale rate produces a plausible
 * number that is quietly wrong — the exact failure mode `execution-plan.md`
 * calls the highest technical risk in the project. These exist so the engine
 * has something coherent to exercise and so the *shape* of a real model is
 * documented. Check every figure against the current NSE and SEBI circulars
 * before a result is shown to anybody.
 *
 * Brokerage is not statutory — it is whatever the advisor's broker charges, so
 * it is a parameter rather than a constant.
 */
const RATES = {
  exchangeTransactionPercent: 0.00297,
  sebiTurnoverPercent: 0.0001,
  gstPercent: 18,
  delivery: { sttPercent: 0.1, stampDutyPercent: 0.015 },
  intraday: { sttPercent: 0.025, stampDutyPercent: 0.003 },
} as const;

export const ZERO_BROKERAGE: BrokerageModel = { type: "FLAT_PAISE", value: 0 };

/**
 * NSE cash equity, taken to delivery.
 *
 * STT on both legs, stamp duty on the buy.
 */
export function nseEquityDelivery(input: {
  brokerage: BrokerageModel;
  slippagePercent: number;
}): CostModel {
  return {
    segment: "NSE_EQUITY_DELIVERY (rates captured 2026-08-20 — verify)",
    brokerage: input.brokerage,
    stt: { percent: RATES.delivery.sttPercent, side: "BOTH" },
    stampDuty: { percent: RATES.delivery.stampDutyPercent, side: "BUY" },
    exchangeTransaction: { percent: RATES.exchangeTransactionPercent, side: "BOTH" },
    sebiTurnover: { percent: RATES.sebiTurnoverPercent, side: "BOTH" },
    gstPercent: RATES.gstPercent,
    slippagePercent: input.slippagePercent,
  };
}

/**
 * NSE cash equity, squared off the same session.
 *
 * STT on the sell only, at a quarter of the delivery rate — the asymmetry a
 * single `sttPercent` could not express.
 */
export function nseEquityIntraday(input: {
  brokerage: BrokerageModel;
  slippagePercent: number;
}): CostModel {
  return {
    segment: "NSE_EQUITY_INTRADAY (rates captured 2026-08-20 — verify)",
    brokerage: input.brokerage,
    stt: { percent: RATES.intraday.sttPercent, side: "SELL" },
    stampDuty: { percent: RATES.intraday.stampDutyPercent, side: "BUY" },
    exchangeTransaction: { percent: RATES.exchangeTransactionPercent, side: "BOTH" },
    sebiTurnover: { percent: RATES.sebiTurnoverPercent, side: "BOTH" },
    gstPercent: RATES.gstPercent,
    slippagePercent: input.slippagePercent,
  };
}
