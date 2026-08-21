"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { backtestRuns, strategies, strategyVersions } from "@/db/schema";
import { runBacktest, type BacktestOutcome } from "@/domain/backtest";
import { ZERO_BROKERAGE, nseEquityDelivery } from "@/domain/costs";
import type { Bar } from "@/domain/market-data";
import { buildMethodology } from "@/domain/methodology";
import { validateStrategyDefinition, type StrategyDefinition } from "@/domain/strategy";
import { toSymbol } from "@/domain/symbol";
import { loadCatalogue } from "@/server/market-data/catalogue";
import { liveEndOfDaySource } from "@/server/market-data/db-store";
import { NotAuthorisedError, requirePublishingRights } from "@/server/identity";
import type { ActionResult } from "@/server/actions/auth";

/**
 * Running a backtest, and recording it permanently.
 *
 * `backtest_runs` is append-only (`x-wealth-product.md` §5.1). A run cannot be
 * deleted, re-run in place, or hidden — which is the point. An advisor who
 * dislikes a result appends another run; the first one stays, and the iteration
 * ledger shows both.
 *
 * The advisor does not choose a cost model. §5.3 is explicit that costs are
 * structural and that there must be no code path producing a gross figure, so
 * the model is applied by the platform rather than offered as a setting. The
 * only parameter is the slippage assumption, and it is recorded in the run.
 *
 * Only the mutation lives here. Every export of a `"use server"` file becomes a
 * callable POST endpoint, so a read taking an advisor id as an argument would
 * be an access-control hole — those are in `src/server/queries/backtest.ts`,
 * which has no directive and is reachable only from a Server Component.
 */

/** Default assumption, disclosed in every run's methodology. */
const SLIPPAGE_PERCENT = 0.05;

export async function runBacktestForVersion(input: {
  strategyVersionId: string;
}): Promise<ActionResult<{ runId: string }>> {
  try {
    const { advisor } = await requirePublishingRights();

    const [row] = await db()
      .select({
        versionId: strategyVersions.id,
        definition: strategyVersions.definition,
        strategyId: strategies.id,
        advisorId: strategies.advisorId,
      })
      .from(strategyVersions)
      .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
      .where(eq(strategyVersions.id, input.strategyVersionId))
      .limit(1);

    if (!row || row.advisorId !== advisor.id) {
      throw new NotAuthorisedError("No such strategy version.");
    }

    const definition = row.definition as StrategyDefinition;

    // Re-validated here rather than trusted. A version is immutable, but the
    // catalogue is not — an instrument loaded when the strategy was authored
    // may since have been dropped, and running against it would silently
    // produce a partial result.
    const issues = validateStrategyDefinition(definition, await loadCatalogue());
    if (issues.length > 0) return { ok: false, error: issues[0].message };

    const source = await liveEndOfDaySource();

    // Everything the source holds. `period_start` is the period being
    // *reported*; the engine needs more than that in front of it so the
    // indicators can warm up, and it reports where the tradeable period began.
    const series: Record<string, readonly Bar[]> = {};
    for (const symbol of definition.instruments) {
      series[symbol] = await source.dailyBars(toSymbol(symbol), "1900-01-01", "2999-12-31");
    }

    const costModel = nseEquityDelivery({
      brokerage: ZERO_BROKERAGE,
      slippagePercent: SLIPPAGE_PERCENT,
    });

    let outcome: BacktestOutcome;
    try {
      outcome = runBacktest({ definition, series, costModel });
    } catch (error) {
      // An engine refusal is a statement about the strategy, not a system
      // fault — "these rules need more history than exists" is exactly the
      // sentence the advisor needs, so it is surfaced rather than swallowed.
      return { ok: false, error: error instanceof Error ? error.message : "The backtest could not run." };
    }

    const methodology = buildMethodology({
      source: source.metadata,
      costModel,
      warmUpBars: outcome.warmUpBars,
    });

    const [run] = await db()
      .insert(backtestRuns)
      .values({
        strategyVersionId: row.versionId,
        periodStart: new Date(`${outcome.periodStart}T00:00:00Z`),
        periodEnd: new Date(`${outcome.periodEnd}T00:00:00Z`),
        initialCapitalPaise: definition.initialCapitalPaise,
        costModel,
        results: {
          ...outcome.metrics,
          // Kept alongside the metrics so a reader can check the headline
          // figures against the trades that produced them.
          trades: outcome.trades,
          equityCurve: outcome.equityCurve,
        },
        methodology,
      })
      .returning({ id: backtestRuns.id });

    revalidatePath(`/advisor/strategies/${row.strategyId}`);
    return { ok: true, data: { runId: run.id } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

function messageFor(error: unknown): string {
  if (error instanceof NotAuthorisedError) return error.message;

  const message = error instanceof Error ? error.message : "";
  if (message.includes("append-only")) {
    console.error("[backtest] attempted to mutate a recorded run", error);
    return "That change would rewrite a recorded run, which is not allowed.";
  }
  if (message.includes("daily_bars is empty")) {
    return "No price history is loaded yet. Run the market data loader first.";
  }

  console.error("[backtest] action failed", error);
  return "Something went wrong. Try again.";
}
