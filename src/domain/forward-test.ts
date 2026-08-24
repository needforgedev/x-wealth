import {
  runBacktest,
  type BacktestMetrics,
  type EquityPoint,
  type ExecutedTrade,
  type OpenPositionAtEnd,
} from "./backtest";
import { accountForTrade, chargesForLeg, type CostModel } from "./costs";
import type { Bar } from "./market-data";
import type { PriceTicks } from "./money";
import type { IsoDate, TradingCalendar } from "./session";
import type { StrategyDefinition } from "./strategy";

/**
 * A forward test, advanced one session at a time.
 *
 * `x-wealth-product.md` §5.2 and `plan.md` W6. This is the differentiator: a
 * backtest is a claim about data that already existed when the rules were
 * written, a forward test is a commitment made before the data exists.
 *
 * ## Replay, not incremental state
 *
 * Every evening this replays the whole window from the session it started on,
 * then compares the result against what `paper_trades` already holds. It does
 * **not** keep a running position or cash balance anywhere.
 *
 * That sounds wasteful and is the single most important decision in the file.
 * Sixty sessions across a handful of instruments is microseconds, and what it
 * buys is worth far more:
 *
 *   - **The ledger is the only source of truth.** A cached balance is a second
 *     truth that can drift from the append-only record, and when the two
 *     disagree there is no principled way to say which is right.
 *   - **A missed evening heals itself.** Deploy, outage, a job that never
 *     fired — the next run sees more sessions than are recorded and processes
 *     the gap in order, rather than silently skipping a day.
 *   - **Running twice is safe.** The replay is a pure function of frozen
 *     parameters and immutable bars, so a second run produces the same trades
 *     and the diff against the ledger comes back empty.
 *   - **It is literally the backtest engine.** Same entry point, same fills.
 *     The comparison between forward and backtest results is the product's
 *     whole claim, and it can only be trusted if nothing differs but the dates.
 */

export class ForwardTestError extends Error {}

/**
 * Placeholder from §9 blocker B-2, which wants statistical justification.
 *
 * Sixty sessions is roughly a quarter, which is long enough that a strategy
 * cannot get through it on one lucky trade. That is a reason, not a
 * justification — the real one needs the trade-count-versus-win-rate work the
 * blocker names, and this number should be expected to move when it lands.
 */
export const DEFAULT_PLANNED_SESSIONS = 60;

/**
 * W6-10 — configurable, within guard rails rather than opinions.
 *
 * The floor exists because a window shorter than a month cannot say anything
 * about a strategy that trades a few times a quarter. The ceiling exists
 * because a window nobody lives to see the end of is a way of never being
 * judged. Neither is a claim about what a *good* window is.
 *
 * Here rather than beside the action because it is a rule about forward tests,
 * and because a `"use server"` module may only export async functions — a form
 * that needs these bounds to validate its own input cannot import them from
 * there.
 */
export const SESSION_WINDOW = { min: 20, max: 250 } as const;

/** A `paper_trades` row, as the domain needs to see it. */
export type RecordedTrade = {
  symbol: string;
  qty: number;
  entryDate: IsoDate;
  exitDate: IsoDate | null;
};

/** Everything frozen at RUNNING, plus the window it opened on. */
export type ForwardTestParams = {
  definition: StrategyDefinition;
  costModel: CostModel;
  initialCapitalPaise: number;
  plannedSessions: number;
  /** The first session the window covers. */
  startedOn: IsoDate;
};

export type ForwardTestProgress = {
  /** Sessions elapsed, counting the opening one as session 1. */
  sessionsElapsed: number;
  sessionsRemaining: number;
  /** True once the window has run its full length. */
  isComplete: boolean;
  /** The session that closes the window, if it has been reached. */
  finalSessionDate: IsoDate | null;
  trades: ExecutedTrade[];
  /** Positions the window is still holding. Empty once the test completes. */
  openPositions: OpenPositionAtEnd[];
  equityCurve: Array<{ date: IsoDate; equityPaise: number }>;
  metrics: BacktestMetrics;
  /** W6-07. The figures a live console shows, and the only return it may quote. */
  standing: RunningStanding;
};

// ---------------------------------------------------------------------------
// Running metrics (W6-07)
// ---------------------------------------------------------------------------

/** An open position, marked and costed as though it closed at the latest print. */
export type OpenMark = {
  symbol: string;
  qty: number;
  entryDate: IsoDate;
  entryPrice: PriceTicks;
  stopPrice: PriceTicks;
  /** Latest close seen for the instrument. */
  markPrice: PriceTicks;
  /** Net of *both* legs' charges, so it compares directly to a closed trade. */
  netPnlIfClosedPaise: number;
  /** The sell leg's charges, which nothing has paid yet. */
  exitChargesPaise: number;
  /** How far the mark sits above the stop, as a percent of the mark. */
  roomToStopPercent: number;
};

/**
 * Where a test stands mid-window — the live console's figures.
 *
 * ## Why this exists rather than reusing `metrics`
 *
 * `BacktestMetrics` is computed from the equity curve, and the curve values an
 * open position at `qty × last close`. The buy leg's charges were taken out of
 * cash when the position opened; the sell leg's have not been taken out of
 * anything, because the position has not sold. So for a test that is still
 * holding something, the curve — and every metric derived from it — is above
 * what the same position would actually realise, by exactly the charges the
 * exit will cost.
 *
 * For a backtest that never matters: the final session force-closes everything,
 * so the last point has both legs paid. For a *running* forward test it matters
 * on every single day, and §5.3 is unambiguous that no code path here may
 * produce a figure that has not paid its costs. `netReturnPercent` below is
 * therefore computed net of the outstanding exit charges, and it is the only
 * return figure this type exposes.
 *
 * The overstatement is kept rather than hidden: `markedEquityPaise` is the
 * curve's own last value and `exitChargesOutstandingPaise` is the difference,
 * so a screen can show the curve and still say what the curve has not paid.
 */
export type RunningStanding = {
  /** Sessions elapsed, counting the opening one as session 1. */
  sessionsElapsed: number;
  plannedSessions: number;
  sessionsRemaining: number;
  /** Capped at 100 — a window cannot be more than finished. */
  percentComplete: number;
  isComplete: boolean;
  /**
   * The most recent session the *data* printed.
   *
   * Not "today". If the evening job has not run, or the loader is behind, this
   * is how a reader can tell — which is why it is part of the standing rather
   * than something a screen derives from the clock.
   */
  lastSessionDate: IsoDate | null;

  closedTradeCount: number;
  openPositionCount: number;
  /** Settled. Sum of the closed round trips, each already net of both legs. */
  realisedNetPnlPaise: number;
  /** Marked. What the open positions would net if they closed at `markPrice`. */
  unrealisedNetPnlPaise: number;
  /** The sell-leg charges inside `markedEquityPaise` that nobody has paid. */
  exitChargesOutstandingPaise: number;

  /** Cash plus holdings at the last mark — the equity curve's last value. */
  markedEquityPaise: number;
  /** The same, less `exitChargesOutstandingPaise`. */
  equityPaise: number;
  /** Return on `equityPaise`, after every charge including the unpaid ones. */
  netReturnPercent: number;

  openMarks: OpenMark[];
};

/**
 * The live figures, from a replay's output.
 *
 * Split out from `evaluateForwardTest` so it can be checked on its own — the
 * identity it rests on (`markedEquity − exitCharges = initialCapital +
 * realised + unrealised`) is arithmetic that deserves a test rather than a
 * comment.
 */
export function standingOf(input: {
  costModel: CostModel;
  initialCapitalPaise: number;
  plannedSessions: number;
  sessionsElapsed: number;
  isComplete: boolean;
  trades: readonly ExecutedTrade[];
  openPositions: readonly OpenPositionAtEnd[];
  equityCurve: readonly EquityPoint[];
}): RunningStanding {
  const openMarks = input.openPositions.map((position) => markOf(position, input.costModel));

  const realisedNetPnlPaise = input.trades.reduce((sum, t) => sum + t.netPnlPaise, 0);
  const unrealisedNetPnlPaise = openMarks.reduce((sum, m) => sum + m.netPnlIfClosedPaise, 0);
  const exitChargesOutstandingPaise = openMarks.reduce((sum, m) => sum + m.exitChargesPaise, 0);

  const markedEquityPaise = input.equityCurve.at(-1)?.equityPaise ?? input.initialCapitalPaise;
  const equityPaise = markedEquityPaise - exitChargesOutstandingPaise;

  return {
    sessionsElapsed: input.sessionsElapsed,
    plannedSessions: input.plannedSessions,
    sessionsRemaining: Math.max(input.plannedSessions - input.sessionsElapsed, 0),
    percentComplete: Math.min(100, (input.sessionsElapsed / input.plannedSessions) * 100),
    isComplete: input.isComplete,
    lastSessionDate: input.equityCurve.at(-1)?.date ?? null,

    closedTradeCount: input.trades.length,
    openPositionCount: openMarks.length,
    realisedNetPnlPaise,
    unrealisedNetPnlPaise,
    exitChargesOutstandingPaise,

    markedEquityPaise,
    equityPaise,
    netReturnPercent:
      input.initialCapitalPaise === 0
        ? 0
        : ((equityPaise - input.initialCapitalPaise) / input.initialCapitalPaise) * 100,

    openMarks,
  };
}

function markOf(position: OpenPositionAtEnd, costModel: CostModel): OpenMark {
  // The same call the engine makes when a position actually closes, so an open
  // position's number and a closed one's are produced by one code path.
  const accounting = accountForTrade(
    costModel,
    { side: "BUY", price: position.entryPrice, qty: position.qty },
    { side: "SELL", price: position.markPrice, qty: position.qty },
  );

  const exitCharges = chargesForLeg(costModel, {
    side: "SELL",
    price: position.markPrice,
    qty: position.qty,
  }).totalPaise;

  const mark = position.markPrice as number;
  const stop = position.stopPrice as number;

  return {
    symbol: position.symbol,
    qty: position.qty,
    entryDate: position.entryDate,
    entryPrice: position.entryPrice,
    stopPrice: position.stopPrice,
    markPrice: position.markPrice,
    netPnlIfClosedPaise: accounting.netPnlPaise,
    exitChargesPaise: exitCharges,
    // Already below the stop means the stop has not had a session to fire in
    // yet — a gap through it overnight. Reported as zero room rather than as a
    // negative distance, which would read as though there were headroom.
    roomToStopPercent: mark <= 0 ? 0 : Math.max(0, ((mark - stop) / mark) * 100),
  };
}

/**
 * Sessions in the window, drawn from the instruments' own bars.
 *
 * Deliberately not computed from the trading calendar. A calendar says which
 * days the exchange *should* have been open; the bars say which days it
 * actually printed prices — including the Saturday budget sessions and Diwali
 * Muhurat trading that a naive weekday rule misses. Where the two disagree, the
 * data is right.
 */
export function sessionsInWindow(
  series: Record<string, readonly Bar[]>,
  startedOn: IsoDate,
): IsoDate[] {
  const dates = new Set<IsoDate>();
  for (const bars of Object.values(series)) {
    for (const bar of bars) if (bar.date >= startedOn) dates.add(bar.date);
  }
  return [...dates].sort();
}

/**
 * Where a forward test stands right now.
 *
 * `series` must include warm-up history *before* `startedOn` — an SMA(50) needs
 * fifty sessions in front of it, and those are bars the test may read but must
 * not trade on. `tradeFrom` is what keeps that distinction honest.
 */
export function evaluateForwardTest(input: {
  params: ForwardTestParams;
  series: Record<string, readonly Bar[]>;
  lotSizes?: Record<string, number>;
}): ForwardTestProgress {
  const { params } = input;

  if (params.plannedSessions < 1) {
    throw new ForwardTestError("a forward test needs at least one planned session");
  }

  // Two frozen copies of one number: the `forward_tests` row records what the
  // advisor committed, and the definition is what the engine funds positions
  // from. They are written from the same value when the window opens, so a
  // disagreement means one of them has drifted — and every figure below would
  // then be a percentage of one capital computed from a curve built on the
  // other. Refusing beats reporting.
  if (params.initialCapitalPaise !== params.definition.initialCapitalPaise) {
    throw new ForwardTestError(
      `frozen capital ${params.initialCapitalPaise} does not match the strategy version's ` +
        `${params.definition.initialCapitalPaise}`,
    );
  }

  const sessions = sessionsInWindow(input.series, params.startedOn);
  if (sessions.length === 0) {
    throw new ForwardTestError(`no sessions have been recorded since ${params.startedOn}`);
  }

  const sessionsElapsed = Math.min(sessions.length, params.plannedSessions);
  const isComplete = sessions.length >= params.plannedSessions;

  // The window closes on its planned last session, not on whatever the newest
  // bar happens to be. A test still running must not force-close its positions
  // merely because today is the most recent session anyone has data for.
  const finalSessionDate = isComplete ? sessions[params.plannedSessions - 1] : null;

  const outcome = runBacktest({
    definition: params.definition,
    series: input.series,
    costModel: params.costModel,
    lotSizes: input.lotSizes,
    tradeFrom: params.startedOn,
    closeOutOn: finalSessionDate,
  });

  return {
    sessionsElapsed,
    sessionsRemaining: Math.max(params.plannedSessions - sessions.length, 0),
    isComplete,
    finalSessionDate,
    trades: outcome.trades,
    openPositions: outcome.openPositions,
    equityCurve: outcome.equityCurve,
    metrics: outcome.metrics,
    standing: standingOf({
      costModel: params.costModel,
      initialCapitalPaise: params.initialCapitalPaise,
      plannedSessions: params.plannedSessions,
      sessionsElapsed,
      isComplete,
      trades: outcome.trades,
      openPositions: outcome.openPositions,
      equityCurve: outcome.equityCurve,
    }),
  };
}

// ---------------------------------------------------------------------------
// Reconciling the replay against what is already recorded
// ---------------------------------------------------------------------------

export type LedgerDiff = {
  /** Round trips the replay produced that have no row yet, written complete. */
  toOpen: ExecutedTrade[];
  /** Positions the replay is holding that have no row yet, written entry-only. */
  toEnter: OpenPositionAtEnd[];
  /** Recorded rows still open that the replay says have now closed. */
  toClose: Array<{ recorded: RecordedTrade; trade: ExecutedTrade }>;
  /**
   * Rows the ledger holds that the replay does not produce.
   *
   * Always empty in normal operation, and never acted on — `paper_trades` is
   * append-only, so there is no correction to apply. A non-empty list means the
   * replay and the record disagree about history, which is a bug worth stopping
   * for rather than papering over.
   */
  unexplained: RecordedTrade[];
};

/**
 * What the evening job should write.
 *
 * Three cases, because a position's life can straddle a run of the job:
 *
 *   - it opened since the last run and is still open → insert an entry-only row
 *   - it was already recorded open and has since closed → write the exit
 *   - it opened *and* closed between two runs → insert one complete row, since
 *     the close-once trigger permits `NULL → value` but not a second write
 *
 * Matching is by `(symbol, entryDate)`. Only one position per instrument is open
 * at a time, so a symbol cannot have two entries on one session and that pair
 * identifies a trade without needing an id the replay does not have.
 */
export function diffAgainstLedger(
  replayed: readonly ExecutedTrade[],
  replayedOpen: readonly OpenPositionAtEnd[],
  recorded: readonly RecordedTrade[],
): LedgerDiff {
  const key = (symbol: string, entryDate: IsoDate) => `${symbol}@${entryDate}`;

  const recordedByKey = new Map(recorded.map((t) => [key(t.symbol, t.entryDate), t]));
  const stillOpenInLedger = new Set(
    recorded.filter((t) => t.exitDate === null).map((t) => key(t.symbol, t.entryDate)),
  );

  const toOpen: ExecutedTrade[] = [];
  const toEnter: OpenPositionAtEnd[] = [];
  const toClose: LedgerDiff["toClose"] = [];
  const explained = new Set<string>();

  for (const trade of replayed) {
    const k = key(trade.symbol, trade.entryDate);
    explained.add(k);

    if (!recordedByKey.has(k)) {
      toOpen.push(trade); // opened and closed between two runs
    } else if (stillOpenInLedger.has(k)) {
      toClose.push({ recorded: recordedByKey.get(k)!, trade });
    }
  }

  for (const position of replayedOpen) {
    const k = key(position.symbol, position.entryDate);
    explained.add(k);
    if (!recordedByKey.has(k)) toEnter.push(position);
  }

  return {
    toOpen,
    toEnter,
    toClose,
    unexplained: recorded.filter((t) => !explained.has(key(t.symbol, t.entryDate))),
  };
}

// ---------------------------------------------------------------------------
// Reading the ledger on its own
// ---------------------------------------------------------------------------

/** A `paper_trades` row, with what it costs to summarise it. */
export type LedgerRow = RecordedTrade & { netPnlPaise: number | null };

export type LedgerSummary = {
  closed: number;
  open: number;
  winners: number;
  losers: number;
  /** Closed at exactly break-even. Neither a win nor a loss; counted as such. */
  scratches: number;
  /**
   * Closed rows with no net recorded.
   *
   * Should always be zero — the job writes the exit and the accounting in one
   * statement. Surfaced rather than treated as ₹0, because a missing figure
   * silently summed as zero is a wrong total that looks like a right one.
   */
  unpriced: number;
  /** Sum over closed rows that have a net. Settled money, nothing marked. */
  realisedNetPnlPaise: number;
  firstEntryDate: IsoDate | null;
  lastExitDate: IsoDate | null;
};

/**
 * What the ledger alone says, with no replay.
 *
 * The console replays for a running test, because a curve needs sessions the
 * ledger does not store. An **abandoned** test is different: replaying it would
 * walk the sessions that printed after the advisor stopped, and report trades
 * from a window they had already withdrawn from. What actually happened before
 * they stopped is what `paper_trades` holds, so that is what gets shown
 * (`x-wealth-product.md` §5.2 — abandonment is a result, not a gap).
 */
export function summariseLedger(rows: readonly LedgerRow[]): LedgerSummary {
  let closed = 0;
  let open = 0;
  let winners = 0;
  let losers = 0;
  let scratches = 0;
  let unpriced = 0;
  let realisedNetPnlPaise = 0;
  let firstEntryDate: IsoDate | null = null;
  let lastExitDate: IsoDate | null = null;

  for (const row of rows) {
    if (firstEntryDate === null || row.entryDate < firstEntryDate) firstEntryDate = row.entryDate;

    if (row.exitDate === null) {
      open++;
      continue;
    }

    closed++;
    if (lastExitDate === null || row.exitDate > lastExitDate) lastExitDate = row.exitDate;

    if (row.netPnlPaise === null) {
      unpriced++;
      continue;
    }

    realisedNetPnlPaise += row.netPnlPaise;
    if (row.netPnlPaise > 0) winners++;
    else if (row.netPnlPaise < 0) losers++;
    else scratches++;
  }

  return {
    closed,
    open,
    winners,
    losers,
    scratches,
    unpriced,
    realisedNetPnlPaise,
    firstEntryDate,
    lastExitDate,
  };
}

/**
 * The planned end date, for display while a test is running.
 *
 * An estimate, and labelled as one wherever it is shown. It counts forward on
 * the trading calendar, and the calendar is only as good as the holiday list
 * behind it — the real end is whichever session actually turns out to be the
 * sixtieth, which is settled by the bars rather than by arithmetic.
 */
export function estimatedEndDate(
  startedOn: IsoDate,
  plannedSessions: number,
  calendar: TradingCalendar,
  addSessions: (date: IsoDate, count: number, calendar: TradingCalendar) => IsoDate,
): IsoDate {
  return addSessions(startedOn, plannedSessions - 1, calendar);
}
