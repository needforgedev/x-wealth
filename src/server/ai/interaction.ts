import { and, eq } from "drizzle-orm";

import { db, type Database } from "@/db";
import { aiInteractions, type AiInteractionContext, type AiOutput } from "@/db/schema";

import type { AiProvider } from "./provider";
import { resolveProvider } from "./registry";

/**
 * Every AI call, logged before its output is shown to anyone. `plan.md` W15-03.
 *
 * ## The rule, and why it is shaped this way
 *
 * `CLAUDE.md` §3 fact 2: the human authors the strategy, we do not. The
 * evidence for that claim is `ai_interactions` — what the model was shown, what
 * it returned, and what the user chose to do next. Reg 16C is why it has to be
 * evidence rather than telemetry.
 *
 * So: **a call whose log did not write is a call that did not happen, and
 * nothing is allowed to have seen its output.** Not "log it afterwards", not
 * "log it best-effort and carry on" — either would produce output in front of a
 * user with no record that a model produced it, which is the one state this
 * table exists to make impossible.
 *
 * ## Why the row is written after the call rather than before
 *
 * The obvious reading of "log first" is to insert on the way in and fill the
 * output in on the way out. That cannot work here: `ai_interactions` is
 * append-only, so the second write would be an UPDATE the trigger refuses, and
 * relaxing the trigger to permit it would put the recorded output back under
 * the caller's control.
 *
 * The invariant that actually matters is not *when the INSERT happens* but
 * *what a caller can hold*. `runInteraction` is the only way to reach a
 * provider from application code, and it does not return until the row is
 * committed. There is no ordering in which output escapes without its log.
 *
 * That is also why `AiLogError` carries no output. An error is a value a caller
 * can inspect, and an error carrying the model's answer would be a way to read
 * an unlogged response — the leak, wearing a different shape.
 *
 * ## Transactions
 *
 * `interactionLog()` binds to the pooled handle, so the row commits on its own.
 * A caller may pass an executor, and a verification script does exactly that to
 * roll its writes back — but application code must not enclose this in a
 * transaction it might abort, because a rolled-back log with the output already
 * returned is the failure this module exists to prevent, reached the long way
 * round.
 */

/** A live handle or an open transaction — the same seam `advance.ts` uses. */
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

export class AiLogError extends Error {}

/** What gets recorded. There is no field here the model controls. */
export type NewInteraction = {
  readonly userId: string;
  readonly contextType: AiInteractionContext;
  readonly inputSnapshot: Readonly<Record<string, unknown>>;
  readonly output: AiOutput;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly strategyVersionId: string | null;
  readonly forwardTestId: string | null;
};

/**
 * The two statements this module issues, and nothing else.
 *
 * A narrow port rather than a database handle, for the same reason
 * `MarketDataSource` is one: the property under test is an ordering — output is
 * not returned until the record is durable — and proving it means being able to
 * make the record fail. Against a real table that path is unreachable.
 */
export interface InteractionLog {
  record(row: NewInteraction): Promise<{ id: string; createdAt: Date }>;

  /**
   * The one permitted mutation. Returns false when no row matched, which means
   * the id is wrong or belongs to someone else.
   *
   * A second, conflicting write is refused by the trigger rather than by a
   * condition here, so the database stays the arbiter of what "already
   * recorded" means. An identical repeat changes nothing and raises nothing.
   */
  markActed(input: {
    readonly interactionId: string;
    readonly userId: string;
    readonly resultingVersionId: string | null;
  }): Promise<boolean>;
}

export function interactionLog(tx: Executor = db()): InteractionLog {
  return {
    async record(row) {
      const [inserted] = await tx
        .insert(aiInteractions)
        .values({
          userId: row.userId,
          contextType: row.contextType,
          inputSnapshot: row.inputSnapshot,
          output: row.output,
          modelId: row.modelId,
          promptVersion: row.promptVersion,
          strategyVersionId: row.strategyVersionId,
          forwardTestId: row.forwardTestId,
        })
        .returning({ id: aiInteractions.id, createdAt: aiInteractions.createdAt });

      if (!inserted) throw new AiLogError("The interaction log returned no row.");
      return inserted;
    },

    async markActed({ interactionId, userId, resultingVersionId }) {
      const rows = await tx
        .update(aiInteractions)
        .set({ userActed: true, resultingVersionId })
        .where(and(eq(aiInteractions.id, interactionId), eq(aiInteractions.userId, userId)))
        .returning({ id: aiInteractions.id });

      return rows.length > 0;
    },
  };
}

export type LoggedInteraction = {
  readonly interactionId: string;
  readonly modelId: string;
  readonly output: AiOutput;
  readonly createdAt: Date;
};

/**
 * Run one AI call and record it. The only route from application code to a
 * provider.
 *
 * Throws `AiProviderError` if the model call failed — nothing happened, and
 * there is nothing to record. Throws `AiLogError` if the model answered but the
 * record did not write; the output is discarded rather than returned, because
 * an answer nobody can prove we asked for is worse than no answer.
 */
export async function runInteraction(input: {
  readonly userId: string;
  readonly contextType: AiInteractionContext;
  readonly promptVersion: string;
  readonly input: Readonly<Record<string, unknown>>;
  /**
   * What the call is about. The migration's CHECKs decide which contexts may
   * carry which — a HYPOTHESIS may name neither, a POST_MORTEM must name its
   * test — so passing the wrong one is rejected by the database rather than
   * quietly stored.
   */
  readonly subject?: {
    readonly strategyVersionId?: string | null;
    readonly forwardTestId?: string | null;
  };
  /**
   * Both default to the real thing, so an ordinary call site names neither and
   * therefore cannot hold a provider. Tests pass them; nothing else should.
   */
  readonly provider?: AiProvider;
  readonly log?: InteractionLog;
}): Promise<LoggedInteraction> {
  const provider = input.provider ?? resolveProvider();
  const log = input.log ?? interactionLog();

  const response = await provider.complete({
    contextType: input.contextType,
    promptVersion: input.promptVersion,
    input: input.input,
  });

  let recorded: { id: string; createdAt: Date };
  try {
    recorded = await log.record({
      userId: input.userId,
      contextType: input.contextType,
      inputSnapshot: input.input,
      output: response.output,
      // From the response, never from the caller. See `AiResponse.modelId`.
      modelId: response.modelId,
      promptVersion: input.promptVersion,
      strategyVersionId: input.subject?.strategyVersionId ?? null,
      forwardTestId: input.subject?.forwardTestId ?? null,
    });
  } catch (cause) {
    // Deliberately carries no output. See the module note.
    throw new AiLogError(
      `The model answered but the interaction could not be recorded, so the ` +
        `output was discarded (${input.contextType}).`,
      { cause },
    );
  }

  return {
    interactionId: recorded.id,
    modelId: response.modelId,
    output: response.output,
    createdAt: recorded.createdAt,
  };
}

/**
 * Record that the user acted on an interaction, and what they authored if
 * anything.
 *
 * This is the human half of the evidence. `resultingVersionId` points at a row
 * `strategy_versions` accepted on its own terms — six mandatory components,
 * CHECK and all — so nothing here can author a strategy, only name one that was
 * already authored (`CLAUDE.md` §8.6).
 */
export async function recordUserActed(input: {
  readonly interactionId: string;
  readonly userId: string;
  readonly resultingVersionId?: string | null;
  readonly log?: InteractionLog;
}): Promise<boolean> {
  return (input.log ?? interactionLog()).markActed({
    interactionId: input.interactionId,
    userId: input.userId,
    resultingVersionId: input.resultingVersionId ?? null,
  });
}
