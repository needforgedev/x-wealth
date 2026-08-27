import { describe, expect, it } from "vitest";

import {
  ForwardTestError,
  diffAgainstLedger,
  evaluateForwardTest,
  sessionsInWindow,
  summariseLedger,
  type ForwardTestParams,
  type LedgerRow,
  type RecordedTrade,
} from "./forward-test";
import { ZERO_BROKERAGE, nseEquityDelivery, type CostModel } from "./costs";
import { ohlcBars, type OhlcRow } from "./market-data-fixture";
import { positionValue, priceFromString } from "./money";
import { starterDefinition, type StrategyDefinitionV2 } from "./strategy";

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

const RULES: StrategyDefinitionV2 = {
  ...starterDefinition(),
  universe: { instruments: ["NSE:TEST"], minAvgTurnoverPaise: null },
  entry: { left: { kind: "PRICE" }, comparator: "BELOW", right: { kind: "CONSTANT", value: 95 } },
  exit: { left: { kind: "PRICE" }, comparator: "ABOVE", right: { kind: "CONSTANT", value: 110 } },
  stopLossPercent: 10,
  sizing: { kind: "CAPITAL_PERCENT" as const, percent: 100 },
  initialCapitalPaise: 10_000_000,
};

/**
 * Ten sessions from Monday 5 January 2026. The first three are warm-up the test
 * may read but not trade on; the window opens on the fourth.
 */
const ROWS: OhlcRow[] = [
  { open: "100", high: "101", low: "99", close: "100" }, // 01-05  warm-up
  { open: "100", high: "101", low: "99", close: "100" }, // 01-06  warm-up
  { open: "100", high: "101", low: "99", close: "100" }, // 01-07  warm-up
  { open: "100", high: "101", low: "99", close: "90" }, // 01-08  window opens, entry signal
  { open: "98", high: "99", low: "97", close: "98" }, // 01-09  fill at 98
  { open: "99", high: "112", low: "98", close: "111" }, // 01-12  exit signal
  { open: "113", high: "114", low: "112", close: "113" }, // 01-13  exit at 113
  { open: "113", high: "114", low: "90", close: "92" }, // 01-14  entry signal
  { open: "93", high: "95", low: "92", close: "94" }, // 01-15  fill at 93
  { open: "95", high: "96", low: "94", close: "95" }, // 01-16
];

const bars = () => ohlcBars({ from: "2026-01-05", rows: ROWS });
const series = () => ({ "NSE:TEST": bars() });

const params = (overrides: Partial<ForwardTestParams> = {}): ForwardTestParams => ({
  definition: RULES,
  costModel: FREE,
  initialCapitalPaise: 10_000_000,
  plannedSessions: 7,
  startedOn: "2026-01-08",
  ...overrides,
});

describe("sessionsInWindow", () => {
  it("counts only sessions from the opening date onward", () => {
    // The three warm-up bars are history the test reads, not sessions it ran.
    expect(sessionsInWindow(series(), "2026-01-08")).toHaveLength(7);
  });

  it("takes sessions from the bars, not from a weekday rule", () => {
    // The exchange trades some Saturdays — budget days, disaster-recovery
    // tests, Diwali Muhurat. Where a calendar and the data disagree, the data
    // is what actually happened.
    const withSaturday = {
      "NSE:TEST": [
        ...bars(),
        { date: "2026-01-17", open: 1, high: 1, low: 1, close: 1, volume: 1 } as never,
      ],
    };
    expect(sessionsInWindow(withSaturday, "2026-01-08")).toContain("2026-01-17");
  });
});

describe("a running forward test", () => {
  it("does not force-close a position just because today is the newest bar", () => {
    // The window is 7 sessions and only 7 bars exist, so it happens to be
    // complete here — shorten it to prove the running case.
    const progress = evaluateForwardTest({
      params: params({ plannedSessions: 30 }),
      series: series(),
    });

    expect(progress.isComplete).toBe(false);
    expect(progress.finalSessionDate).toBeNull();
    // The second entry (filled 01-15) is still open, so only the first round
    // trip is recorded. A forced close would fabricate an exit that the market
    // never gave.
    expect(progress.trades).toHaveLength(1);
    expect(progress.trades[0].exitReason).toBe("SIGNAL");
  });

  it("reports sessions elapsed and remaining", () => {
    const progress = evaluateForwardTest({
      params: params({ plannedSessions: 30 }),
      series: series(),
    });

    expect(progress.sessionsElapsed).toBe(7);
    expect(progress.sessionsRemaining).toBe(23);
  });

  it("trades only from the session the window opened on", () => {
    const progress = evaluateForwardTest({
      params: params({ plannedSessions: 30 }),
      series: series(),
    });

    // The warm-up bars are readable but not tradeable. Every entry must fall
    // on or after the opening session.
    for (const trade of progress.trades) {
      expect(trade.entryDate >= "2026-01-08").toBe(true);
    }
    expect(progress.equityCurve[0].date).toBe("2026-01-08");
  });
});

describe("a completed forward test", () => {
  it("closes out on the planned final session, not on the newest bar", () => {
    // Seven planned sessions from 01-08 ends on 01-16, the last bar here.
    const progress = evaluateForwardTest({ params: params(), series: series() });

    expect(progress.isComplete).toBe(true);
    expect(progress.finalSessionDate).toBe("2026-01-16");
    expect(progress.sessionsRemaining).toBe(0);

    // Two round trips: the signalled exit, and the position still open at the
    // end, closed at that session's close.
    expect(progress.trades).toHaveLength(2);
    expect(progress.trades[1].exitReason).toBe("END_OF_PERIOD");
    expect(progress.trades[1].exitPrice).toBe(priceFromString("95"));
  });

  /**
   * A test whose window closed last month must keep reporting the same result
   * however many sessions have printed since. The end is a fixed date, not
   * "wherever the data currently reaches".
   */
  it("ignores sessions that printed after the window closed", () => {
    // The extension has to be bars that *would* trade, or the test proves
    // nothing. An earlier version appended prices far above both thresholds,
    // so the engine had no reason to act and the check passed while the walk
    // was in fact running on for years past the window.
    const extended = {
      "NSE:TEST": [
        ...bars(),
        ...ohlcBars({
          from: "2026-01-19",
          rows: [
            { open: "94", high: "95", low: "90", close: "90" }, // would signal an entry
            { open: "92", high: "93", low: "91", close: "92" }, // would fill here
            { open: "112", high: "120", low: "111", close: "119" }, // would signal an exit
            { open: "120", high: "121", low: "119", close: "120" }, // would fill here
          ],
        }),
      ],
    };

    const before = evaluateForwardTest({ params: params(), series: series() });
    const after = evaluateForwardTest({ params: params(), series: extended });

    expect(after.finalSessionDate).toBe(before.finalSessionDate);
    expect(after.trades).toHaveLength(before.trades.length);
    expect(after.metrics.netReturnPercent).toBeCloseTo(before.metrics.netReturnPercent, 10);
  });

  it("refuses a window with no sessions yet", () => {
    expect(() =>
      evaluateForwardTest({ params: params({ startedOn: "2030-01-01" }), series: series() }),
    ).toThrow(ForwardTestError);
  });
});

/**
 * The property the whole design rests on: the evening job can run twice, or
 * miss a day and catch up, without corrupting anything.
 */
describe("replay is deterministic and idempotent", () => {
  it("produces the same trades every time it runs", () => {
    const a = evaluateForwardTest({ params: params({ plannedSessions: 30 }), series: series() });
    const b = evaluateForwardTest({ params: params({ plannedSessions: 30 }), series: series() });

    expect(b.trades).toEqual(a.trades);
    expect(b.equityCurve).toEqual(a.equityCurve);
  });

  it("catches up after a missed evening without losing or duplicating a trade", () => {
    // Truncating the series is exactly what the job saw on an earlier evening.
    // Whatever it concluded then must still hold once the gap is filled in —
    // the later run's trades have to *extend* the earlier ones, not restate
    // them differently.
    const upToDay5 = {
      "NSE:TEST": ohlcBars({ from: "2026-01-05", rows: ROWS.slice(0, 7) }),
    };

    const partial = evaluateForwardTest({
      params: params({ plannedSessions: 30 }),
      series: upToDay5,
    });
    const full = evaluateForwardTest({
      params: params({ plannedSessions: 30 }),
      series: series(),
    });

    expect(partial.trades.length).toBeGreaterThan(0);
    expect(full.trades.length).toBeGreaterThanOrEqual(partial.trades.length);

    // Every trade the earlier run recorded appears unchanged in the later one.
    for (let i = 0; i < partial.trades.length; i++) {
      expect(full.trades[i]).toEqual(partial.trades[i]);
    }
  });
});

describe("diffAgainstLedger", () => {
  const closed = (symbol: string, entryDate: string) =>
    ({ symbol, entryDate, qty: 10, exitDate: "2026-01-13", exitPrice: 1, netPnlPaise: 1 }) as never;
  const open = (symbol: string, entryDate: string) =>
    ({ symbol, entryDate, qty: 10, entryPrice: 1, stopPrice: 1, markPrice: 1 }) as never;

  it("enters a position the ledger has not seen, exit columns left empty", () => {
    const diff = diffAgainstLedger([], [open("NSE:TEST", "2026-01-09")], []);

    expect(diff.toEnter).toHaveLength(1);
    expect(diff.toOpen).toHaveLength(0);
    expect(diff.toClose).toHaveLength(0);
  });

  it("writes one complete row for a trade that opened and closed between runs", () => {
    // A stop firing on the entry session. The close-once trigger permits
    // NULL → value but not a second write, so this cannot be two statements.
    const diff = diffAgainstLedger([closed("NSE:TEST", "2026-01-09")], [], []);

    expect(diff.toOpen).toHaveLength(1);
    expect(diff.toEnter).toHaveLength(0);
    expect(diff.toClose).toHaveLength(0);
  });

  it("closes a recorded position the replay says has now exited", () => {
    const recorded: RecordedTrade = {
      symbol: "NSE:TEST",
      qty: 10,
      entryDate: "2026-01-09",
      exitDate: null,
    };
    const diff = diffAgainstLedger([closed("NSE:TEST", "2026-01-09")], [], [recorded]);

    expect(diff.toClose).toHaveLength(1);
    expect(diff.toClose[0].recorded).toBe(recorded);
    expect(diff.toOpen).toHaveLength(0);
    expect(diff.toEnter).toHaveLength(0);
  });

  it("writes nothing when the ledger already agrees", () => {
    // Running the job twice the same evening must be a no-op. This is what
    // makes a retry safe against an append-only table.
    const alreadyClosed: RecordedTrade = {
      symbol: "NSE:TEST",
      qty: 10,
      entryDate: "2026-01-09",
      exitDate: "2026-01-13",
    };
    const diff = diffAgainstLedger([closed("NSE:TEST", "2026-01-09")], [], [alreadyClosed]);

    expect(diff.toOpen).toHaveLength(0);
    expect(diff.toEnter).toHaveLength(0);
    expect(diff.toClose).toHaveLength(0);
    expect(diff.unexplained).toHaveLength(0);
  });

  it("leaves an already-recorded open position alone", () => {
    const stillOpen: RecordedTrade = {
      symbol: "NSE:TEST",
      qty: 10,
      entryDate: "2026-01-09",
      exitDate: null,
    };
    const diff = diffAgainstLedger([], [open("NSE:TEST", "2026-01-09")], [stillOpen]);

    expect(diff.toEnter).toHaveLength(0);
    expect(diff.unexplained).toHaveLength(0);
  });

  it("flags a recorded trade the replay cannot account for", () => {
    // Never acted on — paper_trades is append-only, so there is no correction
    // to apply. It means the record and the replay disagree about history,
    // which is a bug to stop for rather than paper over.
    const orphan: RecordedTrade = {
      symbol: "NSE:TEST",
      qty: 10,
      entryDate: "2026-01-02",
      exitDate: null,
    };
    const diff = diffAgainstLedger([], [], [orphan]);

    expect(diff.unexplained).toEqual([orphan]);
    expect(diff.toOpen).toHaveLength(0);
    expect(diff.toEnter).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// W6-07 — running metrics
// ---------------------------------------------------------------------------

/** Real statutory charges, so the exit-charge deduction has something to bite on. */
const CHARGED = nseEquityDelivery({ brokerage: ZERO_BROKERAGE, slippagePercent: 0.05 });

const charged = (plannedSessions: number) =>
  evaluateForwardTest({
    params: params({ plannedSessions, costModel: CHARGED }),
    series: series(),
  });

describe("running metrics while a position is open", () => {
  it("does not report a return that has skipped the exit charges", () => {
    const progress = charged(30);
    const { standing } = progress;

    expect(standing.openPositionCount).toBe(1);
    expect(standing.exitChargesOutstandingPaise).toBeGreaterThan(0);

    // The equity curve values the holding at the last close. Nothing has paid
    // to sell it, so the curve — and every metric taken from the curve — is
    // above what closing would actually realise. §5.3 says no figure here may
    // be quoted without its costs, so the headline pays them.
    expect(standing.equityPaise).toBe(
      standing.markedEquityPaise - standing.exitChargesOutstandingPaise,
    );
    expect(standing.netReturnPercent).toBeLessThan(progress.metrics.netReturnPercent);
  });

  it("accounts for every paisa: marked equity is realised plus unrealised plus the unpaid exit", () => {
    const { standing } = charged(30);

    // The identity the whole type rests on. If this drifts, one of the three
    // figures on the console contradicts the other two.
    expect(standing.markedEquityPaise - standing.exitChargesOutstandingPaise).toBe(
      RULES.initialCapitalPaise + standing.realisedNetPnlPaise + standing.unrealisedNetPnlPaise,
    );
  });

  it("separates the settled round trip from the marked one", () => {
    const progress = charged(30);
    const { standing } = progress;

    expect(standing.closedTradeCount).toBe(1);
    expect(standing.realisedNetPnlPaise).toBe(progress.trades[0].netPnlPaise);
    expect(standing.unrealisedNetPnlPaise).toBe(standing.openMarks[0].netPnlIfClosedPaise);
  });

  it("marks the open position at the latest close, net of both legs", () => {
    const { standing } = charged(30);
    const mark = standing.openMarks[0];

    // Filled at the 01-15 open of 93, last close 95 on 01-16.
    expect(mark.entryDate).toBe("2026-01-15");
    expect(mark.entryPrice).toBe(priceFromString("93"));
    expect(mark.markPrice).toBe(priceFromString("95"));
    // Up two rupees a share, so the gross is positive — but the charges on a
    // two-rupee move are not nothing, and the net is what gets shown. The bound
    // goes through `positionValue` rather than being multiplied out by hand:
    // prices are ticks and P&L is paise, and doing that conversion backwards
    // once already produced a bound four orders of magnitude too loose to fail.
    const gross =
      positionValue(mark.markPrice, mark.qty) - positionValue(mark.entryPrice, mark.qty);
    expect(gross).toBeGreaterThan(0);
    expect(mark.netPnlIfClosedPaise).toBeLessThan(gross);
  });

  it("reports the room left to the stop", () => {
    const { standing } = charged(30);
    const mark = standing.openMarks[0];

    // Stop is 10% under the 93 entry, so 83.70 against a 95 mark.
    expect(mark.stopPrice).toBe(priceFromString("83.70"));
    expect(mark.roomToStopPercent).toBeCloseTo(((95 - 83.7) / 95) * 100, 6);
  });

  it("dates itself from the last session the data printed, not from the clock", () => {
    const { standing } = charged(30);

    // How a reader can tell the evening job is behind. Derived from a bar,
    // never from `new Date()` — a screen that says "today" when the loader
    // stopped last week is the one thing worse than saying nothing.
    expect(standing.lastSessionDate).toBe("2026-01-16");
  });

  it("counts progress against the planned window", () => {
    const { standing } = charged(30);

    expect(standing.sessionsElapsed).toBe(7);
    expect(standing.sessionsRemaining).toBe(23);
    expect(standing.percentComplete).toBeCloseTo((7 / 30) * 100, 6);
    expect(standing.isComplete).toBe(false);
  });
});

describe("running metrics once nothing is open", () => {
  it("agrees with the completed metrics when there is no mark left to pay for", () => {
    const progress = charged(7);
    const { standing } = progress;

    expect(progress.isComplete).toBe(true);
    expect(standing.openPositionCount).toBe(0);
    expect(standing.exitChargesOutstandingPaise).toBe(0);
    expect(standing.unrealisedNetPnlPaise).toBe(0);
    expect(standing.equityPaise).toBe(standing.markedEquityPaise);
    // Both engines' figures converge the moment the window closes everything
    // out, which is the only condition under which they should.
    expect(standing.netReturnPercent).toBeCloseTo(progress.metrics.netReturnPercent, 10);
  });

  it("caps progress at a full window rather than reporting more than 100%", () => {
    // Seven sessions exist against a five-session window: the extra bars are
    // outside it and cannot make it 140% finished.
    const { standing } = charged(5);

    expect(standing.sessionsElapsed).toBe(5);
    expect(standing.sessionsRemaining).toBe(0);
    expect(standing.percentComplete).toBe(100);
  });
});

describe("the frozen capital and the frozen definition", () => {
  it("refuses to report when the two disagree", () => {
    // Written from one value when the window opened, so a mismatch means one
    // has drifted — and the return would then be a percentage of one capital
    // computed from a curve built on the other.
    expect(() =>
      evaluateForwardTest({
        params: params({ initialCapitalPaise: 9_000_000 }),
        series: series(),
      }),
    ).toThrow(ForwardTestError);
  });
});

describe("summariseLedger", () => {
  const row = (overrides: Partial<LedgerRow>): LedgerRow => ({
    symbol: "NSE:TEST",
    qty: 10,
    entryDate: "2026-01-09",
    exitDate: "2026-01-13",
    netPnlPaise: 0,
    ...overrides,
  });

  it("adds up only what the ledger has settled", () => {
    const summary = summariseLedger([
      row({ entryDate: "2026-01-09", exitDate: "2026-01-13", netPnlPaise: 5_000 }),
      row({ entryDate: "2026-01-15", exitDate: "2026-01-20", netPnlPaise: -2_000 }),
      row({ entryDate: "2026-01-22", exitDate: null, netPnlPaise: null }),
    ]);

    expect(summary.closed).toBe(2);
    expect(summary.open).toBe(1);
    expect(summary.winners).toBe(1);
    expect(summary.losers).toBe(1);
    expect(summary.realisedNetPnlPaise).toBe(3_000);
    expect(summary.firstEntryDate).toBe("2026-01-09");
    expect(summary.lastExitDate).toBe("2026-01-20");
  });

  it("counts a break-even close as neither a win nor a loss", () => {
    const summary = summariseLedger([row({ netPnlPaise: 0 })]);

    expect(summary.scratches).toBe(1);
    expect(summary.winners).toBe(0);
    expect(summary.losers).toBe(0);
  });

  it("flags a closed row with no net rather than summing it as nothing", () => {
    // Should never happen — the job writes the exit and the accounting in one
    // statement. A missing figure quietly added as ₹0 is a wrong total that
    // looks like a right one, so it is counted out loud instead.
    const summary = summariseLedger([
      row({ netPnlPaise: 4_000 }),
      row({ entryDate: "2026-01-15", exitDate: "2026-01-16", netPnlPaise: null }),
    ]);

    expect(summary.closed).toBe(2);
    expect(summary.unpriced).toBe(1);
    expect(summary.realisedNetPnlPaise).toBe(4_000);
  });

  it("reports an empty ledger as empty rather than as a zero return", () => {
    const summary = summariseLedger([]);

    expect(summary).toMatchObject({ closed: 0, open: 0, unpriced: 0, realisedNetPnlPaise: 0 });
    expect(summary.firstEntryDate).toBeNull();
    expect(summary.lastExitDate).toBeNull();
  });
});
