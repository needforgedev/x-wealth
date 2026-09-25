"use server";

import { revalidatePath } from "next/cache";

import {
  POST_MORTEM_PROMPT_VERSION,
  buildPostMortemInput,
  validatePostMortem,
  type PostMortemFacts,
  type PostMortemView,
} from "@/domain/post-mortem";
import type { CostModel } from "@/domain/costs";
import { describeCondition, describeSizing, resolveDefinition, type StrategyDefinition } from "@/domain/strategy";
import { runInteraction } from "@/server/ai";
import { NotAuthorisedError, requireUser } from "@/server/identity";
import { latestRunForVersion } from "@/server/queries/backtest";
import {
  latestPostMortemForTest,
  loadForwardTestForUser,
  tradesForForwardTest,
} from "@/server/queries/forward-test";

import type { ActionResult } from "./auth";

/**
 * The post-mortem for one completed forward test. `plan.md` W7-13.
 *
 * ## Read-only by construction
 *
 * This file imports nothing that can write a strategy, a version, a trade or a
 * result — the only rows it touches are `ai_interactions`, written through
 * `runInteraction`, which is the log itself. §10.6 makes that a legal boundary
 * and `post-mortem.test.ts` pins it (`W7-10`).
 *
 * ## Completed windows only
 *
 * A RUNNING test has nothing to explain yet, and §7.11's rule about premature
 * numbers applies doubly to premature narratives. An ABANDONED test already
 * carries the one explanation that matters — the reason its author gave when
 * stopping, written at the time (`W17`'s principle: reconstructions are kind
 * to the reconstructor). The machine post-mortem is for windows that ran their
 * full length.
 *
 * ## Pressing again returns the record
 *
 * Same shape as the attack report (`W18-12`): the first live, valid
 * post-mortem under the current prompt version is what every later press
 * returns. Not because a second opinion is expensive — because two slightly
 * different narratives of the same fixed record invite choosing the kinder
 * one, which is the exact behaviour this product exists to refuse.
 */

export type PostMortemResponse = {
  readonly interactionId: string;
  readonly modelId: string;
  /** False when no provider is configured — the screen says so and stops. */
  readonly live: boolean;
  /** True when an already-recorded post-mortem was returned unchanged. */
  readonly reused: boolean;
  readonly view: PostMortemView | null;
};

export async function runPostMortem(input: {
  forwardTestId: string;
}): Promise<ActionResult<PostMortemResponse>> {
  try {
    const { user } = await requireUser();

    const row = await loadForwardTestForUser(input.forwardTestId, user.id);
    if (!row) return { ok: false, error: "No such forward test." };

    const { test } = row;
    if (test.status !== "COMPLETED") {
      return {
        ok: false,
        error:
          test.status === "ABANDONED"
            ? "An abandoned test's explanation is the reason you recorded when stopping it."
            : "The window is still open. A post-mortem of a test that has not finished would be a prediction.",
      };
    }

    const facts = await assembleFacts({ row, userId: user.id });

    // The record wins over a fresh narrative — see the module note.
    const existing = await latestPostMortemForTest(test.id, user.id);
    if (existing && existing.promptVersion === POST_MORTEM_PROMPT_VERSION) {
      const validated = validatePostMortem(existing.output, { tradeCount: facts.outcome.tradeCount });
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
      // A recorded row that fails the current gate is left where it is —
      // append-only — and a fresh call proceeds below.
    }

    const logged = await runInteraction({
      userId: user.id,
      contextType: "POST_MORTEM",
      promptVersion: POST_MORTEM_PROMPT_VERSION,
      input: buildPostMortemInput(facts),
      subject: { forwardTestId: test.id, strategyVersionId: test.strategyVersionId },
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

    // Recorded first, gated second: an answer that fails here stays in the
    // log — the call happened — but is never rendered (§8.7).
    const validated = validatePostMortem(logged.output, { tradeCount: facts.outcome.tradeCount });
    if (validated.status === "INVALID") {
      return {
        ok: false,
        error:
          "The model's answer did not pass the no-verdict gate and was not shown. " +
          "The call is on the record; run it again.",
      };
    }

    revalidatePath(`/forward-tests/${test.id}`);
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
      error: error instanceof Error ? error.message : "The post-mortem could not be run.",
    };
  }
}

/**
 * Every figure the model sees, read from the record. Nothing here computes a
 * new number — `final_results` was written once at completion and is quoted
 * as recorded, which is what makes the narrative checkable against the page.
 */
async function assembleFacts(input: {
  row: NonNullable<Awaited<ReturnType<typeof loadForwardTestForUser>>>;
  userId: string;
}): Promise<PostMortemFacts> {
  const { test } = input.row;
  const definition = input.row.definition as StrategyDefinition;
  const rules = resolveDefinition(definition);
  const costModel = test.costModel as CostModel;

  const results = (test.finalResults ?? {}) as {
    netReturnPercent?: number;
    maxDrawdownPercent?: number;
    hitRatePercent?: number;
    avgWinPaise?: number;
    avgLossPaise?: number;
    tradeCount?: number;
    exposurePercent?: number;
    sampleAdequate?: boolean;
  };

  const trades = (await tradesForForwardTest(test.id)).slice(0, 50).map((t) => ({
    symbol: t.symbol,
    entryDate: isoDate(t.entryAt),
    entryPrice: t.entryPrice,
    exitDate: t.exitAt ? isoDate(t.exitAt) : null,
    exitPrice: t.exitPrice,
    netPnlPaise: t.netPnlPaise,
  }));

  const backtestRow = await latestRunForVersion(test.strategyVersionId, input.userId);
  const backtestResults = (backtestRow?.results ?? null) as {
    netReturnPercent?: number;
    tradeCount?: number;
    maxDrawdownPercent?: number;
  } | null;

  return {
    hypothesis: {
      declared: test.declaredHypothesis,
      declaredOn: isoDate(test.createdAt),
    },
    window: {
      startedOn: isoDate(test.startedAt ?? test.createdAt),
      endedOn: isoDate(test.endedAt ?? test.createdAt),
      plannedSessions: test.plannedSessions,
      initialCapitalPaise: test.initialCapitalPaise,
    },
    rules: {
      entry: describeCondition(rules.entry),
      exit: describeCondition(rules.exit),
      stopLoss: `${rules.stopLossPercent}% below entry`,
      sizing: describeSizing(rules.sizing),
      instruments: rules.instruments,
      timeframe: definition.timeframe ?? "DAILY",
    },
    costs: {
      segment: costModel.segment,
      slippagePercent: costModel.slippagePercent,
    },
    outcome: {
      netReturnPercent: results.netReturnPercent ?? 0,
      tradeCount: results.tradeCount ?? trades.length,
      hitRatePercent: results.hitRatePercent ?? null,
      maxDrawdownPercent: results.maxDrawdownPercent ?? 0,
      avgWinPaise: results.avgWinPaise ?? 0,
      avgLossPaise: results.avgLossPaise ?? 0,
      exposurePercent: results.exposurePercent ?? 0,
      /**
       * §8.12, stated rather than inferred. Absent on rows written before the
       * metric existed — absent reads as inadequate, because "not measured"
       * must never render as "measured, and it was fine".
       */
      sampleAdequate: results.sampleAdequate ?? false,
    },
    trades,
    backtest:
      backtestRow && backtestResults
        ? {
            periodStart: isoDate(backtestRow.periodStart),
            periodEnd: isoDate(backtestRow.periodEnd),
            netReturnPercent: backtestResults.netReturnPercent ?? 0,
            tradeCount: backtestResults.tradeCount ?? 0,
            maxDrawdownPercent: backtestResults.maxDrawdownPercent ?? 0,
          }
        : null,
  };
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
