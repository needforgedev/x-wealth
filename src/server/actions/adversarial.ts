"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { adversarialReports, backtestRuns, strategies, strategyVersions } from "@/db/schema";
import { DEFAULT_SEED, SUITE_VERSION, attack } from "@/domain/adversarial";
import type { CostModel } from "@/domain/costs";
import type { Bar } from "@/domain/market-data";
import { resolveDefinition, type StrategyDefinition } from "@/domain/strategy";
import { toSymbol } from "@/domain/symbol";
import { liveEndOfDaySource } from "@/server/market-data/db-store";
import { NotAuthorisedError, requireUser } from "@/server/identity";
import type { ActionResult } from "@/server/actions/auth";

/**
 * Attacking a recorded backtest. `plan.md` W18-07, `CLAUDE.md` §7.7.
 *
 * ## Running it twice cannot produce a friendlier answer
 *
 * `adversarial_reports` is unique on `(backtest_run_id, suite_version, seed)`,
 * and the suite is deterministic with a fixed seed. So a second press returns
 * the report that already exists rather than writing a new one. That is the
 * point, not a caching optimisation: a user who could re-attack until the
 * findings looked better would have exactly the retry loop this product exists
 * to remove, and the database is where that is settled rather than the UI.
 *
 * ## Why the attack is not run automatically with every backtest
 *
 * It re-runs the engine roughly thirty times — a walk-forward split, a
 * sensitivity sweep across every tunable parameter, and eight slippage steps.
 * §11.5 is explicit that backtests are the real cost of goods and that the
 * ceiling should be on compute rather than on features, so attaching thirty
 * runs to every single backtest would be the most expensive possible default.
 *
 * The compromise is that skipping it is **visible**: the run page says a result
 * has not been attacked. Silence about missing bad news is the failure mode
 * worth avoiding; the cost is worth managing.
 *
 * Only the mutation lives here. Reads are in `src/server/queries/adversarial.ts`,
 * which has no `"use server"` directive and is reachable only from a Server
 * Component.
 */
export async function attackBacktestRun(input: {
  runId: string;
}): Promise<ActionResult<{ reportId: string; alreadyExisted: boolean }>> {
  try {
    const { user } = await requireUser();

    const [row] = await db()
      .select({
        runId: backtestRuns.id,
        costModel: backtestRuns.costModel,
        definition: strategyVersions.definition,
        strategyId: strategies.id,
        ownerId: strategies.userId,
      })
      .from(backtestRuns)
      .innerJoin(strategyVersions, eq(strategyVersions.id, backtestRuns.strategyVersionId))
      .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
      .where(eq(backtestRuns.id, input.runId))
      .limit(1);

    if (!row || row.ownerId !== user.id) {
      throw new NotAuthorisedError("No such backtest run.");
    }

    // Already attacked under this suite and seed. Returned rather than
    // re-written — see the note above.
    const [existing] = await db()
      .select({ id: adversarialReports.id })
      .from(adversarialReports)
      .where(
        and(
          eq(adversarialReports.backtestRunId, row.runId),
          eq(adversarialReports.suiteVersion, SUITE_VERSION),
          eq(adversarialReports.seed, DEFAULT_SEED),
        ),
      )
      .limit(1);

    if (existing) {
      return { ok: true, data: { reportId: existing.id, alreadyExisted: true } };
    }

    const definition = row.definition as StrategyDefinition;

    /**
     * The run's own cost model, not today's.
     *
     * A report is about a specific recorded run. Attacking it under a cost
     * model captured later would produce findings about a backtest that never
     * happened, and the report would sit in an append-only table saying so
     * forever.
     */
    const costModel = row.costModel as CostModel;

    const source = await liveEndOfDaySource();
    const series: Record<string, readonly Bar[]> = {};
    for (const symbol of resolveDefinition(definition).instruments) {
      series[symbol] = await source.dailyBars(toSymbol(symbol), "1900-01-01", "2999-12-31");
    }

    const report = attack({ definition, series, costModel, seed: DEFAULT_SEED });

    const [written] = await db()
      .insert(adversarialReports)
      .values({
        backtestRunId: row.runId,
        suiteVersion: report.suiteVersion,
        seed: report.seed,
        findings: report.findings,
        // The ranking, stored separately from the findings it ranks, so a
        // reader can see the order without parsing the evidence payloads.
        severityRanking: report.findings.map((f) => ({ attack: f.attack, severity: f.severity })),
        attacksRun: report.attacksRun,
        attacksSkipped: report.attacksSkipped,
      })
      .returning({ id: adversarialReports.id });

    revalidatePath(`/backtests/${row.runId}`);
    return { ok: true, data: { reportId: written.id, alreadyExisted: false } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

function messageFor(error: unknown): string {
  if (error instanceof NotAuthorisedError) return error.message;

  const message = error instanceof Error ? error.message : "";

  if (message.includes("adversarial_reports_run_suite_seed_key")) {
    // Two presses racing. The row that won is the report, and it is the same
    // report either way — the suite is deterministic.
    return "This run has already been attacked. Reload to see the report.";
  }
  if (message.includes("append-only")) {
    console.error("[adversarial] attempted to mutate a recorded report", error);
    return "That change would rewrite a recorded report, which is not allowed.";
  }
  if (message.includes("daily_bars is empty")) {
    return "No price history is loaded yet. Run the market data loader first.";
  }

  console.error("[adversarial] action failed", error);
  return "Something went wrong. Try again.";
}
