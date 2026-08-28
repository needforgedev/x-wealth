import { stopPriceFor, targetPriceFor } from "./backtest-signals";
import { accountForTrade, chargesForLeg, type CostModel, type TradeAccounting } from "./costs";
import type { Bar } from "./market-data";
import { positionValue, type PriceTicks } from "./money";
import type { IsoDate } from "./session";
import type { ResolvedDefinition } from "./strategy";

/**
 * One session, for one instrument.
 *
 * This is the execution model, and it lives here rather than inside the
 * backtest engine because **the forward test has to run exactly the same
 * code**. The product's entire claim rests on comparing what a strategy did
 * forward against what it did in the backtest, and that comparison is
 * meaningless the moment the two disagree about when a fill happens or at what
 * price. Two implementations would diverge; there is one.
 *
 * The difference between the engines is not the trading logic — it is time. A
 * backtest calls this in a loop over history it already has. A forward test
 * calls it once an evening on a bar that did not exist yesterday, with state
 * reconstructed from the database in between.
 *
 * ## The rules, stated once
 *
 * A signal is evaluated at the **close of a session** and filled at the **open
 * of the next**. There is no setting for this. Filling at the close that
 * produced the signal is lookahead wearing a plausible face: you cannot know a
 * session's closing price and also trade at it.
 *
 * A stop-loss is a different kind of thing — a resting order, not a decision —
 * so it can fill *within* a session, including the session the position opened:
 *
 *   - open at or below the stop → filled at the open, because the market gapped
 *     through the level before the order could work
 *   - otherwise low at or below the stop → filled at the stop
 *
 * Filling a gap-down at the stop price would hand the strategy money nobody
 * could have made.
 *
 * A take-profit target is the same kind of thing in the other direction: a
 * resting order, filled at the open when the session gaps above it, otherwise at
 * the target when the high reaches it.
 *
 * ## The intrabar problem (`CLAUDE.md` §7.6, `W5-13`)
 *
 * Once a position has both a stop and a target, a single daily bar can reach
 * both — low ≤ stop and high ≥ target — and **the bar does not say which came
 * first**. O=100 H=105 L=95 C=102 is consistent with up-then-down and with
 * down-then-up, and with a target at 104 and a stop at 96 those two paths give
 * opposite outcomes. §7.6 calls this the biggest source of false results in a
 * backtest, and it is: the optimistic reading turns a losing strategy into a
 * winning one and nothing in the output looks wrong.
 *
 * The rule here is **the stop is assumed to have filled first, always.** §7.6
 * permits resolving the order with 1-minute data inside the bar; the data layer
 * has no intraday method (`MarketDataSource` exposes `dailyBars` and
 * `latestBar` only), so that option does not exist yet and the pessimistic
 * assumption is not a fallback but the whole policy. It is recorded per run in
 * `methodology.execution.intrabar`, because a user who does not know the fill
 * model does not understand their own track record.
 *
 * When 1-minute resolution lands, this is the function that changes and
 * `FillModel` is what a run records to say which one it used.
 *
 * ## Long only
 *
 * `stopLossPercent` is defined as a percentage *below the entry* and the entry
 * action is "buy". Shorting is not expressible in a strategy definition, so it
 * is not modelled — an engine that quietly supported it would be running rules
 * nobody wrote.
 */

export type PositionState = {
  qty: number;
  entryDate: IsoDate;
  entryPrice: PriceTicks;
  stopPrice: PriceTicks;
  /** Null when the strategy declares no target and exits on its rule alone. */
  targetPrice: PriceTicks | null;
};

/** Decided at one session's close, acted on at the next session's open. */
export type PendingOrder = "ENTER" | "EXIT" | null;

export type ExitReason = "SIGNAL" | "STOP_LOSS" | "TARGET" | "END_OF_PERIOD";

/**
 * How a session that reached both levels was resolved.
 *
 * Recorded per run rather than assumed, because it changes the numbers. Only
 * one value is reachable today — see the intrabar note above — and the type
 * exists so that a run produced before 1-minute resolution can still say what
 * it did, rather than being reinterpreted under a policy it never ran under.
 */
export type FillModel = "STOP_FIRST_WHEN_AMBIGUOUS" | "INTRABAR_1M";

export const FILL_MODEL: FillModel = "STOP_FIRST_WHEN_AMBIGUOUS";

export type SessionInput = {
  bar: Bar;
  position: PositionState | null;
  pending: PendingOrder;
  cashPaise: number;

  /** This session's rule outcomes. `null` while an operand is still warming up. */
  entrySignal: boolean | null;
  exitSignal: boolean | null;

  definition: ResolvedDefinition;
  costModel: CostModel;
  lotSize: number;

  /**
   * The last session of the reported window.
   *
   * Two effects, both about not reporting something that never resolved:
   * anything still open is closed at this session's close, and nothing new is
   * opened — a position entered here could only be force-closed in the same
   * session, which is a round trip that can only pay away the charges.
   */
  isFinalSession: boolean;
};

export type OpenedPosition = {
  qty: number;
  price: PriceTicks;
  stopPrice: PriceTicks;
  targetPrice: PriceTicks | null;
  /** Cash paid out: stock value plus the charges on the buy leg. */
  outlayPaise: number;
};

export type ClosedPosition = {
  qty: number;
  entryDate: IsoDate;
  entryPrice: PriceTicks;
  /**
   * The stop this position was opened under.
   *
   * Carried out with the closed trade because it is the denominator of the
   * R-multiple — the trade's result expressed in units of what it originally
   * risked — and that cannot be reconstructed afterwards from entry and exit
   * alone. `CLAUDE.md` §8.12 and the primer both treat R as the unit a
   * strategy's edge is actually measured in.
   */
  stopPrice: PriceTicks;
  exitPrice: PriceTicks;
  reason: ExitReason;
  accounting: TradeAccounting;
  /** Cash received: sale value less the charges on the sell leg only. */
  proceedsPaise: number;
};

export type SessionOutcome = {
  opened: OpenedPosition | null;
  closed: ClosedPosition | null;
  position: PositionState | null;
  pending: PendingOrder;
  cashPaise: number;
};

export function advanceSession(input: SessionInput): SessionOutcome {
  const { bar, definition, costModel, isFinalSession } = input;

  let position = input.position;
  let cashPaise = input.cashPaise;
  let opened: OpenedPosition | null = null;
  let closed: ClosedPosition | null = null;

  // --- act on what was decided at the previous close ------------------------
  if (position) {
    const settlement = closeIfDue(position, bar, input.pending, costModel, isFinalSession);
    if (settlement) {
      closed = settlement;
      cashPaise += settlement.proceedsPaise;
      position = null;
    }
  } else if (input.pending === "ENTER" && !isFinalSession) {
    const entry = openAt(bar, definition, costModel, cashPaise, input.lotSize);
    if (entry) {
      opened = entry;
      cashPaise -= entry.outlayPaise;
      position = {
        qty: entry.qty,
        entryDate: bar.date,
        entryPrice: entry.price,
        stopPrice: entry.stopPrice,
        targetPrice: entry.targetPrice,
      };

      // A stop or a target can fire on the entry session itself — both are
      // resting orders, and the session still has a low and a high either side
      // of the open we bought at.
      const settled = exitIfLevelHit(position, bar, costModel, { skipOpenGap: true });
      if (settled) {
        closed = settled;
        cashPaise += settled.proceedsPaise;
        position = null;
      }
    }
  }

  // --- decide, at this close, what to do at the next open -------------------
  //
  // No warm-up index check. A signal is `null` — not false — while any operand
  // is still warming up, so an unavailable indicator cannot produce one. One
  // rule, in one place, rather than a second bound that can drift out of step.
  let pending: PendingOrder = null;
  if (!isFinalSession) {
    if (position) {
      if (input.exitSignal === true) pending = "EXIT";
    } else if (input.entrySignal === true) {
      pending = "ENTER";
    }
  }

  return { opened, closed, position, pending, cashPaise };
}

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

function openAt(
  bar: Bar,
  definition: ResolvedDefinition,
  model: CostModel,
  cashPaise: number,
  lotSize: number,
): OpenedPosition | null {
  const price = bar.open;

  const target = targetNotional(definition, price, cashPaise);
  const qty = affordableQty(model, price, target, cashPaise, lotSize);
  if (qty <= 0) return null;

  return {
    qty,
    price,
    stopPrice: stopPriceFor(price, definition.stopLossPercent),
    targetPrice: targetPriceFor(price, definition.targetPercent),
    outlayPaise: positionValue(price, qty) + chargesForLeg(model, { side: "BUY", price, qty }).totalPaise,
  };
}

/**
 * The rupee notional this position is aiming for.
 *
 * **CAPITAL_PERCENT** is a percentage of *cash on hand*, not of mark-to-market
 * equity: a position cannot be funded from the unrealised value of another one.
 * It also keeps a run hand-checkable, which the reconciliation suite requires.
 *
 * **RISK_PERCENT** is the sizing `CLAUDE.md` §7.3 specifies — the quantity
 * falls out of the stop rather than being chosen beside it:
 *
 *   risk per unit = entry × stopLoss%          (the distance to the stop)
 *   units         = (capital × risk%) ÷ risk per unit
 *   notional      = units × entry
 *
 * which simplifies to `capital × risk% ÷ stopLoss%`. A tighter stop therefore
 * buys more units for the same rupee risk, and a wider one fewer — the
 * relationship the primer calls the whole point of position sizing.
 *
 * Capital here is cash on hand for the same reason as above. `affordableQty`
 * still clamps the result, so a risk figure that implies more than the account
 * holds becomes the largest position it can actually fund rather than a fill
 * that never happened.
 */
function targetNotional(
  definition: ResolvedDefinition,
  price: PriceTicks,
  cashPaise: number,
): number {
  if (definition.sizing.kind === "CAPITAL_PERCENT") {
    return Math.floor((cashPaise * definition.sizing.percent) / 100);
  }

  const riskPaise = (cashPaise * definition.sizing.riskPercent) / 100;

  /**
   * Both sides of this division must be paise.
   *
   * `price` is in ticks — rupees × 10,000 — while cash is in paise, rupees ×
   * 100. Dividing one by the other directly is off by a factor of a hundred,
   * silently, in the direction of a position a hundred times too large.
   * `positionValue` is the single sanctioned crossing point between the two
   * types, so the risk per unit is computed through it rather than by hand.
   */
  const riskPerUnitPaise = (positionValue(price, 1) * definition.stopLossPercent) / 100;
  if (riskPerUnitPaise <= 0) return 0;

  const units = Math.floor(riskPaise / riskPerUnitPaise);
  return positionValue(price, units);
}

/**
 * How many units fit, given a target notional and the cash on hand.
 *
 * Charges are part of the outlay, not an afterthought — a fill that leaves cash
 * negative is a fill that could not have happened. The loop steps by the
 * shortfall in whole units rather than decrementing one at a time, so it
 * converges in a pass or two instead of walking down from a large quantity.
 */
export function affordableQty(
  model: CostModel,
  price: PriceTicks,
  targetPaise: number,
  cashPaise: number,
  lotSize: number,
): number {
  const unitValue = positionValue(price, 1);
  if (unitValue <= 0) return 0;

  const outlay = (qty: number) =>
    positionValue(price, qty) + chargesForLeg(model, { side: "BUY", price, qty }).totalPaise;

  const lots = (units: number) => Math.floor(units / lotSize) * lotSize;

  let qty = lots(Math.floor(Math.min(targetPaise, cashPaise) / unitValue));

  for (let guard = 0; qty > 0 && outlay(qty) > cashPaise && guard < 64; guard++) {
    const over = outlay(qty) - cashPaise;
    qty -= Math.max(lotSize, lots(Math.ceil(over / unitValue)));
  }

  return qty > 0 && outlay(qty) <= cashPaise ? qty : 0;
}

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

/**
 * Close a position if this session says so.
 *
 * Order matters and is easy to get backwards. When an exit was signalled at the
 * previous close, an order rests at this open — but if the market gapped
 * through the stop overnight, the *stop* is what filled, at the open, and it
 * filled first. Reversing these credits the strategy with an exit at a price
 * the position never saw.
 */
function closeIfDue(
  position: PositionState,
  bar: Bar,
  pending: PendingOrder,
  model: CostModel,
  isFinalSession: boolean,
): ClosedPosition | null {
  if (pending === "EXIT") {
    // All three fill at the same price — the open — so only the recorded reason
    // differs. It is worth getting right anyway: the exit-reason mix is what
    // tells a user whether their rule or their stop is doing the work.
    return settle(position, bar.open, reasonAtOpen(position, bar), model);
  }

  const settled = exitIfLevelHit(position, bar, model, { skipOpenGap: false });
  if (settled) return settled;

  // Nothing may be left open past the end of the reported window. An unclosed
  // position is an unrealised number, and reporting one as a result would let a
  // losing trade sit off the books indefinitely.
  if (isFinalSession) return settle(position, bar.close, "END_OF_PERIOD", model);

  return null;
}

function reasonAtOpen(position: PositionState, bar: Bar): ExitReason {
  const open = bar.open as number;
  if (open <= (position.stopPrice as number)) return "STOP_LOSS";
  if (position.targetPrice !== null && open >= (position.targetPrice as number)) return "TARGET";
  return "SIGNAL";
}

/**
 * Resolve a session against the position's resting orders.
 *
 * The order of these branches is the whole of `W5-13`, so each one says why it
 * sits where it does.
 */
function exitIfLevelHit(
  position: PositionState,
  bar: Bar,
  model: CostModel,
  options: { skipOpenGap: boolean },
): ClosedPosition | null {
  const stop = position.stopPrice as number;
  const target = position.targetPrice === null ? null : (position.targetPrice as number);

  if (!options.skipOpenGap) {
    // Gapped through overnight. The fill is the open, not the level — nobody
    // could have sold at a price the market opened below.
    if ((bar.open as number) <= stop) return settle(position, bar.open, "STOP_LOSS", model);

    // The same logic in our favour, and it is still the truth: a session that
    // opens above the target filled there, at the open. Refusing to model the
    // favourable gap while modelling the unfavourable one is not conservatism,
    // it is a thumb on the scale in the other direction.
    if (target !== null && (bar.open as number) >= target) {
      return settle(position, bar.open, "TARGET", model);
    }
  }

  const stopReached = (bar.low as number) <= stop;
  const targetReached = target !== null && (bar.high as number) >= target;

  /**
   * Both levels inside one bar. The bar cannot say which came first, so the
   * stop is taken — always, never sampled, never split.
   *
   * This branch must precede both single-level branches below. Written the
   * other way round the target would win whenever it happened to be tested
   * first, and the resulting equity curve would be a report on the order of two
   * `if` statements rather than on the strategy.
   */
  if (stopReached && targetReached) {
    return settle(position, position.stopPrice, "STOP_LOSS", model);
  }

  if (stopReached) return settle(position, position.stopPrice, "STOP_LOSS", model);
  if (targetReached) return settle(position, position.targetPrice!, "TARGET", model);

  return null;
}

function settle(
  position: PositionState,
  exitPrice: PriceTicks,
  reason: ExitReason,
  model: CostModel,
): ClosedPosition {
  const accounting = accountForTrade(
    model,
    { side: "BUY", price: position.entryPrice, qty: position.qty },
    { side: "SELL", price: exitPrice, qty: position.qty },
  );

  // Cash back is the sale proceeds less the charges on the *sell* leg only —
  // the buy leg's charges were already paid out of cash when the position
  // opened, and taking them twice would understate the return.
  const sellCharges = chargesForLeg(model, {
    side: "SELL",
    price: exitPrice,
    qty: position.qty,
  }).totalPaise;

  return {
    qty: position.qty,
    entryDate: position.entryDate,
    entryPrice: position.entryPrice,
    stopPrice: position.stopPrice,
    exitPrice,
    reason,
    accounting,
    proceedsPaise: positionValue(exitPrice, position.qty) - sellCharges,
  };
}
