import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@/db";
import { forwardTests, paperTrades } from "@/db/schema";
import type { CostModel } from "@/domain/costs";
import { diffAgainstLedger, ForwardTestError } from "@/domain/forward-test";
import type { MarketDataSource } from "@/domain/market-data";
import { priceTicks, priceToString } from "@/domain/money";
import type { StrategyDefinition } from "@/domain/strategy";
import { replayForwardTest } from "./replay";

/**
 * Advancing one forward test — the part that writes.
 *
 * Extracted from the evening script so it can be exercised inside a
 * transaction that is rolled back. `paper_trades` and `forward_tests` are
 * append-only: a bug here cannot be corrected afterwards, only appended to. An
 * untested write path against tables like that is the one place in this system
 * where "we'll fix it in the next deploy" is not available.
 *
 * Takes a database handle rather than reaching for one, so the caller decides
 * whether the work commits.
 */

/** The subset of a `forward_tests` row this needs. */
export type RunningTest = {
  id: string;
  startedAt: Date | null;
  plannedSessions: number;
  initialCapitalPaise: number;
  costModel: unknown;
};

export type AdvanceResult =
  | { status: "HALTED"; reason: string; unexplained: number }
  /** Started, but no session has printed inside the window yet. */
  | { status: "PENDING"; startedOn: string }
  | {
      status: "ADVANCED";
      sessionsElapsed: number;
      entriesWritten: number;
      exitsWritten: number;
      completed: boolean;
      netReturnPercent: number;
    };

/**
 * A live database handle or an open transaction — both can run these
 * statements, and the caller decides which, so a verification run can do the
 * real writes and then roll them back.
 */
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

export async function advanceForwardTest(input: {
  tx: Executor;
  test: RunningTest;
  definition: StrategyDefinition;
  source: MarketDataSource;
  recorded: Array<{ symbol: string; qty: number; entryAt: Date; exitAt: Date | null }>;
  dryRun?: boolean;
}): Promise<AdvanceResult> {
  const { tx, test, definition, source } = input;

  if (!test.startedAt) {
    return { status: "HALTED", reason: "RUNNING with no start date", unexplained: 0 };
  }
  const startedOn = test.startedAt.toISOString().slice(0, 10);

  // The same call the console makes, so what gets written and what gets shown
  // cannot disagree. See `replay.ts`.
  let progress;
  try {
    progress = await replayForwardTest({
      startedOn,
      plannedSessions: test.plannedSessions,
      initialCapitalPaise: test.initialCapitalPaise,
      costModel: test.costModel as CostModel,
      definition,
      source,
    });
  } catch (error) {
    // Every forward test is in this state on the day it is created: the window
    // opens on the next session, and that session has not printed yet. Treating
    // it as a halt would fail the evening job nightly until the market next
    // opens, which is how a real alarm gets ignored.
    if (error instanceof ForwardTestError && error.code === "WINDOW_NOT_OPEN") {
      return { status: "PENDING", startedOn };
    }
    throw error;
  }

  const ledger = input.recorded.map((t) => ({
    symbol: t.symbol,
    qty: t.qty,
    entryDate: t.entryAt.toISOString().slice(0, 10),
    exitDate: t.exitAt ? t.exitAt.toISOString().slice(0, 10) : null,
  }));

  const diff = diffAgainstLedger(progress.trades, progress.openPositions, ledger);

  // A recorded trade the replay cannot account for means the ledger and the
  // engine disagree about history. There is no correction to apply against an
  // append-only table, and writing more on top would bury the disagreement.
  if (diff.unexplained.length > 0) {
    return {
      status: "HALTED",
      reason: "recorded trades the replay does not produce",
      unexplained: diff.unexplained.length,
    };
  }

  const entriesWritten = diff.toOpen.length + diff.toEnter.length;

  if (!input.dryRun) {
    // Opened since the last run and still open: entry only, exit columns left
    // NULL for the close-once trigger to fill in later.
    for (const position of diff.toEnter) {
      await tx.insert(paperTrades).values({
        forwardTestId: test.id,
        symbol: position.symbol,
        side: "BUY",
        qty: position.qty,
        entryPrice: priceToString(priceTicks(position.entryPrice)),
        entryAt: new Date(`${position.entryDate}T00:00:00Z`),
      });
    }

    // Opened *and* closed between two runs — a stop firing on the entry
    // session, most often. One insert, because the trigger permits NULL → value
    // but not a second write over a value already there.
    for (const trade of diff.toOpen) {
      await tx.insert(paperTrades).values({
        forwardTestId: test.id,
        symbol: trade.symbol,
        side: "BUY",
        qty: trade.qty,
        entryPrice: priceToString(priceTicks(trade.entryPrice)),
        entryAt: new Date(`${trade.entryDate}T00:00:00Z`),
        exitPrice: priceToString(priceTicks(trade.exitPrice)),
        exitAt: new Date(`${trade.exitDate}T00:00:00Z`),
        grossPnlPaise: trade.grossPnlPaise,
        costsBreakdown: trade.costs,
        netPnlPaise: trade.netPnlPaise,
      });
    }

    for (const { recorded, trade } of diff.toClose) {
      await tx
        .update(paperTrades)
        .set({
          exitPrice: priceToString(priceTicks(trade.exitPrice)),
          exitAt: new Date(`${trade.exitDate}T00:00:00Z`),
          grossPnlPaise: trade.grossPnlPaise,
          costsBreakdown: trade.costs,
          netPnlPaise: trade.netPnlPaise,
        })
        .where(
          and(
            eq(paperTrades.forwardTestId, test.id),
            eq(paperTrades.symbol, recorded.symbol),
            eq(paperTrades.entryAt, new Date(`${recorded.entryDate}T00:00:00Z`)),
            // Only ever an open row. Belt and braces against the trigger, which
            // would refuse a second close anyway.
            isNull(paperTrades.exitAt),
          ),
        );
    }

    if (progress.isComplete) {
      // Written once. The trigger refuses any attempt to write it again, which
      // is what makes a completed result a permanent one.
      await tx
        .update(forwardTests)
        .set({
          status: "COMPLETED",
          outcome: "COMPLETED",
          endedAt: new Date(`${progress.finalSessionDate}T00:00:00Z`),
          finalResults: { ...progress.metrics, equityCurve: progress.equityCurve },
        })
        .where(eq(forwardTests.id, test.id));
    }
  }

  return {
    status: "ADVANCED",
    sessionsElapsed: progress.sessionsElapsed,
    entriesWritten,
    exitsWritten: diff.toClose.length,
    completed: progress.isComplete,
    netReturnPercent: progress.metrics.netReturnPercent,
  };
}
