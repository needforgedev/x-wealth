import { desc, eq } from "drizzle-orm";

import { db, type Database } from "@/db";
import { backtestRuns, forwardTests, strategies, strategyVersions } from "@/db/schema";
import type { RunResults } from "@/db/schema";

/**
 * The iteration ledger. `CLAUDE.md` §7.14, `plan.md` W8.
 *
 * > Every version, every abandoned test, every failed window — permanently
 * > visible to the user on their own profile. *"12 forward tests run; 3 live,
 * > 9 abandoned."*
 *
 * ## The counts are the point, and the denominator is the product
 *
 * A completed forward test means nothing without the abandoned ones beside it.
 * Nine abandonments and three completions is a person testing honestly; nine
 * completions and no abandonments is either extraordinary luck or a standard
 * that never bit. `MET-01` watches that ratio across all users for exactly this
 * reason — *if it approaches 1:0, our standards are theatre* — and this screen
 * is where an individual sees their own.
 *
 * ## No filter, and no parameter that could become one
 *
 * These functions take a user id and nothing else. There is no status argument,
 * no sort option, no limit, no `includeAbandoned` flag — not because nobody has
 * asked for one yet, but because `W8-04` makes the *absence of the parameter*
 * the guarantee. A read that could be asked for the flattering subset is one
 * refactor away from being asked for it by default.
 *
 * ## The executor argument is not a filter
 *
 * Both functions take an optional database handle, defaulting to the pooled
 * one, so a verification script can read them inside a transaction it rolls
 * back. It is deliberately the *second* parameter with a default, which leaves
 * `Function.length` at 1 — `verify-ledger` asserts that, because the guarantee
 * in `W8-04` is the absence of anything that could narrow the result, and a
 * handle cannot.
 *
 * ## Private
 *
 * §8.5. Every query here is scoped to one `users.id` in the WHERE clause, and
 * that id comes from the session rather than from an argument on the wire —
 * these are plain functions with no `"use server"` directive, reachable only
 * from a Server Component that has already established who is asking.
 */

export type LedgerCounts = {
  strategies: number;
  versions: number;
  backtests: number;
  forwardTestsStarted: number;
  running: number;
  completed: number;
  abandoned: number;
};

export type LedgerForwardTest = {
  id: string;
  strategyId: string;
  strategyName: string;
  versionNo: number;
  status: string;
  outcome: string | null;
  abandonReason: string | null;
  declaredHypothesis: string;
  plannedSessions: number;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  /**
   * Settled figures, and **only** for a test that has ended.
   *
   * `W8-07`, and the trap it exists to close: a *running* test has two
   * net-return numbers, and `metrics` — the one every other screen reaches for
   * — values open positions without paying the exit charges they have not yet
   * paid. On a running test the only figure that may be shown comes from
   * `standing`, which is computed by replaying the window and is far too
   * expensive to do once per row here.
   *
   * So this is null while a test runs, and the ledger prints no number for it.
   * That is not a gap: a percentage in a list of outcomes reads as an outcome,
   * whatever badge sits beside it, and a running test does not have one yet.
   */
  finalResults: RunResults | null;
};

/** A live handle or an open transaction — the same seam `advance.ts` uses. */
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

export async function ledgerCounts(
  userId: string,
  database: Executor = db(),
): Promise<LedgerCounts> {

  const [strategyRows, versionRows, backtestRows, testRows] = await Promise.all([
    database.select({ id: strategies.id }).from(strategies).where(eq(strategies.userId, userId)),

    database
      .select({ id: strategyVersions.id })
      .from(strategyVersions)
      .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
      .where(eq(strategies.userId, userId)),

    database
      .select({ id: backtestRuns.id })
      .from(backtestRuns)
      .innerJoin(strategyVersions, eq(strategyVersions.id, backtestRuns.strategyVersionId))
      .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
      .where(eq(strategies.userId, userId)),

    database
      .select({ status: forwardTests.status })
      .from(forwardTests)
      .innerJoin(strategyVersions, eq(strategyVersions.id, forwardTests.strategyVersionId))
      .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
      .where(eq(strategies.userId, userId)),
  ]);

  /**
   * A `DRAFT` row is counted as started.
   *
   * There is no screen on which a forward test sits in `DRAFT` — it is created
   * and moved to `RUNNING` in the same transaction, and is a draft only for the
   * microseconds between two statements. A row stuck there is a crash between
   * them, and hiding it from the count would make an interrupted start
   * disappear from a record whose whole claim is that nothing disappears.
   */
  return {
    strategies: strategyRows.length,
    versions: versionRows.length,
    backtests: backtestRows.length,
    forwardTestsStarted: testRows.length,
    running: testRows.filter((t) => t.status === "RUNNING" || t.status === "DRAFT").length,
    completed: testRows.filter((t) => t.status === "COMPLETED").length,
    abandoned: testRows.filter((t) => t.status === "ABANDONED").length,
  };
}

/**
 * Every forward test this user has ever started, newest first.
 *
 * Across all strategies, in one list, with no way to narrow it. An abandoned
 * window is not a failure state to be tidied away — it is the thing that makes
 * a completed one mean something.
 */
export async function ledgerForwardTests(
  userId: string,
  database: Executor = db(),
): Promise<LedgerForwardTest[]> {
  const rows = await database
    .select({
      id: forwardTests.id,
      strategyId: strategies.id,
      strategyName: strategies.name,
      versionNo: strategyVersions.versionNo,
      status: forwardTests.status,
      outcome: forwardTests.outcome,
      abandonReason: forwardTests.abandonReason,
      declaredHypothesis: forwardTests.declaredHypothesis,
      plannedSessions: forwardTests.plannedSessions,
      startedAt: forwardTests.startedAt,
      endedAt: forwardTests.endedAt,
      createdAt: forwardTests.createdAt,
      finalResults: forwardTests.finalResults,
    })
    .from(forwardTests)
    .innerJoin(strategyVersions, eq(strategyVersions.id, forwardTests.strategyVersionId))
    .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
    .where(eq(strategies.userId, userId))
    .orderBy(desc(forwardTests.createdAt));

  return rows.map((row) => ({
    ...row,
    // Never `metrics`, and never a figure for a test still running. See the
    // note on `LedgerForwardTest.finalResults`.
    finalResults: row.status === "COMPLETED" || row.status === "ABANDONED" ? row.finalResults : null,
  }));
}
