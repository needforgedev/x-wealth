"use server";

import { revalidatePath } from "next/cache";

import { tunableParameters } from "@/domain/adversarial";
import {
  CRITIQUE_PROMPT_VERSION,
  buildCritiqueInput,
  validateCritique,
  type CritiqueFacts,
  type CritiqueView,
} from "@/domain/critique";
import type { CostModel } from "@/domain/costs";
import {
  describeCondition,
  describeSizing,
  resolveDefinition,
  type StrategyDefinition,
} from "@/domain/strategy";
import { runInteraction } from "@/server/ai";
import { NotAuthorisedError, requireUser } from "@/server/identity";
import { latestReportForRun } from "@/server/queries/adversarial";
import { latestCritiqueForRun, loadRunForUser } from "@/server/queries/backtest";

import type { ActionResult } from "./auth";

/**
 * The critique of one recorded backtest run. `plan.md` W7-03…07.
 *
 * The same posture as the post-mortem action, one record type over: read-only
 * by construction (no strategy imports, no `@/db`, the interaction log is the
 * only write and `runInteraction` owns it — pinned by `critique.test.ts`,
 * W7-10), the first live answer under the current prompt version is what
 * every later press returns, and an answer that fails the no-verdict gate is
 * recorded but never rendered.
 */

export type CritiqueResponse = {
  readonly interactionId: string;
  readonly modelId: string;
  /** False when no provider is configured — the screen says so and stops. */
  readonly live: boolean;
  /** True when an already-recorded critique was returned unchanged. */
  readonly reused: boolean;
  readonly view: CritiqueView | null;
};

export async function runCritique(input: {
  backtestRunId: string;
}): Promise<ActionResult<CritiqueResponse>> {
  try {
    const { user } = await requireUser();

    const row = await loadRunForUser(input.backtestRunId, user.id);
    if (!row) return { ok: false, error: "No such backtest run." };

    const facts = await assembleFacts({ row, userId: user.id });

    const existing = await latestCritiqueForRun(input.backtestRunId, user.id);
    if (existing && existing.promptVersion === CRITIQUE_PROMPT_VERSION) {
      const validated = validateCritique(existing.output);
      if (validated.status === "VALID") {
        return {
          ok: true,
          data: {
            interactionId: existing.id,
            modelId: existing.modelId,
            live: true,
            reused: true,
            view: validated.view,
          },
        };
      }
    }

    const logged = await runInteraction({
      userId: user.id,
      contextType: "CRITIQUE",
      promptVersion: CRITIQUE_PROMPT_VERSION,
      input: buildCritiqueInput(facts),
      // Migration 0016: a critique names its version, or the insert is refused.
      subject: { strategyVersionId: row.run.strategyVersionId },
    });

    const live = !logged.modelId.startsWith("stub");
    if (!live) {
      return {
        ok: true,
        data: {
          interactionId: logged.interactionId,
          modelId: logged.modelId,
          live: false,
          reused: false,
          view: null,
        },
      };
    }

    const validated = validateCritique(logged.output);
    if (validated.status === "INVALID") {
      return {
        ok: false,
        error:
          "The model's answer did not pass the no-verdict gate and was not shown. " +
          "The call is on the record; run it again.",
      };
    }

    revalidatePath(`/backtests/${input.backtestRunId}`);
    return {
      ok: true,
      data: {
        interactionId: logged.interactionId,
        modelId: logged.modelId,
        live: true,
        reused: false,
        view: validated.view,
      },
    };
  } catch (error) {
    if (error instanceof NotAuthorisedError) return { ok: false, error: "Sign in first." };
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The critique could not be run.",
    };
  }
}

/**
 * Every figure the model sees, read from the record — the run's own results,
 * the parameter list the sensitivity sweep enumerates, and the latest attack
 * report where one exists. Nothing here computes a new number.
 */
async function assembleFacts(input: {
  row: NonNullable<Awaited<ReturnType<typeof loadRunForUser>>>;
  userId: string;
}): Promise<CritiqueFacts> {
  const { run } = input.row;
  const definition = input.row.definition as StrategyDefinition;
  const rules = resolveDefinition(definition);
  const costModel = run.costModel as CostModel;

  const results = run.results as unknown as {
    netReturnPercent?: number;
    grossReturnPercent?: number;
    totalCostsPaise?: number;
    tradeCount?: number;
    hitRatePercent?: number;
    maxDrawdownPercent?: number;
    avgWinPaise?: number;
    avgLossPaise?: number;
    expectancyPaise?: number;
    profitFactor?: number | null;
    longestLosingStreak?: number;
    topTradeSharePercent?: number | null;
    exposurePercent?: number;
    sampleAdequate?: boolean;
  };

  const parameters = tunableParameters(definition).map((p) => ({
    label: p.label,
    value: p.value,
  }));

  const report = await latestReportForRun(run.id, input.userId);
  const findings = (report?.findings ?? null) as Array<{
    attack: string;
    severity: string;
    observation: string;
  }> | null;

  return {
    backtestRunId: run.id,
    period: { start: isoDate(run.periodStart), end: isoDate(run.periodEnd) },
    initialCapitalPaise: run.initialCapitalPaise,
    rules: {
      entry: describeCondition(rules.entry),
      exit: describeCondition(rules.exit),
      stopLoss: `${rules.stopLossPercent}% below entry`,
      target: rules.targetPercent === null ? null : `${rules.targetPercent}% above entry`,
      sizing: describeSizing(rules.sizing),
      instruments: rules.instruments,
      timeframe: definition.timeframe ?? "DAILY",
    },
    parameters,
    parameterCount: parameters.length,
    results: {
      netReturnPercent: results.netReturnPercent ?? 0,
      grossReturnPercent: results.grossReturnPercent ?? null,
      totalCostsPaise: results.totalCostsPaise ?? null,
      tradeCount: results.tradeCount ?? 0,
      hitRatePercent: results.hitRatePercent ?? null,
      maxDrawdownPercent: results.maxDrawdownPercent ?? 0,
      avgWinPaise: results.avgWinPaise ?? null,
      avgLossPaise: results.avgLossPaise ?? null,
      expectancyPaise: results.expectancyPaise ?? null,
      profitFactor: results.profitFactor ?? null,
      longestLosingStreak: results.longestLosingStreak ?? null,
      topTradeSharePercent: results.topTradeSharePercent ?? null,
      exposurePercent: results.exposurePercent ?? null,
      // §8.12 — absent reads as inadequate, never as fine.
      sampleAdequate: results.sampleAdequate ?? false,
    },
    costs: { segment: costModel.segment, slippagePercent: costModel.slippagePercent },
    attack: report
      ? {
          suiteVersion: report.suiteVersion,
          findings: (findings ?? []).map((f) => ({
            attack: f.attack,
            severity: f.severity,
            observation: f.observation,
          })),
          attacksRun: (report.attacksRun ?? []) as string[],
          attacksSkipped: ((report.attacksSkipped ?? []) as Array<{
            attack: string;
            reason: string;
          }>).map((s) => ({ attack: s.attack, reason: s.reason })),
        }
      : null,
  };
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
