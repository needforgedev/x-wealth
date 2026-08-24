import { stopPriceFor } from "./backtest-signals";
import { accountForTrade, chargesForLeg, type CostModel, type TradeAccounting } from "./costs";
import type { Bar } from "./market-data";
import { positionValue, type PriceTicks } from "./money";
import type { IsoDate } from "./session";
import type { StrategyDefinition } from "./strategy";

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
};

/** Decided at one session's close, acted on at the next session's open. */
export type PendingOrder = "ENTER" | "EXIT" | null;

export type ExitReason = "SIGNAL" | "STOP_LOSS" | "END_OF_PERIOD";

export type SessionInput = {
  bar: Bar;
  position: PositionState | null;
  pending: PendingOrder;
  cashPaise: number;

  /** This session's rule outcomes. `null` while an operand is still warming up. */
  entrySignal: boolean | null;
  exitSignal: boolean | null;

  definition: StrategyDefinition;
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
  /** Cash paid out: stock value plus the charges on the buy leg. */
  outlayPaise: number;
};

export type ClosedPosition = {
  qty: number;
  entryDate: IsoDate;
  entryPrice: PriceTicks;
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
      };

      // A stop can fire on the entry session itself — it is a resting order,
      // and the session still has a low below the open we bought at.
      const stopped = stopIfHit(position, bar, costModel, { skipOpenGap: true });
      if (stopped) {
        closed = stopped;
        cashPaise += stopped.proceedsPaise;
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
  definition: StrategyDefinition,
  model: CostModel,
  cashPaise: number,
  lotSize: number,
): OpenedPosition | null {
  const price = bar.open;

  // Percent of **cash on hand**, not of mark-to-market equity. The definition
  // says "percent of available capital", and available is the honest reading: a
  // position cannot be funded from the unrealised value of another one. It also
  // makes a run hand-checkable, which gate G4 requires. The choice is recorded
  // in the run's methodology so a reader is never left guessing.
  const target = Math.floor((cashPaise * definition.positionSizePercent) / 100);
  const qty = affordableQty(model, price, target, cashPaise, lotSize);
  if (qty <= 0) return null;

  return {
    qty,
    price,
    stopPrice: stopPriceFor(price, definition.stopLossPercent),
    outlayPaise: positionValue(price, qty) + chargesForLeg(model, { side: "BUY", price, qty }).totalPaise,
  };
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
    const reason: ExitReason =
      (bar.open as number) <= (position.stopPrice as number) ? "STOP_LOSS" : "SIGNAL";
    return settle(position, bar.open, reason, model);
  }

  const stopped = stopIfHit(position, bar, model, { skipOpenGap: false });
  if (stopped) return stopped;

  // Nothing may be left open past the end of the reported window. An unclosed
  // position is an unrealised number, and reporting one as a result would let a
  // losing trade sit off the books indefinitely.
  if (isFinalSession) return settle(position, bar.close, "END_OF_PERIOD", model);

  return null;
}

function stopIfHit(
  position: PositionState,
  bar: Bar,
  model: CostModel,
  options: { skipOpenGap: boolean },
): ClosedPosition | null {
  const stop = position.stopPrice as number;

  if (!options.skipOpenGap && (bar.open as number) <= stop) {
    // Gapped through overnight. The fill is the open, not the stop — nobody
    // could have sold at a level the market opened below.
    return settle(position, bar.open, "STOP_LOSS", model);
  }
  if ((bar.low as number) <= stop) {
    return settle(position, position.stopPrice, "STOP_LOSS", model);
  }
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
    exitPrice,
    reason,
    accounting,
    proceedsPaise: positionValue(exitPrice, position.qty) - sellCharges,
  };
}
