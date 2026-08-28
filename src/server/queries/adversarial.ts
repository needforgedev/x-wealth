import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { adversarialReports, backtestRuns, strategies, strategyVersions } from "@/db/schema";

/**
 * Reads for the attack report.
 *
 * **No `"use server"`, deliberately** — the same reason as
 * `src/server/queries/backtest.ts`. Every export of a `"use server"` file
 * becomes a callable POST endpoint, so a read taking a user id as an argument
 * would be an access-control hole with a polite signature.
 *
 * Ownership sits in the WHERE clause rather than in a check afterwards, so a
 * report belonging to somebody else is *not found* rather than found and then
 * refused.
 */

/**
 * The most recent report for a run.
 *
 * Most recent rather than "the" report, because `adversarial_reports` is unique
 * on `(run, suite_version, seed)` and not on run alone: re-attacking after the
 * suite changes appends a second report, and both stay. What must never appear
 * here is a filter — a reader who could ask for the *friendliest* report has
 * been given the retry loop the product exists to remove.
 */
export async function latestReportForRun(runId: string, userId: string) {
  const [row] = await db()
    .select({ report: adversarialReports })
    .from(adversarialReports)
    .innerJoin(backtestRuns, eq(backtestRuns.id, adversarialReports.backtestRunId))
    .innerJoin(strategyVersions, eq(strategyVersions.id, backtestRuns.strategyVersionId))
    .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
    .where(and(eq(adversarialReports.backtestRunId, runId), eq(strategies.userId, userId)))
    .orderBy(desc(adversarialReports.createdAt))
    .limit(1);

  return row?.report ?? null;
}

/**
 * Every report ever written for a run, oldest first.
 *
 * No filtering, no "latest only" toggle, no way to hide one — the same rule
 * `listRunsForStrategy` follows. A report from an older suite version stays
 * visible next to the newer one; that a finding was later downgraded by a
 * changed suite is itself information.
 */
export async function listReportsForRun(runId: string, userId: string) {
  return db()
    .select({ report: adversarialReports })
    .from(adversarialReports)
    .innerJoin(backtestRuns, eq(backtestRuns.id, adversarialReports.backtestRunId))
    .innerJoin(strategyVersions, eq(strategyVersions.id, backtestRuns.strategyVersionId))
    .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
    .where(and(eq(adversarialReports.backtestRunId, runId), eq(strategies.userId, userId)))
    .orderBy(adversarialReports.createdAt);
}
