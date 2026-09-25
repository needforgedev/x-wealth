import { and, asc, desc, eq, notIlike, sql } from "drizzle-orm";

import { db } from "@/db";
import { aiInteractions, backtestRuns, strategies, strategyVersions } from "@/db/schema";

/**
 * Reads for the backtest screens.
 *
 * **Deliberately not in `src/server/actions/`, and deliberately without
 * `"use server"`.** Every export of a `"use server"` file is compiled into a
 * callable endpoint — an action id plus a POST route that anyone able to send
 * the request can reach. A read like `loadRunForUser(runId, userId)`
 * living there would be an access-control hole with a polite signature: the
 * caller supplies the advisor id, so supplying somebody else's would return
 * somebody else's results.
 *
 * These are plain async functions. They are only ever called from Server
 * Components that have already established who is asking, and the identity is
 * passed in rather than trusted from an argument on the wire.
 */

/**
 * A run with the strategy and version it belongs to, scoped to one advisor.
 *
 * The ownership predicate is in the WHERE clause, not a check afterwards, so a
 * run belonging to another advisor is *not found* rather than found and then
 * refused — no difference to the caller, and nothing leaked by timing or by an
 * error message that distinguishes the two.
 */
export async function loadRunForUser(runId: string, userId: string) {
  const [row] = await db()
    .select({
      run: backtestRuns,
      strategyId: strategies.id,
      strategyName: strategies.name,
      versionNo: strategyVersions.versionNo,
      definition: strategyVersions.definition,
      hypothesis: strategyVersions.hypothesisText,
    })
    .from(backtestRuns)
    .innerJoin(strategyVersions, eq(strategyVersions.id, backtestRuns.strategyVersionId))
    .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
    .where(and(eq(backtestRuns.id, runId), eq(strategies.userId, userId)))
    .limit(1);

  return row ?? null;
}

/**
 * Every run across every version of a strategy.
 *
 * No filter, no "latest only", no way to hide one. `backtest_runs` is
 * append-only and this is the read that makes that visible — an advisor who
 * dislikes a result appends another run, and both stay on the record
 * (`CLAUDE.md` §8.1, PRD §5.6).
 */
export async function listRunsForStrategy(strategyId: string, userId: string) {
  return db()
    .select({
      run: backtestRuns,
      versionNo: strategyVersions.versionNo,
    })
    .from(backtestRuns)
    .innerJoin(strategyVersions, eq(strategyVersions.id, backtestRuns.strategyVersionId))
    .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
    .where(and(eq(strategyVersions.strategyId, strategyId), eq(strategies.userId, userId)))
    .orderBy(asc(strategyVersions.versionNo), desc(backtestRuns.createdAt));
}

/**
 * The most recent run of one version, scoped to its owner.
 *
 * The post-mortem reads it for the forward-versus-backtest comparison — the
 * product's central claim — so it wants the latest statement the engine made
 * about this exact rule set, not the best one and not an aggregate.
 */
export async function latestRunForVersion(strategyVersionId: string, userId: string) {
  const [row] = await db()
    .select({
      periodStart: backtestRuns.periodStart,
      periodEnd: backtestRuns.periodEnd,
      results: backtestRuns.results,
    })
    .from(backtestRuns)
    .innerJoin(strategyVersions, eq(strategyVersions.id, backtestRuns.strategyVersionId))
    .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
    .where(and(eq(backtestRuns.strategyVersionId, strategyVersionId), eq(strategies.userId, userId)))
    .orderBy(desc(backtestRuns.createdAt))
    .limit(1);

  return row ?? null;
}

/**
 * The most recent recorded critique of one run, scoped to its owner.
 *
 * The run id lives inside `input_snapshot` rather than in a column — see
 * migration `0016` for why the generic log grows no per-context FKs — so the
 * lookup filters on the snapshot. Stub rows are skipped for the same reason
 * `latestPostMortemForTest` skips them: scripted output must never be read
 * back as a model's.
 */
export async function latestCritiqueForRun(runId: string, userId: string) {
  const [row] = await db()
    .select({
      id: aiInteractions.id,
      output: aiInteractions.output,
      modelId: aiInteractions.modelId,
      promptVersion: aiInteractions.promptVersion,
      createdAt: aiInteractions.createdAt,
    })
    .from(aiInteractions)
    .where(
      and(
        eq(aiInteractions.userId, userId),
        eq(aiInteractions.contextType, "CRITIQUE"),
        eq(sql`${aiInteractions.inputSnapshot}->>'backtestRunId'`, runId),
        notIlike(aiInteractions.modelId, "stub%"),
      ),
    )
    .orderBy(desc(aiInteractions.createdAt))
    .limit(1);

  return row ?? null;
}
