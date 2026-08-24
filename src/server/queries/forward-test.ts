import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { forwardTests, paperTrades, strategies, strategyVersions } from "@/db/schema";

/**
 * Reads for the forward-test screens and the evening job.
 *
 * No `"use server"`, deliberately — see the note in `queries/backtest.ts`. Every
 * export of a `"use server"` file becomes a callable POST endpoint, and a read
 * that takes an advisor id as an argument would let anyone pass someone else's.
 * These are called from Server Components and from a script, both of which have
 * already established who is asking.
 */

/** A running test and everything frozen on it, for the job. Not advisor-scoped. */
export async function listRunningForwardTests() {
  return db()
    .select({
      test: forwardTests,
      definition: strategyVersions.definition,
      strategyId: strategies.id,
      strategyName: strategies.name,
      versionNo: strategyVersions.versionNo,
      advisorId: strategies.advisorId,
    })
    .from(forwardTests)
    .innerJoin(strategyVersions, eq(strategyVersions.id, forwardTests.strategyVersionId))
    .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
    .where(eq(forwardTests.status, "RUNNING"))
    .orderBy(asc(forwardTests.startedAt));
}

/** Every paper trade on a test, oldest entry first. */
export async function tradesForForwardTest(forwardTestId: string) {
  return db()
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.forwardTestId, forwardTestId))
    .orderBy(asc(paperTrades.entryAt), asc(paperTrades.createdAt));
}

/** One test with its strategy, scoped to the advisor who owns it. */
export async function loadForwardTestForAdvisor(forwardTestId: string, advisorId: string) {
  const [row] = await db()
    .select({
      test: forwardTests,
      definition: strategyVersions.definition,
      versionNo: strategyVersions.versionNo,
      strategyId: strategies.id,
      strategyName: strategies.name,
    })
    .from(forwardTests)
    .innerJoin(strategyVersions, eq(strategyVersions.id, forwardTests.strategyVersionId))
    .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
    // Ownership in the WHERE clause rather than checked afterwards: another
    // advisor's test is not found, rather than found and then refused.
    .where(and(eq(forwardTests.id, forwardTestId), eq(strategies.advisorId, advisorId)))
    .limit(1);

  return row ?? null;
}

/**
 * Every forward test on a strategy — running, completed and abandoned alike.
 *
 * No filter and no way to add one. An abandoned test is not a failure state to
 * be tidied away; it is the denominator that makes a completed one mean
 * something (`x-wealth-product.md` §5.2, PRD §5.6).
 */
export async function listForwardTestsForStrategy(strategyId: string, advisorId: string) {
  return db()
    .select({ test: forwardTests, versionNo: strategyVersions.versionNo })
    .from(forwardTests)
    .innerJoin(strategyVersions, eq(strategyVersions.id, forwardTests.strategyVersionId))
    .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
    .where(and(eq(strategyVersions.strategyId, strategyId), eq(strategies.advisorId, advisorId)))
    .orderBy(desc(forwardTests.createdAt));
}
